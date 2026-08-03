import { Prisma } from "@prisma/client";
import { Router } from "express";
import { applyRecipientEvent } from "../emails/sendService.js";
import { withRole } from "../permissions/rls.js";
import {
  mapMailgunEventToStatus,
  MailgunConfigError,
  verifyMailgunSignature,
} from "../integrations/mailgun.js";
import { CrispConfigError, parseCrispInbound, verifyCrispSignature } from "../integrations/crisp.js";
import {
  parseWhatsappInbound,
  verifyWebhookChallenge,
  verifyWhatsappSignature,
  WhatsappConfigError,
} from "../integrations/whatsapp.js";
import { StripeConfigError, verifyStripeSignature } from "../integrations/stripe.js";
import { handleStripeEvent } from "../billing/inboundStripe.js";

/**
 * Provider webhooks (Phase 4 ii-b). These are PUBLIC endpoints — no authContext,
 * no CRM user — so each provider authenticates itself (Mailgun: HMAC signature).
 * Writes run under the INTEGRATION system role so RLS still governs them.
 *
 * Idempotency: every event is claimed once in webhook_events (unique per
 * provider+externalId) inside the same transaction as the resulting update, so a
 * redelivered event (Mailgun retries at-least-once) never double-applies — and a
 * failed update rolls back the claim too, so the retry can reprocess.
 */
const router: Router = Router();

// ---------------------------------------------------------------------------
// Shared inbound ingestion — one visitor/customer message from any channel.
// Idempotent per (provider, externalId) via the webhook_events ledger; upserts
// the thread by externalThreadId + channel and appends the message. Callers wrap
// this in withRole("INTEGRATION") so RLS governs the writes.
// ---------------------------------------------------------------------------
interface IngestInput {
  provider: string;
  channel: string;
  externalThreadId: string;
  externalId: string;
  content: string;
  timestamp?: Date;
}

async function ingestInbound(
  tx: Prisma.TransactionClient,
  o: IngestInput,
): Promise<{ duplicate: boolean; conversationId?: string }> {
  const already = await tx.webhookEvent.findUnique({
    where: { provider_externalId: { provider: o.provider, externalId: o.externalId } },
  });
  if (already) return { duplicate: true };
  await tx.webhookEvent.create({
    data: { provider: o.provider, externalId: o.externalId, eventType: "message" },
  });

  const now = o.timestamp ?? new Date();
  const existing = await tx.conversation.findFirst({
    where: { externalThreadId: o.externalThreadId, channel: o.channel },
  });
  const thread =
    existing ??
    (await tx.conversation.create({
      data: {
        channel: o.channel,
        status: "open",
        sensitivityClass: "general",
        externalThreadId: o.externalThreadId,
      },
    }));

  await tx.message.create({
    data: {
      conversationId: thread.id,
      channel: o.channel,
      direction: "inbound",
      body: o.content,
      provider: o.provider,
      providerMessageId: o.externalId,
      sensitivityClass: thread.sensitivityClass,
      activityTimestamp: now,
    },
  });
  await tx.conversation.update({
    where: { id: thread.id },
    data: {
      status: "open",
      lastMessageAt: now,
      lastMessagePreview: o.content.slice(0, 280),
      messageCount: { increment: 1 },
    },
  });
  return { duplicate: false, conversationId: thread.id };
}

/** Apply a provider delivery status (sent/delivered/read/failed) to the message
 *  it references. Idempotent — a repeated status just re-sets the same value. */
async function applyDeliveryStatus(
  tx: Prisma.TransactionClient,
  provider: string,
  providerMessageId: string,
  status: string,
): Promise<boolean> {
  const msg = await tx.message.findFirst({ where: { provider, providerMessageId } });
  if (!msg) return false;
  await tx.message.update({ where: { id: msg.id }, data: { deliveryStatus: status } });
  return true;
}

interface MailgunWebhookBody {
  signature?: { timestamp?: string; token?: string; signature?: string };
  "event-data"?: {
    id?: string;
    event?: string;
    recipient?: string;
    url?: string;
    /** `permanent` | `temporary` on a `failed` event — a temporary failure is a retry, not a bounce. */
    severity?: string;
    reason?: string;
    "delivery-status"?: { message?: string; description?: string; code?: number };
    "user-variables"?: Record<string, unknown>;
    message?: { headers?: { "message-id"?: string } };
  };
}

/**
 * Apply a Mailgun event to one email_recipients row.
 *
 * `v:crm_message_id` carries the recipient's `trackingToken` (see
 * emailRouter.dispatch), so one unique lookup resolves the row. Returns false
 * when the token belongs to no recipient, which lets the caller fall through to
 * the conversation-Message path.
 *
 * Idempotency is the webhook_events ledger's job, not this function's — the
 * caller has already claimed the event id by the time we get here.
 */
async function applyMailgunToRecipient(
  tx: Prisma.TransactionClient,
  trackingToken: string,
  data: NonNullable<MailgunWebhookBody["event-data"]>,
): Promise<boolean> {
  const r = await tx.emailRecipient.findUnique({ where: { trackingToken } });
  if (!r) return false;

  const event = data.event ?? "";
  const reason =
    data.reason ??
    data["delivery-status"]?.message ??
    data["delivery-status"]?.description ??
    null;

  switch (event) {
    case "delivered":
      await applyRecipientEvent(tx, r.id, "delivered");
      return true;
    case "opened":
      await applyRecipientEvent(tx, r.id, "opened");
      return true;
    case "clicked":
      await applyRecipientEvent(tx, r.id, "clicked");
      return true;

    // Mailgun refused the message outright — treat as a hard bounce.
    case "rejected":
      await applyRecipientEvent(tx, r.id, "bounced");
      return true;

    // `failed` is only a bounce when it's PERMANENT. A temporary failure means
    // Mailgun will retry, and marking it bounced would both overstate the bounce
    // rate and permanently exclude an address that may yet deliver.
    case "failed":
      if ((data.severity ?? "").toLowerCase() === "permanent") {
        await applyRecipientEvent(tx, r.id, "bounced");
        if (reason) {
          await tx.emailRecipient.update({ where: { id: r.id }, data: { failureReason: reason } });
        }
      } else {
        await tx.emailRecipient.update({
          where: { id: r.id },
          data: { status: "failed", failureReason: reason },
        });
      }
      return true;

    // A spam complaint or a provider-side unsubscribe must suppress the CONTACT,
    // not just annotate the row: contacts.emailOptOut is what audience.ts checks,
    // so this is what stops the next campaign mailing them. Same flag our own
    // one-click unsubscribe sets.
    case "complained":
    case "unsubscribed":
      await tx.emailRecipient.update({
        where: { id: r.id },
        data: { status: event === "complained" ? "complained" : "unsubscribed" },
      });
      if (r.contactId) {
        await tx.contact.update({ where: { id: r.contactId }, data: { emailOptOut: true } });
      }
      return true;

    // accepted / stored / other informational events: the row is already 'sent'.
    default:
      return true;
  }
}

router.post("/webhooks/mailgun", async (req, res) => {
  const body = req.body as MailgunWebhookBody;
  const sig = body?.signature;
  const data = body?.["event-data"];
  if (!sig || !data) {
    res.status(400).json({ error: "malformed_webhook" });
    return;
  }

  // 1. Authenticate the sender.
  let ok: boolean;
  try {
    ok = verifyMailgunSignature({
      timestamp: sig.timestamp ?? "",
      token: sig.token ?? "",
      signature: sig.signature ?? "",
    });
  } catch (err) {
    if (err instanceof MailgunConfigError) {
      res.status(503).json({ error: "mailgun_not_configured" });
      return;
    }
    throw err;
  }
  if (!ok) {
    res.status(406).json({ error: "bad_signature" });
    return;
  }

  const eventId = data.id;
  const eventType = data.event ?? "unknown";
  if (!eventId) {
    res.status(400).json({ error: "missing_event_id" });
    return;
  }
  const crmMessageId = data["user-variables"]?.["crm_message_id"];
  const status = mapMailgunEventToStatus(eventType);
  const url = data.url ?? null;

  // 2. Idempotent claim + apply, atomically, as the INTEGRATION actor.
  try {
    const result = await withRole("INTEGRATION", async (tx) => {
      const already = await tx.webhookEvent.findUnique({
        where: { provider_externalId: { provider: "mailgun", externalId: eventId } },
      });
      if (already) return { duplicate: true, matched: false };

      await tx.webhookEvent.create({
        data: { provider: "mailgun", externalId: eventId, eventType },
      });

      if (typeof crmMessageId !== "string" || crmMessageId.length === 0) {
        return { duplicate: false, matched: false };
      }

      // Two senders share this webhook and both round-trip their correlation id
      // in v:crm_message_id: conversations pass a Message id, the email object
      // passes a recipient trackingToken. Try the email object first — its lookup
      // is on a unique column and cannot collide with a cuid Message id.
      if (await applyMailgunToRecipient(tx, crmMessageId, data)) {
        return { duplicate: false, matched: true };
      }

      const msg = await tx.message.findUnique({ where: { id: crmMessageId } });
      if (!msg) return { duplicate: false, matched: false };

      // Raw UPDATEs with COALESCE: open_count/click_count are nullable with no
      // default, and Prisma's { increment } compiles to `col = col + 1`, which is
      // NULL + 1 = NULL for a first event. COALESCE(col, 0) + 1 seeds it at 0.
      if (eventType === "opened") {
        await tx.$executeRaw`UPDATE messages SET delivery_status = ${status}, open_count = COALESCE(open_count, 0) + 1 WHERE id = ${crmMessageId}`;
      } else if (eventType === "clicked") {
        await tx.$executeRaw`UPDATE messages SET delivery_status = ${status}, click_count = COALESCE(click_count, 0) + 1, link_clicked = ${url} WHERE id = ${crmMessageId}`;
      } else {
        await tx.$executeRaw`UPDATE messages SET delivery_status = ${status} WHERE id = ${crmMessageId}`;
      }
      return { duplicate: false, matched: true };
    });

    // Always 200 on a handled event (incl. duplicates and unmatched) so Mailgun
    // stops retrying; transient failures fall through to the catch → 5xx.
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    // Unique-race on the ledger (two concurrent deliveries) → treat as duplicate.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    // Let a real error surface as 5xx so Mailgun retries (the claim rolled back).
    throw err;
  }
});

// ---------------------------------------------------------------------------
// Crisp (support live chat) inbound webhook.
// ---------------------------------------------------------------------------
router.post("/webhooks/crisp", async (req, res) => {
  const timestamp = req.header("x-crisp-request-timestamp") ?? "";
  const signature = req.header("x-crisp-signature") ?? "";
  const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";

  // 1. Authenticate (HMAC over `timestamp;rawBody`).
  let ok: boolean;
  try {
    ok = verifyCrispSignature({ timestamp, rawBody, signature });
  } catch (err) {
    if (err instanceof CrispConfigError) {
      res.status(503).json({ error: "crisp_not_configured" });
      return;
    }
    throw err;
  }
  if (!ok) {
    res.status(406).json({ error: "bad_signature" });
    return;
  }

  // 2. Only visitor-sent messages become CRM messages; ack everything else.
  const inbound = parseCrispInbound(req.body);
  if (!inbound) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  // 3. Idempotent claim + upsert thread + insert message, as the INTEGRATION
  // actor. Support chat is general-sensitivity.
  try {
    const result = await withRole("INTEGRATION", (tx) =>
      ingestInbound(tx, {
        provider: "crisp",
        channel: "webchat",
        externalThreadId: inbound.sessionId,
        externalId: inbound.fingerprint,
        content: inbound.content,
      }),
    );
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    throw err; // 5xx → Crisp retries (the claim rolled back)
  }
});

// ---------------------------------------------------------------------------
// WhatsApp (Meta Cloud API) — GET subscription handshake + POST events.
// ---------------------------------------------------------------------------
router.get("/webhooks/whatsapp", (req, res) => {
  try {
    const challenge = verifyWebhookChallenge(
      req.query["hub.mode"] as string | undefined,
      req.query["hub.verify_token"] as string | undefined,
      req.query["hub.challenge"] as string | undefined,
    );
    if (challenge === null) {
      res.status(403).json({ error: "verification_failed" });
      return;
    }
    res.status(200).send(challenge); // echo the raw challenge string
  } catch (err) {
    if (err instanceof WhatsappConfigError) {
      res.status(503).json({ error: "whatsapp_not_configured" });
      return;
    }
    throw err;
  }
});

router.post("/webhooks/whatsapp", async (req, res) => {
  const signature = req.header("x-hub-signature-256") ?? "";
  const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";

  // 1. Authenticate (HMAC-SHA256 over the raw body with the app secret).
  let ok: boolean;
  try {
    ok = verifyWhatsappSignature(signature, rawBody);
  } catch (err) {
    if (err instanceof WhatsappConfigError) {
      res.status(503).json({ error: "whatsapp_not_configured" });
      return;
    }
    throw err;
  }
  if (!ok) {
    res.status(401).json({ error: "bad_signature" });
    return;
  }

  // 2. Ingest each inbound message + apply each delivery status. A single POST
  // may batch several; each is its own tx so one duplicate can't abort the rest.
  const parsed = parseWhatsappInbound(req.body);
  let ingested = 0;
  let duplicates = 0;

  for (const m of parsed.messages) {
    try {
      const r = await withRole("INTEGRATION", (tx) =>
        ingestInbound(tx, {
          provider: "whatsapp",
          channel: "whatsapp",
          externalThreadId: m.waId,
          externalId: m.wamid,
          content: m.content,
          timestamp: m.timestamp,
        }),
      );
      if (r.duplicate) duplicates++;
      else ingested++;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        duplicates++;
      } else {
        throw err; // 5xx → Meta retries
      }
    }
  }

  for (const s of parsed.statuses) {
    await withRole("INTEGRATION", (tx) => applyDeliveryStatus(tx, "whatsapp", s.wamid, s.status)).catch(
      () => undefined,
    );
  }

  res.status(200).json({ ok: true, ingested, duplicates, statuses: parsed.statuses.length });
});

// ---------------------------------------------------------------------------
// Stripe billing webhook (Phase X-Stripe). PUBLIC + signed (Stripe-Signature =
// `t=..,v1=HMAC-SHA256(secret, `${t}.${rawBody}`)`). Writes under INTEGRATION,
// idempotent per Stripe event id via webhook_events.
// ---------------------------------------------------------------------------
router.post("/webhooks/stripe", async (req, res) => {
  const signature = req.header("stripe-signature") ?? "";
  const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";

  let ok: boolean;
  try {
    ok = verifyStripeSignature(rawBody, signature);
  } catch (err) {
    if (err instanceof StripeConfigError) {
      res.status(503).json({ error: "stripe_not_configured" });
      return;
    }
    throw err;
  }
  if (!ok) {
    res.status(406).json({ error: "bad_signature" });
    return;
  }

  const event = req.body as { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    const result = await withRole("INTEGRATION", (tx) => handleStripeEvent(tx, event));
    if (result.status) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(200).json({ ok: true, ...result });
    return;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    throw err; // 5xx → Stripe retries (the claim rolled back)
  }
});

export default router;

import { Prisma } from "@prisma/client";
import { Router } from "express";
import { basisForCode, type BillingSensitivity } from "@yachtway/shared";
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
import { MakeConfigError, verifyMakeSignature } from "../integrations/make.js";
import { invoiceResourceClass, logInvoiceActivity } from "../billing/invoiceService.js";
import {
  handleCreditNote,
  handleInvoiceStatus,
  handlePayment,
  type InboundXeroBody,
} from "../billing/inboundXero.js";
import { StripeConfigError, verifyStripeSignature } from "../integrations/stripe.js";
import { handleStripeEvent } from "../billing/inboundStripe.js";
import { writeAudit } from "../audit.js";

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
    "user-variables"?: Record<string, unknown>;
    message?: { headers?: { "message-id"?: string } };
  };
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
// Xero-via-Make callback (Phase X1). Make posts the result of creating the
// invoice in Xero (or an error). Signed with MAKE_INBOUND_SECRET (HMAC over the
// raw body). Writes run under INTEGRATION so RLS still governs them; idempotent
// via webhook_events. (Payment/credit-note events arrive in Phase X2.)
// ---------------------------------------------------------------------------
interface XeroCallbackBody {
  event_type?: string; // "invoice_result" (default) | "item"
  crm_invoice_id?: string;
  status?: string; // "sent" | "authorised" | "failed"
  xero_invoice_id?: string;
  xero_invoice_number?: string;
  xero_contact_id?: string;
  online_invoice_url?: string;
  amount_due?: number;
  due_date?: string;
  error?: string;
  /** itemized studio: resolved per-line amounts keyed by the crm_line_id we sent */
  lines?: { crm_line_id?: string; line_amount?: number }[];
  /** event_type === "item": Xero Products & Services catalog sync (Scenario C) */
  xero_item_id?: string;
  code?: string;
  name?: string;
  description?: string;
  unit_price?: number;
  account_code?: string;
  tax_type?: string;
  active?: boolean;
}

router.post("/webhooks/xero", async (req, res) => {
  const signature = req.header("x-make-signature") ?? "";
  const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";

  // 1. Authenticate (HMAC-SHA256 over the raw body).
  let ok: boolean;
  try {
    ok = verifyMakeSignature(rawBody, signature);
  } catch (err) {
    if (err instanceof MakeConfigError) {
      res.status(503).json({ error: "make_not_configured" });
      return;
    }
    throw err;
  }
  if (!ok) {
    res.status(406).json({ error: "bad_signature" });
    return;
  }

  const body = req.body as XeroCallbackBody;

  // Product & Services catalog sync (Make Scenario C). Upsert the CRM Product by
  // Xero item id; the per-foot quantity basis comes from the shared FOOT_CODES
  // map (Xero doesn't carry it). Reference data — no webhook_events ledger needed
  // (upsert is naturally idempotent).
  if (body.event_type === "item") {
    if (!body.xero_item_id && !body.code) {
      res.status(400).json({ error: "missing_item_key" });
      return;
    }
    await withRole("INTEGRATION", async (tx) => {
      const data = {
        productCode: body.code ?? null,
        name: body.name ?? null,
        description: body.description ?? null,
        listPrice: body.unit_price ?? null,
        accountCode: body.account_code ?? null,
        taxType: body.tax_type ?? null,
        quantityBasis: basisForCode(body.code),
        orgKey: "yachtway",
        active: body.active ?? true,
      };
      if (body.xero_item_id) {
        await tx.product.upsert({
          where: { xeroItemId: body.xero_item_id },
          create: { xeroItemId: body.xero_item_id, ...data },
          update: data,
        });
      } else {
        const existing = await tx.product.findFirst({ where: { productCode: body.code! } });
        if (existing) await tx.product.update({ where: { id: existing.id }, data });
        else await tx.product.create({ data });
      }
    });
    res.status(200).json({ ok: true, synced: "item" });
    return;
  }

  // Inbound Xero events (Make Scenario B, Phase X2): payments, credit notes,
  // invoice-status changes. Each runs under INTEGRATION, idempotent via the ledger.
  if (body.event_type === "payment" || body.event_type === "credit_note" || body.event_type === "invoice_status") {
    const ib = req.body as InboundXeroBody;
    try {
      const result = await withRole("INTEGRATION", (tx) =>
        body.event_type === "payment"
          ? handlePayment(tx, ib)
          : body.event_type === "credit_note"
            ? handleCreditNote(tx, ib)
            : handleInvoiceStatus(tx, ib),
      );
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
      throw err; // 5xx → Make retries (the claim rolled back)
    }
  }

  const crmInvoiceId = body.crm_invoice_id;
  if (!crmInvoiceId) {
    res.status(400).json({ error: "missing_crm_invoice_id" });
    return;
  }

  const failed = body.status === "failed" || Boolean(body.error);
  const newStatus = failed ? "failed" : "sent";
  // Stable idempotency key: the Xero invoice id when present, else invoice+status.
  const externalId = body.xero_invoice_id ?? `${crmInvoiceId}:${newStatus}`;

  try {
    const result = await withRole("INTEGRATION", async (tx) => {
      const already = await tx.webhookEvent.findUnique({
        where: { provider_externalId: { provider: "xero", externalId } },
      });
      if (already) return { duplicate: true, matched: false };
      await tx.webhookEvent.create({
        data: { provider: "xero", externalId, eventType: body.event_type ?? "invoice_result" },
      });

      const inv = await tx.invoice.findUnique({ where: { id: crmInvoiceId } });
      if (!inv) return { duplicate: false, matched: false };

      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          status: newStatus,
          ...(body.xero_invoice_id ? { xeroInvoiceId: body.xero_invoice_id } : {}),
          ...(body.xero_invoice_number ? { xeroInvoiceNumber: body.xero_invoice_number } : {}),
          ...(body.xero_contact_id ? { xeroContactId: body.xero_contact_id } : {}),
          ...(body.online_invoice_url ? { onlineInvoiceUrl: body.online_invoice_url } : {}),
          ...(body.amount_due != null ? { amountDue: body.amount_due } : {}),
          ...(body.due_date ? { dueDate: new Date(body.due_date) } : {}),
          syncError: failed ? (body.error ?? "unknown_error").slice(0, 500) : null,
        },
      });

      // Itemized studio: write Xero-resolved per-line amounts back onto our lines.
      if (Array.isArray(body.lines)) {
        for (const l of body.lines) {
          if (l.crm_line_id && l.line_amount != null) {
            await tx.opportunityLineItem
              .update({ where: { id: l.crm_line_id }, data: { totalPrice: l.line_amount } })
              .catch(() => undefined);
          }
        }
      }

      // Cache the resolved Xero contact id on the billed company for reuse.
      if (body.xero_contact_id && inv.companyId) {
        await tx.company.update({
          where: { id: inv.companyId },
          data: { xeroContactId: body.xero_contact_id },
        }).catch(() => undefined);
      }

      if (!failed) {
        await logInvoiceActivity(tx, {
          event: "sent",
          invoiceId: inv.id,
          companyId: inv.companyId,
          contactId: inv.contactId,
          sensitivityClass: inv.sensitivityClass,
          detail: body.xero_invoice_number ?? undefined,
        }).catch(() => undefined);
      }

      await writeAudit(tx, {
        actorRole: "INTEGRATION",
        action: "update",
        resourceClass: invoiceResourceClass(inv.sensitivityClass as BillingSensitivity),
        tableName: "invoices",
        recordId: inv.id,
        before: { status: inv.status },
        after: { status: newStatus, xeroInvoiceId: body.xero_invoice_id ?? null },
      }).catch(() => undefined);

      return { duplicate: false, matched: true, status: newStatus };
    });

    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    throw err; // 5xx → Make retries (the claim rolled back)
  }
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

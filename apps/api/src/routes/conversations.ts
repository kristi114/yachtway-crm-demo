import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { Router } from "express";
import {
  can,
  ConversationCreateSchema,
  ConversationListQuerySchema,
  ConversationUpdateSchema,
  MarkReadSchema,
  MessageCreateSchema,
  type ResourceClass,
} from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorizeAny } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { loadEffectivePermissions } from "../permissions/service.js";
import { mailgunSendConfigured, sendMailgunMessage } from "../integrations/mailgun.js";
import { crispSendConfigured, sendCrispMessage } from "../integrations/crisp.js";
import { sendWhatsappMessage, whatsappSendConfigured } from "../integrations/whatsapp.js";

/**
 * Conversations (Phase 4, increment i) — threaded messaging, permission-aware.
 *
 * A conversation carries a sensitivityClass; Postgres RLS gates the thread, its
 * messages, and its read-state rows per-row by that class (see rls.sql). So the
 * API mostly leans on RLS: a rep's list simply won't contain financing threads,
 * and a direct fetch of one returns 404 (RLS yields no row) — existence is never
 * leaked. Endpoints gate on `conversations.general OR conversations.financing`
 * because a role may hold only one (rep: general; Fintech: financing).
 *
 * Increment i is CRM-native: no external channel wiring yet. Posting a message
 * records it and rolls the thread's summary forward; the Make inbound webhook,
 * pg-boss queue, and outbound delivery callback are the next increment.
 */
const router: Router = Router();
router.use(authContext);

const CONV_CLASSES: ResourceClass[] = ["conversations.general", "conversations.financing"];

/** Message fields surfaced by the API (lean projection of the messages table). */
const messageSelect = {
  id: true,
  conversationId: true,
  direction: true,
  channel: true,
  body: true,
  deliveryStatus: true,
  provider: true,
  providerMessageId: true,
  fromAddress: true,
  ownerId: true,
  activityTimestamp: true,
  createdAt: true,
} satisfies Prisma.MessageSelect;

/** general → conversations.general; financing/easyfund/mastercover → .financing. */
function conversationResource(sensitivityClass: string | null | undefined): ResourceClass {
  return sensitivityClass && ["financing", "easyfund", "mastercover"].includes(sensitivityClass)
    ? "conversations.financing"
    : "conversations.general";
}

/** Unread message counts for a set of threads, for one user. A message is unread
 *  when it postdates the user's last-read mark (or the thread was never opened).
 *  Runs inside the caller's role, so RLS already excludes unreadable messages. */
async function unreadCounts(
  tx: Prisma.TransactionClient,
  userId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (conversationIds.length === 0) return map;
  const rows = await tx.$queryRaw<{ conversationId: string; unread: number }[]>`
    SELECT m.conversation_id AS "conversationId", COUNT(*)::int AS unread
    FROM messages m
    LEFT JOIN conversation_read_state r
      ON r.conversation_id = m.conversation_id AND r.user_id = ${userId}
    WHERE m.conversation_id IN (${PrismaNS.join(conversationIds)})
      AND (r.last_read_at IS NULL OR COALESCE(m.activity_timestamp, m.created_at) > r.last_read_at)
    GROUP BY m.conversation_id`;
  for (const row of rows) map.set(row.conversationId, Number(row.unread));
  return map;
}

type ConvRow = { id: string; [k: string]: unknown };
function withUnread<T extends ConvRow>(rows: T[], unread: Map<string, number>) {
  return rows.map((r) => ({ ...r, unreadCount: unread.get(r.id) ?? 0 }));
}

// ---------------------------------------------------------------------------
// List / inbox
// ---------------------------------------------------------------------------
router.get("/conversations", authorizeAny(CONV_CLASSES, "read"), async (req, res) => {
  const q = ConversationListQuerySchema.parse(req.query);
  const where: Prisma.ConversationWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.channel ? { channel: q.channel } : {}),
    ...(q.assignedToId ? { assignedToId: q.assignedToId } : {}),
    ...(q.contactId ? { contactId: q.contactId } : {}),
    ...(q.companyId ? { companyId: q.companyId } : {}),
  };
  const result = await withRole(req.auth!.role, async (tx) => {
    const rows = await tx.conversation.findMany({
      where,
      take: q.limit + 1,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const unread = await unreadCounts(tx, req.auth!.userId, page.map((r) => r.id));
    return { page, hasMore, unread };
  });
  const data = withUnread(result.page, result.unread);
  res.json({ data, nextCursor: result.hasMore ? data[data.length - 1]!.id : null });
});

// ---------------------------------------------------------------------------
// Single thread + its messages
// ---------------------------------------------------------------------------
router.get("/conversations/:id", authorizeAny(CONV_CLASSES, "read"), async (req, res) => {
  const out = await withRole(req.auth!.role, async (tx) => {
    // RLS returns no row for a thread the caller can't see → treated as 404.
    const convo = await tx.conversation.findUnique({ where: { id: String(req.params.id) } });
    if (!convo) return null;
    const messages = await tx.message.findMany({
      where: { conversationId: convo.id },
      orderBy: [{ activityTimestamp: "asc" }, { createdAt: "asc" }],
      select: messageSelect,
    });
    const unread = await unreadCounts(tx, req.auth!.userId, [convo.id]);
    return { ...convo, unreadCount: unread.get(convo.id) ?? 0, messages };
  });
  if (!out) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }
  res.json(out);
});

// ---------------------------------------------------------------------------
// Create a thread
// ---------------------------------------------------------------------------
router.post("/conversations", authorizeAny(CONV_CLASSES, "write"), async (req, res) => {
  const input = ConversationCreateSchema.parse(req.body);
  // Explicit gate on the target class (RLS WITH CHECK is the backstop): a rep
  // cannot open a financing thread, Fintech cannot open a general one.
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const cls = conversationResource(input.sensitivityClass);
  if (!can(perms, cls, "write")) {
    res.status(403).json({ error: `forbidden: ${req.auth!.role} lacks write on ${cls}` });
    return;
  }
  const out = await withRole(req.auth!.role, (tx) =>
    tx.conversation.create({
      data: {
        contactId: input.contactId ?? null,
        companyId: input.companyId ?? null,
        relatedListingId: input.relatedListingId ?? null,
        channel: input.channel,
        status: input.status,
        subject: input.subject ?? null,
        assignedToId: input.assignedToId ?? null,
        sensitivityClass: input.sensitivityClass,
      },
    }),
  );
  res.status(201).json({ ...out, unreadCount: 0 });
});

// ---------------------------------------------------------------------------
// Patch a thread (routing/state)
// ---------------------------------------------------------------------------
router.patch("/conversations/:id", authorizeAny(CONV_CLASSES, "write"), async (req, res) => {
  const input = ConversationUpdateSchema.parse(req.body);
  const out = await withRole(req.auth!.role, async (tx) => {
    const convo = await tx.conversation.findUnique({ where: { id: String(req.params.id) } });
    if (!convo) return null;
    return tx.conversation.update({
      where: { id: convo.id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
      },
    });
  });
  if (!out) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }
  res.json(out);
});

// ---------------------------------------------------------------------------
// Post a message to a thread (rolls the thread summary forward)
// ---------------------------------------------------------------------------
router.post("/conversations/:id/messages", authorizeAny(CONV_CLASSES, "write"), async (req, res) => {
  const input = MessageCreateSchema.parse(req.body);

  // Provider preflight (before touching the DB). Gmail send lands in ii-a.
  if (input.provider === "gmail") {
    res.status(501).json({ error: "gmail_send_not_implemented: arrives in increment ii-a" });
    return;
  }
  if (input.provider === "mailgun") {
    if (!input.fromAddress) {
      res.status(400).json({ error: "from_address_required: mailgun send needs fromAddress" });
      return;
    }
    if (!mailgunSendConfigured()) {
      res.status(503).json({ error: "mailgun_not_configured" });
      return;
    }
  }
  if (input.provider === "crisp" && !crispSendConfigured()) {
    res.status(503).json({ error: "crisp_not_configured" });
    return;
  }
  if (input.provider === "whatsapp" && !whatsappSendConfigured()) {
    res.status(503).json({ error: "whatsapp_not_configured" });
    return;
  }

  const result = await withRole(req.auth!.role, async (tx) => {
    const convo = await tx.conversation.findUnique({ where: { id: String(req.params.id) } });
    if (!convo) return null; // hidden or missing → 404

    const now = new Date();
    // Message inherits the thread's sensitivity class so RLS gates it identically.
    // Author recorded via created_by_id (no FK); owner_id left null (auth subject
    // isn't necessarily a CRM users row). A provider send starts as "queued".
    const message = await tx.message.create({
      data: {
        conversationId: convo.id,
        channel: input.channel ?? convo.channel,
        direction: input.direction,
        body: input.body,
        fromAddress: input.fromAddress ?? null,
        ...(input.toAddress ? { toAddresses: [input.toAddress] } : {}),
        ...(input.subject ? { emailSubject: input.subject } : {}),
        provider: input.provider ?? null,
        deliveryStatus: input.provider ? "queued" : null,
        sensitivityClass: convo.sensitivityClass,
        createdById: req.auth!.userId,
        activityTimestamp: now,
      },
      select: messageSelect,
    });

    await tx.conversation.update({
      where: { id: convo.id },
      data: {
        lastMessageAt: now,
        lastMessagePreview: input.body.slice(0, 280),
        messageCount: { increment: 1 },
      },
    });
    return { message, threadExternalId: convo.externalThreadId };
  });

  if (!result) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }
  const out = result.message;

  // Log-only (no provider) → done.
  if (!input.provider) {
    res.status(201).json(out);
    return;
  }

  // Provider send happens outside the DB tx (network call); record the provider
  // id + delivery status after. A failure marks the row "failed" and returns 502.
  try {
    let providerMessageId = "";
    if (input.provider === "mailgun") {
      // crm_message_id round-trips on every tracking event → webhook correlation.
      ({ providerMessageId } = await sendMailgunMessage({
        from: input.fromAddress!,
        to: input.toAddress!,
        subject: input.subject!,
        html: input.body,
        crmMessageId: out.id,
      }));
    } else if (input.provider === "crisp") {
      // Crisp replies go back into the thread's session (externalThreadId).
      if (!result.threadExternalId) {
        res.status(400).json({ error: "no_crisp_session: thread has no Crisp session to reply to" });
        return;
      }
      ({ providerMessageId } = await sendCrispMessage({
        sessionId: result.threadExternalId,
        content: input.body,
      }));
    } else if (input.provider === "whatsapp") {
      // WhatsApp replies go to the customer's phone (thread externalThreadId =
      // wa_id). Free-form text only sends inside the 24h window; outside it Meta
      // rejects the send → caught below, message marked "failed", 502 returned.
      if (!result.threadExternalId) {
        res.status(400).json({ error: "no_whatsapp_recipient: thread has no wa_id to reply to" });
        return;
      }
      ({ providerMessageId } = await sendWhatsappMessage({
        to: result.threadExternalId,
        body: input.body,
      }));
    }

    const updated = await withRole(req.auth!.role, (tx) =>
      tx.message.update({
        where: { id: out.id },
        data: { providerMessageId, deliveryStatus: "sent" },
        select: messageSelect,
      }),
    );
    res.status(201).json(updated);
  } catch (err) {
    await withRole(req.auth!.role, (tx) =>
      tx.message.update({ where: { id: out.id }, data: { deliveryStatus: "failed" } }),
    ).catch(() => undefined);
    res.status(502).json({ error: `${input.provider}_send_failed`, detail: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Mark a thread read (per-user)
// ---------------------------------------------------------------------------
router.post("/conversations/:id/read", authorizeAny(CONV_CLASSES, "read"), async (req, res) => {
  const input = MarkReadSchema.parse(req.body);
  const readAt = input.lastReadAt ? new Date(input.lastReadAt) : new Date();
  const out = await withRole(req.auth!.role, async (tx) => {
    const convo = await tx.conversation.findUnique({ where: { id: String(req.params.id) } });
    if (!convo) return null;
    await tx.conversationReadState.upsert({
      where: { conversationId_userId: { conversationId: convo.id, userId: req.auth!.userId } },
      create: {
        conversationId: convo.id,
        userId: req.auth!.userId,
        lastReadAt: readAt,
        sensitivityClass: convo.sensitivityClass,
      },
      update: { lastReadAt: readAt, sensitivityClass: convo.sensitivityClass },
    });
    const unread = await unreadCounts(tx, req.auth!.userId, [convo.id]);
    return { ...convo, unreadCount: unread.get(convo.id) ?? 0 };
  });
  if (!out) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }
  res.json(out);
});

// ---------------------------------------------------------------------------
// Company rollup — every thread across the dealer's contacts (+ direct company
// threads). RLS still filters financing threads for callers without the grant.
// ---------------------------------------------------------------------------
router.get(
  "/companies/:id/conversations",
  authorizeAny(CONV_CLASSES, "read"),
  async (req, res) => {
    const companyId = String(req.params.id);
    const result = await withRole(req.auth!.role, async (tx) => {
      const contacts = await tx.contact.findMany({
        where: { companyId },
        select: { id: true },
      });
      const contactIds = contacts.map((c) => c.id);
      const rows = await tx.conversation.findMany({
        where: {
          OR: [
            { companyId },
            ...(contactIds.length ? [{ contactId: { in: contactIds } }] : []),
          ],
        },
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        take: 200,
      });
      const unread = await unreadCounts(tx, req.auth!.userId, rows.map((r) => r.id));
      return { rows, unread };
    });
    res.json({ data: withUnread(result.rows, result.unread), nextCursor: null });
  },
);

export default router;

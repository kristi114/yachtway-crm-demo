import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";

/**
 * Phase 4 (increment i) — Conversations.
 *
 * A Conversation is a THREAD (contact/company/channel/status/assignee) that
 * groups many Messages. Per-user read state powers unread badges, and a company
 * page rolls up threads across all of the dealer's contacts.
 *
 * Every conversation carries a `sensitivityClass`. general → conversations.general;
 * financing/easyfund/mastercover → conversations.financing. Postgres RLS gates the
 * thread, its messages, and its read-state rows per-row by that class, so a rep
 * without the financing grant never sees a financing thread (list omits it; direct
 * fetch is 404, not 403 — existence isn't leaked). This mirror is the API contract;
 * the DB is the source of truth.
 */

export const ConversationChannelSchema = z.enum([
  "email",
  "sms",
  "whatsapp",
  "call",
  "webchat",
  "note",
  "other",
]);
export type ConversationChannel = z.infer<typeof ConversationChannelSchema>;

export const ConversationStatusSchema = z.enum(["open", "pending", "snoozed", "closed"]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

/** general is the default; the three financing values all map to conversations.financing in RLS. */
export const ConversationSensitivitySchema = z.enum([
  "general",
  "financing",
  "easyfund",
  "mastercover",
]);
export type ConversationSensitivity = z.infer<typeof ConversationSensitivitySchema>;

export const MessageDirectionSchema = z.enum(["inbound", "outbound", "internal"]);
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;

/** Transport provider for an outbound send. gmail = 1:1 sales/support (ii-a);
 *  mailgun = marketing/bulk (ii-b); crisp = support live chat. Omit to just log a
 *  message without sending. */
export const MessageProviderSchema = z.enum(["gmail", "mailgun", "crisp", "whatsapp"]);
export type MessageProvider = z.infer<typeof MessageProviderSchema>;

/** Providers that send email (and therefore require a to-address + subject). */
export const EMAIL_PROVIDERS = ["gmail", "mailgun"] as const;

// ---------------------------------------------------------------------------
// Read DTOs
// ---------------------------------------------------------------------------
/** A message as surfaced by the API — a lean projection of the messages table. */
export const MessageSchema = z.object({
  id: IdSchema,
  conversationId: IdSchema.nullable(),
  direction: z.string().nullable(),
  channel: z.string().nullable(),
  body: z.string().nullable(),
  deliveryStatus: z.string().nullable(),
  fromAddress: z.string().nullable(),
  ownerId: IdSchema.nullable(),
  activityTimestamp: z.string().nullable(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

/** A conversation thread. `unreadCount` is computed per-caller from read state. */
export const ConversationSchema = z.object({
  id: IdSchema,
  contactId: IdSchema.nullable(),
  companyId: IdSchema.nullable(),
  relatedListingId: IdSchema.nullable(),
  channel: z.string(),
  status: z.string(),
  subject: z.string().nullable(),
  assignedToId: IdSchema.nullable(),
  sensitivityClass: z.string(),
  lastMessageAt: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  /** messages after this caller's last-read mark; 0 when never opened but empty */
  unreadCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/** Thread + its messages (oldest→newest), returned by GET /conversations/:id. */
export const ConversationDetailSchema = ConversationSchema.extend({
  messages: z.array(MessageSchema),
});
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

// ---------------------------------------------------------------------------
// Write DTOs
// ---------------------------------------------------------------------------
/** Start a thread. At least one of contact/company/listing should be set, but the
 *  API allows a bare thread (e.g. an internal note) — linkage can follow. */
export const ConversationCreateSchema = z.object({
  contactId: IdSchema.optional(),
  companyId: IdSchema.optional(),
  relatedListingId: IdSchema.optional(),
  channel: ConversationChannelSchema,
  status: ConversationStatusSchema.default("open"),
  subject: z.string().max(500).optional(),
  assignedToId: IdSchema.optional(),
  sensitivityClass: ConversationSensitivitySchema.default("general"),
});
export type ConversationCreate = z.infer<typeof ConversationCreateSchema>;

/** Patch a thread's routing/state (not its messages). */
export const ConversationUpdateSchema = z
  .object({
    status: ConversationStatusSchema.optional(),
    subject: z.string().max(500).nullable().optional(),
    assignedToId: IdSchema.nullable().optional(),
  })
  .strict();
export type ConversationUpdate = z.infer<typeof ConversationUpdateSchema>;

/**
 * Post a message to a thread. Channel defaults to the thread's channel.
 * When `provider` is set the message is actually sent via that provider (and
 * `toAddress` + `subject` become required for email); omit `provider` to only
 * log the message on the timeline without sending.
 */
export const MessageCreateSchema = z
  .object({
    direction: MessageDirectionSchema.default("outbound"),
    channel: ConversationChannelSchema.optional(),
    body: z.string().min(1).max(20_000),
    fromAddress: z.string().max(320).optional(),
    provider: MessageProviderSchema.optional(),
    toAddress: z.string().email().optional(),
    subject: z.string().max(500).optional(),
  })
  .refine(
    (v) => !v.provider || !(EMAIL_PROVIDERS as readonly string[]).includes(v.provider) || (v.toAddress && v.subject),
    {
      message: "toAddress and subject are required for email providers (gmail, mailgun)",
      path: ["provider"],
    },
  );
export type MessageCreate = z.infer<typeof MessageCreateSchema>;

/** Mark a thread read up to a point (defaults to now on the server). */
export const MarkReadSchema = z.object({
  lastReadAt: IsoDateSchema.optional(),
});
export type MarkRead = z.infer<typeof MarkReadSchema>;

/** Filters for the conversation list / inbox. */
export const ConversationListQuerySchema = z.object({
  cursor: IdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: ConversationStatusSchema.optional(),
  channel: ConversationChannelSchema.optional(),
  assignedToId: IdSchema.optional(),
  contactId: IdSchema.optional(),
  companyId: IdSchema.optional(),
});
export type ConversationListQuery = z.infer<typeof ConversationListQuerySchema>;

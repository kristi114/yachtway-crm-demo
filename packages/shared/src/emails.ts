import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";

/**
 * Email object — templates, campaigns, audiences, sends and per-recipient
 * results. Ported from the standalone build's mock stores (src/lib/email-*.ts,
 * audiences.ts), which are the product spec for this object.
 *
 * Routing rule (fixed by email CLASS, not by user choice):
 *   system        → AWS SES     password resets, alerts, receipts
 *   transactional → Gmail       1:1 rep ↔ contact mail, sent as the rep
 *   marketing     → Mailgun     bulk campaigns with open/click tracking
 * A send may override the provider only within KIND_ALLOWED_PROVIDERS.
 */

export const EmailKindSchema = z.enum(["system", "transactional", "marketing"]);
export type EmailKind = z.infer<typeof EmailKindSchema>;

export const EmailProviderSchema = z.enum(["ses", "gmail", "mailgun"]);
export type EmailProvider = z.infer<typeof EmailProviderSchema>;

/** Default provider per class. */
export const KIND_PROVIDER: Record<EmailKind, EmailProvider> = {
  system: "ses",
  transactional: "gmail",
  marketing: "mailgun",
};

/** Overrides a send may legitimately request, per class. */
export const KIND_ALLOWED_PROVIDERS: Record<EmailKind, EmailProvider[]> = {
  system: ["ses"],
  transactional: ["gmail", "ses"],
  marketing: ["mailgun", "gmail"],
};

/** Resolve the provider for a send, rejecting a disallowed override. */
export function resolveProvider(
  kind: EmailKind,
  requested?: EmailProvider | null,
): { provider: EmailProvider; overridden: boolean } {
  const fallback = KIND_PROVIDER[kind];
  if (!requested || requested === fallback) return { provider: fallback, overridden: false };
  if (!KIND_ALLOWED_PROVIDERS[kind].includes(requested)) {
    throw new Error(`provider_not_allowed_for_kind:${kind}:${requested}`);
  }
  return { provider: requested, overridden: true };
}

export const EmailModeSchema = z.enum(["design", "html"]);
export const SendModeSchema = z.enum(["now", "at", "batch", "rss", "smart"]);
export const RepeatUnitSchema = z.enum(["minutes", "hours", "days"]);
export const SendStatusSchema = z.enum([
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
  "cancelled",
]);
export type SendStatus = z.infer<typeof SendStatusSchema>;

/** Per-recipient outcome. `suppressed` rows are never dispatched. */
export const RecipientStatusSchema = z.enum([
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "failed",
  "suppressed",
  "unsubscribed",
]);
export type RecipientStatus = z.infer<typeof RecipientStatusSchema>;

export const SuppressionReasonSchema = z.enum(["noEmail", "optedOut", "doNotContact", "duplicate"]);
export type SuppressionReason = z.infer<typeof SuppressionReasonSchema>;

/** Tag that blocks all contact, on either the contact or its company. */
export const DO_NOT_CONTACT_TAG = "Do Not Contact";

export const PreferenceTypeSchema = z.enum([
  "newsletter",
  "product-updates",
  "events",
  "offers",
  "none",
]);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export const EmailTemplateSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  subject: z.string(),
  /** Inbox preview line after the subject. */
  preheader: z.string().nullish(),
  /** <title> — independent of the subject. */
  title: z.string().nullish(),
  kind: EmailKindSchema.default("marketing"),
  provider: EmailProviderSchema.nullish(),
  mode: EmailModeSchema,
  html: z.string(),
  /** GrapesJS project state when mode = design. */
  design: z.unknown().nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

export const EmailTemplateCreateSchema = EmailTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const EmailTemplateUpdateSchema = EmailTemplateCreateSchema.partial();

// ---------------------------------------------------------------------------
// Campaigns — an ordered series of sends
// ---------------------------------------------------------------------------
export const CampaignStatusSchema = z.enum(["Draft", "Active", "Paused", "Complete"]);

export const EmailCampaignSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().nullish(),
  status: CampaignStatusSchema.default("Draft"),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type EmailCampaign = z.infer<typeof EmailCampaignSchema>;

export const EmailCampaignCreateSchema = EmailCampaignSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const EmailCampaignUpdateSchema = EmailCampaignCreateSchema.partial();

export const CampaignStepSchema = z.object({
  id: IdSchema,
  campaignId: IdSchema,
  templateId: IdSchema,
  /** 1-based position in the series. */
  step: z.number().int().positive(),
  /** Days to wait after the previous step. */
  delayDays: z.number().int().min(0).default(0),
});
export const CampaignStepCreateSchema = CampaignStepSchema.omit({ id: true, campaignId: true });

// ---------------------------------------------------------------------------
// Audiences — saved recipient definitions
// ---------------------------------------------------------------------------
export const FilterClauseSchema = z.object({
  field: z.string(),
  op: z.string(),
  value: z.unknown().nullish(),
});

export const AudienceDefSchema = z.object({
  contactClauses: z.array(FilterClauseSchema).default([]),
  contactTags: z.array(z.string()).default([]),
  companyTags: z.array(z.string()).default([]),
  manualEmails: z.array(z.string()).default([]),
});
export type AudienceDef = z.infer<typeof AudienceDefSchema>;

export const EmailAudienceSchema = AudienceDefSchema.extend({
  id: IdSchema,
  name: z.string().min(1),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type EmailAudience = z.infer<typeof EmailAudienceSchema>;

export const EmailAudienceCreateSchema = AudienceDefSchema.extend({ name: z.string().min(1) });

export const AudienceMemberSchema = z.object({
  email: z.string(),
  contactId: IdSchema.nullish(),
  name: z.string().nullish(),
  companyName: z.string().nullish(),
  via: z.enum(["filter", "contact tag", "company tag", "manual"]),
});

/** What a resolve returns: who is reachable, and who was dropped and why. */
export const ResolvedAudienceSchema = z.object({
  members: z.array(AudienceMemberSchema),
  suppressed: z.object({
    noEmail: z.number().int().min(0),
    optedOut: z.number().int().min(0),
    doNotContact: z.number().int().min(0),
    duplicates: z.number().int().min(0),
  }),
});
export type ResolvedAudience = z.infer<typeof ResolvedAudienceSchema>;

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------
export const BatchConfigSchema = z.object({
  /** Recipients per batch. */
  quantity: z.number().int().positive(),
  repeatAfter: z.number().int().positive(),
  repeatUnit: RepeatUnitSchema,
  /** 0 = Sunday. */
  sendOnDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
});

export const RssConfigSchema = z.object({
  feedUrl: z.string().url(),
  checkEvery: z.enum(["hourly", "daily", "weekly"]),
  minItems: z.number().int().min(1).default(1),
});

export const SmartConfigSchema = z.object({
  /** Spread sends across this many hours, per-recipient best time. */
  windowHours: z.number().int().positive(),
  earliestHour: z.number().int().min(0).max(23),
  latestHour: z.number().int().min(0).max(23),
});

export const SendScheduleSchema = z.object({
  mode: SendModeSchema.default("now"),
  startAt: z.string().nullish(),
  timezone: z.string().nullish(),
  batch: BatchConfigSchema.nullish(),
  rss: RssConfigSchema.nullish(),
  smart: SmartConfigSchema.nullish(),
});
export type SendSchedule = z.infer<typeof SendScheduleSchema>;

// ---------------------------------------------------------------------------
// Send options, A/B test, follow-up
// ---------------------------------------------------------------------------
export const SendOptionsSchema = z.object({
  trackClicks: z.boolean().default(true),
  utmTracking: z.boolean().default(true),
  addTagsOnInteraction: z.boolean().default(false),
  tagOnOpen: z.string().nullish(),
  tagOnClick: z.string().nullish(),
  preferenceType: PreferenceTypeSchema.nullish(),
});

export const AbTestConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Share of recipients getting variant B, 1–99. */
  splitPercentB: z.number().int().min(1).max(99).default(50),
  winnerMetric: z.enum(["open", "click"]).default("open"),
  variantB: z.object({ subject: z.string(), html: z.string() }),
});

export const FollowUpConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Days after the original send before re-sending to non-openers. */
  delayDays: z.number().int().positive().default(3),
  subject: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// Sends
// ---------------------------------------------------------------------------
export const EmailSendSchema = z.object({
  id: IdSchema,
  subject: z.string(),
  html: z.string(),
  preheader: z.string().nullish(),
  title: z.string().nullish(),
  kind: EmailKindSchema,
  provider: EmailProviderSchema,
  providerOverridden: z.boolean().default(false),
  senderName: z.string().nullish(),
  senderEmail: z.string().nullish(),
  replyTo: z.string().nullish(),
  templateId: IdSchema.nullish(),
  templateName: z.string().nullish(),
  campaignId: IdSchema.nullish(),
  audienceId: IdSchema.nullish(),
  audienceName: z.string().nullish(),
  status: SendStatusSchema,
  scheduleMode: SendModeSchema,
  scheduleTimezone: z.string().nullish(),
  scheduledFor: IsoDateSchema.nullish(),
  sentAt: IsoDateSchema.nullish(),
  cancelledAt: IsoDateSchema.nullish(),
  recipientCount: z.number().int().min(0),
  deliveredCount: z.number().int().min(0),
  openedCount: z.number().int().min(0),
  clickedCount: z.number().int().min(0),
  bouncedCount: z.number().int().min(0),
  suppressedCount: z.number().int().min(0),
  /** Follow-up re-send to non-openers points back at its original. */
  parentSendId: IdSchema.nullish(),
  /** When the scheduler will next act on this send (next batch window / RSS check). */
  nextRunAt: IsoDateSchema.nullish(),
  /** Set once the non-opener follow-up has been created, so it fires only once. */
  followUpSentAt: IsoDateSchema.nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type EmailSend = z.infer<typeof EmailSendSchema>;

/** POST /emails/send. Recipients come from an audience, explicit contacts, or raw addresses. */
export const EmailSendCreateSchema = z
  .object({
    subject: z.string().min(1),
    html: z.string().min(1),
    preheader: z.string().nullish(),
    title: z.string().nullish(),
    kind: EmailKindSchema.default("marketing"),
    provider: EmailProviderSchema.nullish(),
    senderName: z.string().nullish(),
    senderEmail: z.string().email().nullish(),
    replyTo: z.string().email().nullish(),
    templateId: IdSchema.nullish(),
    campaignId: IdSchema.nullish(),
    audienceId: IdSchema.nullish(),
    audience: AudienceDefSchema.nullish(),
    contactIds: z.array(IdSchema).default([]),
    to: z.array(z.string().email()).default([]),
    schedule: SendScheduleSchema.nullish(),
    options: SendOptionsSchema.nullish(),
    abTest: AbTestConfigSchema.nullish(),
    followUp: FollowUpConfigSchema.nullish(),
    attachments: z.array(z.string()).default([]),
  })
  .refine(
    (v) => Boolean(v.audienceId || v.audience || v.contactIds.length > 0 || v.to.length > 0),
    { message: "no_recipients" },
  );
export type EmailSendCreate = z.infer<typeof EmailSendCreateSchema>;

export const EmailRecipientSchema = z.object({
  id: IdSchema,
  sendId: IdSchema,
  contactId: IdSchema.nullish(),
  email: z.string(),
  name: z.string().nullish(),
  variant: z.enum(["A", "B"]).nullish(),
  status: RecipientStatusSchema,
  suppressionReason: SuppressionReasonSchema.nullish(),
  providerMessageId: z.string().nullish(),
  sentAt: IsoDateSchema.nullish(),
  deliveredAt: IsoDateSchema.nullish(),
  openedAt: IsoDateSchema.nullish(),
  clickedAt: IsoDateSchema.nullish(),
  bouncedAt: IsoDateSchema.nullish(),
  createdAt: IsoDateSchema,
});
export type EmailRecipient = z.infer<typeof EmailRecipientSchema>;

/** GET /emails/sends/:id */
export const EmailSendDetailSchema = EmailSendSchema.extend({
  recipients: z.array(EmailRecipientSchema),
  variantStats: z
    .array(
      z.object({
        label: z.enum(["A", "B"]),
        subject: z.string(),
        recipients: z.number().int().min(0),
        delivered: z.number().int().min(0),
        opened: z.number().int().min(0),
        clicked: z.number().int().min(0),
      }),
    )
    .default([]),
});

export const EmailSendListQuerySchema = z.object({
  status: SendStatusSchema.optional(),
  kind: EmailKindSchema.optional(),
  campaignId: IdSchema.optional(),
  templateId: IdSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

/** Campaign rollup for the Campaigns tab. */
export const CampaignRollupSchema = z.object({
  campaign: EmailCampaignSchema,
  steps: z.array(CampaignStepSchema),
  sends: z.number().int().min(0),
  recipients: z.number().int().min(0),
  delivered: z.number().int().min(0),
  opened: z.number().int().min(0),
  clicked: z.number().int().min(0),
  openRate: z.number(),
  clickRate: z.number(),
  lastSentAt: IsoDateSchema.nullish(),
});

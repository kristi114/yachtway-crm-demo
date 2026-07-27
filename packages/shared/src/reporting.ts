import { z } from "zod";
import { IdSchema } from "./common.js";

/**
 * Phase 5 — reporting contract (first increment: pipeline metrics).
 *
 * Every reporting endpoint is permission-aware: aggregates run through the same
 * authorize + withRole + sensitivity-filter path as the underlying records, so a
 * report can never surface a total that includes rows the caller couldn't read.
 * Pipeline metrics are built from the Phase-3 opportunity + stage-history data
 * (stage outcome flags → won/lost/conversion; stage position → funnel order).
 *
 * NOTE: this increment computes metrics with live grouped queries. Materialized
 * views / a read replica are a later optimization once volume warrants it — the
 * contract here is stable across that change.
 */

/** Filters for pipeline reports. Dates bound on opportunity createdDate. */
export const PipelineReportQuerySchema = z.object({
  pipelineId: IdSchema.optional(),
  ownerId: IdSchema.optional(),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
});
export type PipelineReportQuery = z.infer<typeof PipelineReportQuerySchema>;

/** Per-stage rollup within a pipeline (funnel position + volume; outcome is not
 *  a stage property — see the status-based counts on PipelineMetric). */
export const StageMetricSchema = z.object({
  stageId: IdSchema,
  key: z.string(),
  name: z.string(),
  position: z.number().int(),
  isClosed: z.boolean(),
  /** opportunities currently sitting in this stage */
  count: z.number().int().nonnegative(),
  /** sum of opportunity_amount for those opportunities */
  value: z.number().nonnegative(),
});
export type StageMetric = z.infer<typeof StageMetricSchema>;

/**
 * Rollup for one pipeline. Won/Lost/Abandoned come from Opportunity.status;
 * open = everything not in a closed status. `stages` is the funnel by position.
 */
export const PipelineMetricSchema = z.object({
  pipelineId: IdSchema,
  key: z.string(),
  name: z.string(),
  sensitivityClass: z.string().nullable(),
  openCount: z.number().int().nonnegative(),
  openValue: z.number().nonnegative(),
  wonCount: z.number().int().nonnegative(),
  wonValue: z.number().nonnegative(),
  /** Abandoned opportunities are counted as lost. */
  lostCount: z.number().int().nonnegative(),
  /** wonCount / (wonCount + lostCount); null when nothing has closed */
  conversionRate: z.number().min(0).max(1).nullable(),
  stages: z.array(StageMetricSchema),
});
export type PipelineMetric = z.infer<typeof PipelineMetricSchema>;

export const PipelineReportSchema = z.object({
  data: z.array(PipelineMetricSchema),
  /** pipelines the caller couldn't see (financing pipelines without the grant) are omitted, counted here for UI transparency */
  hiddenSensitivePipelines: z.number().int().nonnegative(),
});
export type PipelineReport = z.infer<typeof PipelineReportSchema>;

// ---------------------------------------------------------------------------
// UTM source attribution
// ---------------------------------------------------------------------------
/** One (source, medium) attribution row. Sensitivity-filtered like the pipeline report. */
export const AttributionRowSchema = z.object({
  source: z.string(), // "(unattributed)" when utm_source is null
  medium: z.string(),
  count: z.number().int().nonnegative(),
  value: z.number().nonnegative(),
  wonCount: z.number().int().nonnegative(),
  wonValue: z.number().nonnegative(),
});
export type AttributionRow = z.infer<typeof AttributionRowSchema>;

export const AttributionReportSchema = z.object({
  data: z.array(AttributionRowSchema),
});
export type AttributionReport = z.infer<typeof AttributionReportSchema>;

// ---------------------------------------------------------------------------
// EasyFund referral funnel (fintech-scoped: gated on the `easyfund` grant)
// ---------------------------------------------------------------------------
export const EasyFundFunnelStageSchema = z.object({
  stageId: IdSchema,
  key: z.string(),
  name: z.string(),
  position: z.number().int(),
  isClosed: z.boolean(),
  count: z.number().int().nonnegative(),
  loanAmount: z.number().nonnegative(),
  amountFromLender: z.number().nonnegative(),
});
export type EasyFundFunnelStage = z.infer<typeof EasyFundFunnelStageSchema>;

export const EasyFundFunnelSchema = z.object({
  pipelineId: IdSchema.nullable(),
  totalReferrals: z.number().int().nonnegative(),
  closedReferrals: z.number().int().nonnegative(),
  closedAmount: z.number().nonnegative(),
  dealerReferralBonusTotal: z.number().nonnegative(),
  conversionRate: z.number().min(0).max(1).nullable(),
  stages: z.array(EasyFundFunnelStageSchema),
});
export type EasyFundFunnel = z.infer<typeof EasyFundFunnelSchema>;

// ---------------------------------------------------------------------------
// Studio revenue / bookings
// ---------------------------------------------------------------------------
export const StudioStageSchema = z.object({
  stageId: IdSchema,
  key: z.string(),
  name: z.string(),
  position: z.number().int(),
  isClosed: z.boolean(),
  count: z.number().int().nonnegative(),
});
export type StudioStage = z.infer<typeof StudioStageSchema>;

export const StudioReportSchema = z.object({
  pipelineId: IdSchema.nullable(),
  bookings: z.number().int().nonnegative(),
  /** sum of studio_details.amount_paid — studio service revenue collected */
  revenueCollected: z.number().nonnegative(),
  avgAmountPaid: z.number().nonnegative().nullable(),
  atBoatShowCount: z.number().int().nonnegative(),
  stages: z.array(StudioStageSchema),
});
export type StudioReport = z.infer<typeof StudioReportSchema>;

// ---------------------------------------------------------------------------
// Dealer engagement summary (rolled up from the dealer's contacts/brokers)
// ---------------------------------------------------------------------------
export const DealerEngagementSchema = z.object({
  companyId: IdSchema,
  contactCount: z.number().int().nonnegative(),
  activeContacts30d: z.number().int().nonnegative(),
  totalSessions30d: z.number().nonnegative(),
  totalLogins: z.number().nonnegative(),
  avgBuyerIntentScore: z.number().nullable(),
});
export type DealerEngagement = z.infer<typeof DealerEngagementSchema>;

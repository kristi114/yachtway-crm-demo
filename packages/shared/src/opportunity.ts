import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";

/**
 * Phase 3 — pipelines, stages, opportunities, and stage history.
 *
 * Pipelines and stages are reference/config data (readable by any authenticated
 * role, writable by Admin). Opportunities carry two representations of their
 * position: the free-string `stage` / `opportunityPipeline` the GHL sync writes
 * (kept for dual-write back-compat), and the structured `stageId` / `pipelineId`
 * FKs the CRM UI and reporting use. `opportunity_stage_history` is written on
 * every stage move from day one — velocity/conversion reporting (Phase 5) cannot
 * be reconstructed after the fact.
 *
 * Sensitivity: a pipeline whose `sensitivityClass` is `easyfund` or `mastercover`
 * is a financing pipeline. Its opportunity rows are filtered out for callers who
 * lack the matching grant (the applicant financials themselves already live in
 * the RLS-protected EasyFundLoan / MasterCoverApplication satellites).
 */

export const PipelineSensitivitySchema = z.enum(["easyfund", "mastercover"]);
export type PipelineSensitivity = z.infer<typeof PipelineSensitivitySchema>;

/**
 * Opportunity outcome lives on the STATUS, not the stage. A deal is Open while
 * working, and when it reaches the terminal (Closed) stage the user must pick a
 * closed status. Stages describe *where* in the funnel; status describes the
 * *outcome*.
 */
export const OpportunityStatusSchema = z.enum(["Open", "Won", "Lost", "Abandoned"]);
export type OpportunityStatus = z.infer<typeof OpportunityStatusSchema>;

/** The statuses that are only valid once a deal is closed (stage.isClosed). */
export const CLOSED_STATUSES = ["Won", "Lost", "Abandoned"] as const;
export type ClosedStatus = (typeof CLOSED_STATUSES)[number];

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------
export const PipelineStageSchema = z.object({
  id: IdSchema,
  pipelineId: IdSchema,
  key: z.string().min(1),
  name: z.string().min(1),
  position: z.number().int().nonnegative(),
  /** Terminal stage (deal left the active funnel). */
  isClosed: z.boolean(),
  /** true = won, false = lost, null = terminal-but-outcome-unknown (plain "Closed"). */
  isWon: z.boolean().nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
export const PipelineSchema = z.object({
  id: IdSchema,
  key: z.string().min(1),
  name: z.string().min(1),
  displayOrder: z.number().int().nonnegative(),
  sensitivityClass: PipelineSensitivitySchema.nullish(),
  lostReasons: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  stages: z.array(PipelineStageSchema).optional(),
});
export type Pipeline = z.infer<typeof PipelineSchema>;

// ---------------------------------------------------------------------------
// Opportunity
// ---------------------------------------------------------------------------
export const OpportunitySchema = z.object({
  id: IdSchema,
  recordType: z.string().nullish(),
  name: z.string().nullish(),
  contactId: IdSchema.nullish(),
  relatedListingId: IdSchema.nullish(),
  ownerId: IdSchema.nullish(),
  /** Owner may be a Role instead of a User (RoleSchema key, e.g. "FINTECH").
   *  EasyFund/MasterCover opps auto-own to FINTECH. */
  ownerRole: z.string().nullish(),
  opportunityStatus: z.string().nullish(),
  opportunityAmount: z.number().nullish(),
  opportunityClosed: IsoDateSchema.nullish(),
  // structured position (CRM-native)
  pipelineId: IdSchema.nullish(),
  stageId: IdSchema.nullish(),
  // free-string position (GHL sync back-compat)
  stage: z.string().nullish(),
  opportunityPipeline: z.string().nullish(),
  lastStageChangeDate: IsoDateSchema.nullish(),
  lostReason: z.string().nullish(),
  utmSource: z.string().nullish(),
  utmMedium: z.string().nullish(),
  utmCampaign: z.string().nullish(),
  utmContent: z.string().nullish(),
  vesselMake: z.string().nullish(),
  vesselModel: z.string().nullish(),
  vesselYear: z.string().nullish(),
  createdDate: IsoDateSchema.nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

/** Create: the sync-managed keys and timestamps are never client-supplied. */
export const OpportunityCreateSchema = OpportunitySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastStageChangeDate: true,
});
export type OpportunityCreate = z.infer<typeof OpportunityCreateSchema>;

export const OpportunityUpdateSchema = OpportunityCreateSchema.partial();
export type OpportunityUpdate = z.infer<typeof OpportunityUpdateSchema>;

/**
 * Stage-move input. `toStageId` must belong to the opportunity's pipeline. When
 * the target stage is terminal (isClosed), `opportunityStatus` is REQUIRED and
 * must be a closed status (Won/Lost/Abandoned) — the API rejects a close without
 * it. `lostReason` accompanies a Lost/Abandoned close.
 */
export const StageChangeSchema = z.object({
  toStageId: IdSchema,
  note: z.string().max(2000).optional(),
  lostReason: z.string().optional(),
  opportunityStatus: OpportunityStatusSchema.optional(),
});
export type StageChange = z.infer<typeof StageChangeSchema>;

// ---------------------------------------------------------------------------
// Stage history
// ---------------------------------------------------------------------------
export const OpportunityStageHistorySchema = z.object({
  id: IdSchema,
  opportunityId: IdSchema,
  pipelineId: IdSchema.nullish(),
  fromStageId: IdSchema.nullish(),
  toStageId: IdSchema.nullish(),
  /** name snapshots — history must survive a stage rename/reorder. */
  fromStage: z.string().nullish(),
  toStage: z.string().nullish(),
  changedById: IdSchema.nullish(),
  changedByRole: z.string().nullish(),
  note: z.string().nullish(),
  changedAt: IsoDateSchema,
});
export type OpportunityStageHistory = z.infer<typeof OpportunityStageHistorySchema>;

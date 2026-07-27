import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";

/**
 * MasterCover insurance application — resource class `mastercover`
 * (Fintech/Admin only). Own table (mastercover_applications, 1:1 with an
 * Opportunity), behind RLS. Curated scalar subset the API exposes.
 */
export const MasterCoverSchema = z.object({
  id: IdSchema,
  opportunityId: IdSchema,
  insurerId: IdSchema.nullish(),
  mastercoverId: z.string().nullish(),
  policyStatus: z.string().nullish(),
  estimatedPremium: z.number().nullish(),
  actualPremium: z.number().nullish(),
  vesselName: z.string().nullish(),
  vesselType: z.string().nullish(),
  vesselValue: z.number().nullish(),
  vesselLengthFt: z.number().nullish(),
  cruisingArea: z.string().nullish(),
  hullMaterial: z.string().nullish(),
  hullType: z.string().nullish(),
  loan: z.boolean().nullish(),
  loanAmount: z.number().nullish(),
  leadSource: z.string().nullish(),
  submittedAt: IsoDateSchema.nullish(),
  archiveReason: z.string().nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type MasterCover = z.infer<typeof MasterCoverSchema>;

export const MasterCoverCreateSchema = MasterCoverSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type MasterCoverCreate = z.infer<typeof MasterCoverCreateSchema>;

export const MasterCoverUpdateSchema = MasterCoverCreateSchema.omit({ opportunityId: true }).partial();
export type MasterCoverUpdate = z.infer<typeof MasterCoverUpdateSchema>;

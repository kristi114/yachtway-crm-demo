import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";

/**
 * EasyFund loan application — resource class `easyfund` (Fintech/Admin only).
 * Lives in its own table (easyfund_loans, 1:1 with an Opportunity) and behind
 * RLS; this contract is the curated subset the API exposes. Loan-applicant
 * financials (income, debt, credit) are the reason this class is isolated.
 */
export const EasyFundSchema = z.object({
  id: IdSchema,
  opportunityId: IdSchema,
  dealerId: IdSchema.nullish(),
  coapplicantId: IdSchema.nullish(),
  lenderId: IdSchema.nullish(),
  status: z.string().nullish(),
  currentStep: z.string().nullish(),
  creditScore: z.string().nullish(),
  monthlyIncome: z.number().nullish(),
  monthlyDebt: z.number().nullish(),
  downPayment: z.number().nullish(),
  purchasePrice: z.number().nullish(),
  loanAmount: z.number().nullish(),
  loanTerm: z.number().int().nullish(),
  loanType: z.string().nullish(),
  interestRate: z.number().nullish(),
  monthlyPayment: z.number().nullish(),
  purchaseRefinance: z.string().nullish(),
  leadSource: z.string().nullish(),
  declineReason: z.string().nullish(),
  prequalificationId: z.string().nullish(),
  easyfundExternalId: z.string().nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type EasyFund = z.infer<typeof EasyFundSchema>;

/** Create requires the owning opportunity; the rest is optional. */
export const EasyFundCreateSchema = EasyFundSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type EasyFundCreate = z.infer<typeof EasyFundCreateSchema>;

/** Update never re-points the opportunity link. */
export const EasyFundUpdateSchema = EasyFundCreateSchema.omit({ opportunityId: true }).partial();
export type EasyFundUpdate = z.infer<typeof EasyFundUpdateSchema>;

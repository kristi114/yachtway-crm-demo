import { z } from "zod";
import { IdSchema, IsoDateSchema } from "./common.js";

/**
 * Company = the account entity (Prisma model `Company`, table `companies`).
 * Resource class `company.general`. Field names mirror the BE-aligned catalog
 * (snake_case columns -> camelCase here). "Company" is also the rollup view over
 * a company + its contacts, listings, opportunities and conversations.
 */
export const CompanySchema = z.object({
  id: IdSchema,
  name: z.string().nullish(),
  companyType: z.string().nullish(),
  companyStatus: z.string().nullish(),
  activeCompanyStatus: z.string().nullish(),
  companySource: z.string().nullish(),
  companyEmail: z.string().email().nullish(),
  phone: z.string().nullish(),
  website: z.string().nullish(),
  accountCurrency: z.string().nullish(),
  mainOfficeStreet: z.string().nullish(),
  mainOfficeCity: z.string().nullish(),
  mainOfficeState: z.string().nullish(),
  mainOfficeCountry: z.string().nullish(),
  mainOfficePostalCode: z.string().nullish(),
  ownerId: IdSchema.nullish(),
  primaryContactId: IdSchema.nullish(),
  parentCompanyId: IdSchema.nullish(),
  yachtwayDbAccountId: z.string().nullish(),
  /** Suppresses only the company's own email address on this record. */
  emailOptOut: z.boolean().nullish(),
  /** Suppresses every contact at this company (absolute audience suppression). */
  accountWideEmailOptOut: z.boolean().nullish(),
  // Social profiles
  facebookUrl: z.string().nullish(),
  instagramUrl: z.string().nullish(),
  whatsappNumber: z.string().nullish(),
  youtubeUrl: z.string().nullish(),
  tiktokUrl: z.string().nullish(),
  linkedinUrl: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Company = z.infer<typeof CompanySchema>;

/** Write shapes. */
export const CompanyCreateSchema = CompanySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CompanyCreate = z.infer<typeof CompanyCreateSchema>;

export const CompanyUpdateSchema = CompanyCreateSchema.partial();
export type CompanyUpdate = z.infer<typeof CompanyUpdateSchema>;

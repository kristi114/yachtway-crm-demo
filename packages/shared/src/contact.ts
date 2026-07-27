import { z } from "zod";
import { IdSchema, RecordTypeSchema, IsoDateSchema } from "./common.js";

/**
 * General contact fields — resource class `contact.general` (rep-visible).
 * Field names mirror the BE-aligned catalog (Contact = Broker ∪ Buyer under one
 * `recordType`): brokers carry office_* address + company link; buyers carry
 * mailing_* address. `companyId` is nullable — B2C buyers have no company.
 */
export const ContactSchema = z.object({
  id: IdSchema,
  recordType: RecordTypeSchema,
  contactType: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  title: z.string().nullish(),
  platformRole: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  officePhone: z.string().nullish(),
  mobilePhone: z.string().nullish(),
  // broker office address
  officeStreet: z.string().nullish(),
  officeCity: z.string().nullish(),
  officeState: z.string().nullish(),
  officeCountry: z.string().nullish(),
  officePostalCode: z.string().nullish(),
  // buyer mailing address
  mailingStreet: z.string().nullish(),
  mailingCity: z.string().nullish(),
  mailingState: z.string().nullish(),
  mailingCountry: z.string().nullish(),
  mailingPostalCode: z.string().nullish(),
  companyId: IdSchema.nullish(),
  ownerId: IdSchema.nullish(),
  yachtwayDbId: z.string().nullish(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Contact = z.infer<typeof ContactSchema>;

/**
 * Sensitive buyer signals on the contact record — resource class
 * `contact.sensitive`. Served only to roles with the grant; never merged into
 * the base Contact for roles without it. (Loan-application data itself lives in
 * the isolated `easyfund_loans` table, not here.)
 */
export const ContactSensitiveSchema = z.object({
  contactId: IdSchema,
  dobYear: z.string().nullish(),
  monthlyPaymentMin: z.number().nullish(),
  monthlyPaymentMax: z.number().nullish(),
  buyerIntentScore: z.number().nullish(),
  intentTier: z.string().nullish(),
  easyfund: z.boolean().nullish(),
  mastercover: z.boolean().nullish(),
});
export type ContactSensitive = z.infer<typeof ContactSensitiveSchema>;

/** Write shapes. */
export const ContactCreateSchema = ContactSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ContactCreate = z.infer<typeof ContactCreateSchema>;

export const ContactUpdateSchema = ContactCreateSchema.partial();
export type ContactUpdate = z.infer<typeof ContactUpdateSchema>;

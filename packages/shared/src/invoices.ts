import { z } from "zod";
import { IdSchema } from "./common.js";

/**
 * Xero-via-Make billing contract (Phase X0).
 *
 * The CRM owns the invoicing logic; Make is only the Xero transport. These
 * schemas back the CRM's own Invoice/Payment/Bill/CreditNote/Estimate records
 * (mirrors of Xero, plus the CRM-only estimate) and the config that drives which
 * Xero org / bill-to / account / sensitivity each invoice type uses.
 *
 * Sensitivity: `easyfund` / `mastercover` invoices are financing-class
 * (invoice.financing → FINTECH/ADMIN only); the rest are general. RLS gates the
 * rows per-class; reps see only the materialized paid-referral/credit rollups on
 * the Company. See CRM-Xero-Make-Integration-Plan.md.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const InvoiceTypeSchema = z.enum([
  "subscription",
  "studio",
  "easyfund",
  "mastercover",
  "other",
]);
export type InvoiceType = z.infer<typeof InvoiceTypeSchema>;

/** Financing invoice types map to invoice.financing in RLS; the rest to invoice.general. */
export const FINANCING_INVOICE_TYPES = ["easyfund", "mastercover"] as const;

/** Sensitivity marker stored on invoices/payments/bills/credit_notes rows. */
export const BillingSensitivitySchema = z.enum([
  "general",
  "financing",
  "easyfund",
  "mastercover",
]);
export type BillingSensitivity = z.infer<typeof BillingSensitivitySchema>;

export const InvoiceStatusSchema = z.enum([
  "draft", // CRM-only; rep-created.
  "pending_approval",
  "approved", // human-approved, ready to send
  "queued", // legacy (was: emitted to Make) — retained for old rows
  "sent", // PDF + email sent to the payer (with a Stripe pay link when applicable)
  "paid",
  "overdue",
  "voided",
  "failed",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const BillStatusSchema = z.enum(["draft", "awaiting_payment", "paid", "voided"]);
export type BillStatus = z.infer<typeof BillStatusSchema>;

export const EstimateStatusSchema = z.enum(["draft", "sent", "accepted", "declined", "expired"]);
export type EstimateStatus = z.infer<typeof EstimateStatusSchema>;

/** Invoice action once approved (ported from ghl-sync-service invoice-config.js). */
export const InvoiceActionSchema = z.enum(["draft", "authorize", "authorize_and_send"]);
export type InvoiceAction = z.infer<typeof InvoiceActionSchema>;

/** Only EUR and USD are offered (both enabled in the Xero org). */
export const CurrencySchema = z.enum(["EUR", "USD"]);
export type Currency = z.infer<typeof CurrencySchema>;

/** Billing rail. `xero` = Make→Xero flow; `stripe` = Stripe Checkout. Per-invoice toggle. */
/** The card rail for an invoice: 'stripe' (hosted pay link) or 'manual' (bank/check,
 *  recorded by hand). Xero was removed 2026-07-27. */
export const BillingProviderSchema = z.enum(["stripe", "manual"]);
export type BillingProvider = z.infer<typeof BillingProviderSchema>;

/** How a received payment arrived. */
export const PaymentMethodSchema = z.enum(["stripe", "bank_transfer", "check", "wire", "manual"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/** Bill-to resolution strategy per invoice type (ported from invoice-config.js). */
export const BillToStrategySchema = z.enum([
  "bill_to_company",
  "primary_contact_company",
  "bill_to_company_or_primary_contact_company",
  "primary_contact",
  "selectable",
]);
export type BillToStrategy = z.infer<typeof BillToStrategySchema>;

// ---------------------------------------------------------------------------
// Invoice-type config — single source of truth (port of invoice-config.js)
// ---------------------------------------------------------------------------
export interface InvoiceTypeConfig {
  label: string;
  billTo: BillToStrategy;
  /** Opportunity field the lump-sum amount comes from; itemized types ignore it. */
  amountField: string;
  itemized: boolean;
  accountCode: string;
  taxType: string;
  dueDays: number;
  defaultAction: InvoiceAction;
  /** general | financing — drives invoice.* resource class + RLS. */
  sensitivityClass: BillingSensitivity;
  /** Create a CRM draft automatically when the opportunity reaches Won. */
  autoDraftOnWon: boolean;
  /** Description template; {opportunity_name} / {company_name} are substituted. */
  description: string;
}

export const INVOICE_TYPE_CONFIG: Record<InvoiceType, InvoiceTypeConfig> = {
  subscription: {
    label: "Subscription",
    billTo: "primary_contact_company",
    amountField: "opportunity_amount",
    itemized: false,
    accountCode: "4000",
    taxType: "NONE",
    dueDays: 7,
    defaultAction: "authorize_and_send",
    sensitivityClass: "general",
    // Subscriptions are NEVER auto-created (most go through Stripe; the rest are
    // rep-initiated). No invoice type auto-drafts on Won.
    autoDraftOnWon: false,
    description: "Subscription - {opportunity_name}",
  },
  studio: {
    label: "Studio Services",
    billTo: "bill_to_company_or_primary_contact_company",
    amountField: "opportunity_amount",
    itemized: true,
    accountCode: "4000",
    taxType: "NONE",
    dueDays: 7,
    defaultAction: "authorize_and_send",
    sensitivityClass: "general",
    autoDraftOnWon: false,
    description: "Studio Services - {opportunity_name}",
  },
  easyfund: {
    label: "EasyFund Referral",
    billTo: "bill_to_company",
    amountField: "amount_from_lender",
    itemized: false,
    accountCode: "4000",
    taxType: "NONE",
    dueDays: 30,
    defaultAction: "authorize",
    sensitivityClass: "financing",
    autoDraftOnWon: false,
    description: "EasyFund referral fee - {opportunity_name}",
  },
  mastercover: {
    label: "MasterCover Referral",
    billTo: "bill_to_company",
    amountField: "amount_from_ins_co",
    itemized: false,
    accountCode: "4000",
    taxType: "NONE",
    dueDays: 7,
    defaultAction: "authorize",
    sensitivityClass: "financing",
    autoDraftOnWon: false,
    description: "MasterCover referral fee - {opportunity_name}",
  },
  other: {
    label: "Other",
    billTo: "selectable",
    amountField: "opportunity_amount",
    itemized: false,
    accountCode: "4000",
    taxType: "NONE",
    dueDays: 7,
    defaultAction: "authorize_and_send",
    sensitivityClass: "general",
    autoDraftOnWon: false,
    description: "{opportunity_name}",
  },
};

/** invoice.general | invoice.financing for an invoice type or sensitivity. */
export function invoiceResourceClass(
  input: InvoiceType | BillingSensitivity,
): "invoice.general" | "invoice.financing" {
  const financing =
    (FINANCING_INVOICE_TYPES as readonly string[]).includes(input) ||
    input === "financing" ||
    input === "easyfund" ||
    input === "mastercover";
  return financing ? "invoice.financing" : "invoice.general";
}

// ---------------------------------------------------------------------------
// Studio quantity basis (port of ghl-sync-service src/studio/config.js)
// ---------------------------------------------------------------------------
/** Xero item codes priced per vessel foot; everything else is per-unit. */
export const FOOT_CODES: ReadonlySet<string> = new Set([
  "YW-MB-3D",
  "YW-NM-3D",
  "YW-MB-PHOTOVID",
  "YW-NM-PHOTOVID",
  "YW-MB-SPOT",
  "YW-NM-SPOT",
  "YW-MB-SPOT-BS",
  "YW-NM-SPOT-BS",
]);

export const QuantityBasisSchema = z.enum(["foot", "unit"]);
export type QuantityBasis = z.infer<typeof QuantityBasisSchema>;

/** 'foot' | 'unit' for a Xero item code (case-insensitive). Defaults to 'unit'. */
export function basisForCode(code: string | null | undefined): QuantityBasis {
  if (!code) return "unit";
  return FOOT_CODES.has(String(code).trim().toUpperCase()) ? "foot" : "unit";
}

/** Line quantity for a product: per-foot → vessel length; unit → entered qty (default 1). */
export function quantityFor(
  code: string | null | undefined,
  opts: { vesselLengthFt?: number | string | null; enteredQty?: number | string | null } = {},
): number {
  if (basisForCode(code) === "foot") {
    const ft = Number(opts.vesselLengthFt);
    if (!Number.isFinite(ft) || ft <= 0) {
      throw new Error(`Vessel length is required for per-foot product ${code}`);
    }
    return ft;
  }
  const q = Number(opts.enteredQty == null || opts.enteredQty === "" ? 1 : opts.enteredQty);
  if (!Number.isFinite(q) || q <= 0) {
    throw new Error(`Invalid quantity "${opts.enteredQty}" for product ${code}`);
  }
  return q;
}

// ---------------------------------------------------------------------------
// Read DTOs
// ---------------------------------------------------------------------------
export const InvoiceSchema = z.object({
  id: IdSchema,
  opportunityId: IdSchema.nullable(),
  companyId: IdSchema.nullable(),
  contactId: IdSchema.nullable(),
  fromEstimateId: IdSchema.nullable(),
  invoiceType: z.string(),
  orgKey: z.string(),
  currency: z.string(),
  amount: z.number().nullable(),
  reference: z.string().nullable(),
  itemized: z.boolean(),
  status: z.string(),
  amountPaid: z.number().nullable(),
  amountDue: z.number().nullable(),
  dueDate: z.string().nullable(),
  billingProvider: z.string(),
  sentAt: z.string().nullable(),
  pdfPath: z.string().nullable(),
  onlineInvoiceUrl: z.string().nullable(),
  stripeInvoiceId: z.string().nullable(),
  sensitivityClass: z.string(),
  approvedById: z.string().nullable(),
  approvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const PaymentSchema = z.object({
  id: IdSchema,
  invoiceId: IdSchema.nullable(),
  companyId: IdSchema.nullable(),
  method: z.string().nullable(),
  billingProvider: z.string(),
  stripePaymentId: z.string().nullable(),
  amount: z.number().nullable(),
  paidAt: z.string().nullable(),
  reference: z.string().nullable(),
  createdAt: z.string(),
});
export type Payment = z.infer<typeof PaymentSchema>;

// --- Dealer credit notes (CRM-native) ---
export const CreditNoteSchema = z.object({
  id: IdSchema,
  companyId: IdSchema.nullable(),
  contactId: IdSchema.nullable(),
  appliedToInvoiceId: IdSchema.nullable(),
  amount: z.number().nullable(),
  remainingCredit: z.number().nullable(),
  status: z.string(), // open | applied | void
  currency: z.string(),
  reference: z.string().nullable(),
  createdAt: z.string(),
});
export type CreditNote = z.infer<typeof CreditNoteSchema>;

/** Issue a dealer credit (goodwill / adjustment). */
export const CreditNoteIssueSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: CurrencySchema.default("USD"),
  reference: z.string().max(200).optional(),
  contactId: IdSchema.optional(),
});
export type CreditNoteIssue = z.infer<typeof CreditNoteIssueSchema>;

/** Apply an open credit against an invoice (partial or full). */
export const CreditNoteApplySchema = z.object({
  invoiceId: IdSchema,
  amount: z.coerce.number().positive().optional(), // default: min(remaining, amountDue)
});
export type CreditNoteApply = z.infer<typeof CreditNoteApplySchema>;

/** Record a payment received against an invoice (manual or reconciling a Stripe one). */
export const PaymentRecordSchema = z.object({
  method: PaymentMethodSchema,
  amount: z.coerce.number().positive(),
  paidAt: z.string().optional(),
  reference: z.string().max(200).optional(),
});
export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

// --- Partner receivables (lender/insurer amounts owed) + dealer payouts (A3) ---
export const PartnerReceivableSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  opportunityId: IdSchema,
  kind: z.string(), // easyfund | mastercover
  amount: z.number().nullable(),
  currency: z.string(),
  closedAt: z.string().nullable(),
  expectedSettlementDate: z.string().nullable(),
  status: z.string(), // accrued | settled | void
  settlementPaymentId: IdSchema.nullable(),
  createdAt: z.string(),
});
export type PartnerReceivable = z.infer<typeof PartnerReceivableSchema>;

/** Record a partner's monthly lump settlement — clears accrued receivables due on/before paidAt. */
export const PartnerSettlementSchema = z.object({
  amount: z.coerce.number().positive(),
  method: PaymentMethodSchema.default("bank_transfer"),
  paidAt: z.string().optional(), // defaults to now
  reference: z.string().max(200).optional(),
});
export type PartnerSettlement = z.infer<typeof PartnerSettlementSchema>;

export const PayoutStatusSchema = z.enum(["pending", "approved", "paid", "void"]);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

export const PayoutSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  amount: z.number().nullable(),
  currency: z.string(),
  status: z.string(),
  method: z.string().nullable(),
  amountSource: z.string(), // referral_field | manual
  reference: z.string().nullable(),
  paidAt: z.string().nullable(),
  relatedOpportunityId: IdSchema.nullable(),
  createdAt: z.string(),
});
export type Payout = z.infer<typeof PayoutSchema>;

/** Create an ad-hoc (manual) dealer payout. Auto-drafts on close use paid_to_referring_dealer. */
export const PayoutCreateSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: CurrencySchema.default("USD"),
  method: z.enum(["bank_transfer", "check", "wire", "stripe_connect", "manual"]).optional(),
  reference: z.string().max(200).optional(),
  relatedOpportunityId: IdSchema.optional(),
});
export type PayoutCreate = z.infer<typeof PayoutCreateSchema>;

/** Mark a payout paid (finance sent the money by bank). */
export const PayoutMarkPaidSchema = z.object({
  method: z.enum(["bank_transfer", "check", "wire", "stripe_connect", "manual"]).default("bank_transfer"),
  reference: z.string().max(200).optional(),
  paidAt: z.string().optional(),
});
export type PayoutMarkPaid = z.infer<typeof PayoutMarkPaidSchema>;

export const EstimateLineItemSchema = z.object({
  id: IdSchema,
  estimateId: IdSchema,
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  productCode: z.string().nullable(),
  lineTotal: z.number().nullable(),
});
export type EstimateLineItem = z.infer<typeof EstimateLineItemSchema>;

export const EstimateSchema = z.object({
  id: IdSchema,
  companyId: IdSchema.nullable(),
  currency: z.string(),
  notes: z.string().nullable(),
  status: z.string(),
  primaryRecipientContactId: IdSchema.nullable(),
  ccEmails: z.array(z.string()),
  total: z.number().nullable(),
  sensitivityClass: z.string(),
  sentAt: z.string().nullable(),
  respondedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Estimate = z.infer<typeof EstimateSchema>;

export const EstimateDetailSchema = EstimateSchema.extend({
  lineItems: z.array(EstimateLineItemSchema),
});
export type EstimateDetail = z.infer<typeof EstimateDetailSchema>;

// ---------------------------------------------------------------------------
// Write DTOs
// ---------------------------------------------------------------------------
/** Create a single-opportunity invoice draft (rep-initiated). */
export const InvoiceCreateSchema = z.object({
  invoiceType: InvoiceTypeSchema,
  invoiceAction: InvoiceActionSchema.optional(),
  /** Card rail: 'stripe' (pay link on send) or 'manual' (bank/check, recorded by hand). */
  billingProvider: BillingProviderSchema.default("stripe"),
  currency: CurrencySchema.default("USD"),
  billToCompanyId: IdSchema.optional(),
  billToContactId: IdSchema.optional(),
  /** Manual amount. REQUIRED for `mastercover` (Fintech enters the referral fee);
   *  optional override for `other`/`subscription`; ignored for itemized `studio`. */
  amount: z.coerce.number().positive().optional(),
});
export type InvoiceCreate = z.infer<typeof InvoiceCreateSchema>;

/** Create a multi-opportunity studio invoice draft (aggregate line items). */
export const MultiInvoiceCreateSchema = z.object({
  invoiceType: InvoiceTypeSchema.default("studio"),
  opportunityIds: z.array(IdSchema).min(1),
  invoiceAction: InvoiceActionSchema.optional(),
  currency: CurrencySchema.default("USD"),
});
export type MultiInvoiceCreate = z.infer<typeof MultiInvoiceCreateSchema>;

/** Human approval gate — transitions draft → queued and emits to Make. */
export const InvoiceApproveSchema = z.object({
  invoiceAction: InvoiceActionSchema.optional(),
});
export type InvoiceApprove = z.infer<typeof InvoiceApproveSchema>;

export const EstimateLineInputSchema = z.object({
  description: z.string().max(1000),
  quantity: z.coerce.number().positive().default(1),
  unitPrice: z.coerce.number().nonnegative().default(0),
  productCode: z.string().max(64).optional(),
});
export type EstimateLineInput = z.infer<typeof EstimateLineInputSchema>;

export const EstimateCreateSchema = z.object({
  companyId: IdSchema,
  currency: CurrencySchema.default("EUR"),
  notes: z.string().max(5000).optional(),
  primaryRecipientContactId: IdSchema.optional(),
  ccEmails: z.array(z.string().email()).max(20).default([]),
  lineItems: z.array(EstimateLineInputSchema).default([]),
});
export type EstimateCreate = z.infer<typeof EstimateCreateSchema>;

export const EstimateUpdateSchema = EstimateCreateSchema.partial().extend({
  status: EstimateStatusSchema.optional(),
});
export type EstimateUpdate = z.infer<typeof EstimateUpdateSchema>;

/** Add a studio line item to an opportunity. quantity is derived from the
 *  product's basis (per-foot → vesselLengthFt) when not given explicitly. */
export const LineItemCreateSchema = z.object({
  productCode: z.string().min(1).max(64),
  quantity: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().nonnegative().optional(),
  description: z.string().max(1000).optional(),
  vesselLengthFt: z.coerce.number().positive().optional(),
});
export type LineItemCreate = z.infer<typeof LineItemCreateSchema>;

/** Grant/adjust a dealer's Studio Listing Shoot credits (per-shoot, flat). */
export const ShootCreditAdjustSchema = z.object({
  delta: z.coerce.number().int().refine((n) => n !== 0, "delta must be non-zero"),
  reason: z.string().max(200),
  relatedOpportunityId: IdSchema.optional(),
  note: z.string().max(1000).optional(),
});
export type ShootCreditAdjust = z.infer<typeof ShootCreditAdjustSchema>;

// ---------------------------------------------------------------------------
// Stripe subscriptions + the ADMIN Accounting view
// ---------------------------------------------------------------------------
export const SubscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const SubscriptionSchema = z.object({
  id: IdSchema,
  companyId: IdSchema.nullable(),
  stripeSubscriptionId: z.string().nullable(),
  stripePriceId: z.string().nullable(),
  productName: z.string().nullable(),
  status: z.string().nullable(),
  seats: z.number().int().nullable(),
  mrr: z.number().nullable(),
  currency: z.string(),
  currentPeriodEnd: z.string().nullable(),
  billingProvider: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

/** Start a Stripe subscription for a dealer — returns a Checkout URL to send. */
export const SubscriptionCreateSchema = z.object({
  priceId: z.string().min(1),
  seats: z.coerce.number().int().positive().optional(),
});
export type SubscriptionCreate = z.infer<typeof SubscriptionCreateSchema>;

/** The tabs of the ADMIN Accounting object. */
export const AccountingTabSchema = z.enum([
  "collected", // payments received (dealer + partner + stripe)
  "receivable", // open dealer invoices
  "partner-owed", // accrued lender/insurer receivables (not invoiced)
  "payable", // vendor bills
  "dealer-credits", // dealer credit notes
  "payouts", // money owed/paid to dealers
  "shoot-credits", // studio listing-shoot credit ledger
]);
export type AccountingTab = z.infer<typeof AccountingTabSchema>;

/** One unified row in the Accounting view, from either rail (`source`). */
export const AccountingRowSchema = z.object({
  id: IdSchema,
  source: z.string(), // 'xero' | 'stripe'
  kind: z.string(), // payment | invoice | bill | credit_note
  date: z.string().nullable(),
  companyId: IdSchema.nullable(),
  contactId: IdSchema.nullable(),
  reference: z.string().nullable(),
  amount: z.number().nullable(),
  amountDue: z.number().nullable(),
  status: z.string().nullable(),
  currency: z.string().nullable(),
});
export type AccountingRow = z.infer<typeof AccountingRowSchema>;

import type { Prisma } from "@prisma/client";
import {
  basisForCode,
  INVOICE_TYPE_CONFIG,
  type InvoiceType,
  invoiceResourceClass,
  quantityFor,
} from "@yachtway/shared";
import { writeAudit } from "../audit.js";

/**
 * Invoice service (Phase X1) — the CRM-side billing logic, ported/adapted from
 * ghl-sync-service (invoice-config.js + handleInvoice). It resolves the bill-to
 * party and amount for an opportunity, computes the idempotency key, and creates
 * a local Invoice DRAFT. Nothing here talks to Xero — Make does, only after a
 * human approves (see routes/invoices.ts). Lump-sum only in X1; `studio`
 * (itemized) + multi-opp arrive in X1b.
 */

export type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const fail = (status: number, error: string): Outcome<never> => ({ ok: false, status, error });

/** A normalized bill-to party for the Make/Xero payload. */
export interface BillToParty {
  kind: "company" | "contact";
  recordId: string;
  name: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  xeroContactId: string | null;
}

/** Stable dedupe key so a re-fire for the same opportunity+type never duplicates. */
export function idempotencyKeyFor(opportunityId: string, invoiceType: InvoiceType): string {
  return `${opportunityId}:${invoiceType}`;
}

function toNumber(d: Prisma.Decimal | null | undefined): number | null {
  if (d == null) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

const oppInclude = {
  contactRecord: { include: { companyRecord: true } },
  easyFundLoan: { include: { lenderCompany: true } },
  masterCoverApplication: { include: { insurerCompany: true } },
} satisfies Prisma.OpportunityInclude;

function partyFromCompany(c: {
  id: string;
  name: string | null;
  companyEmail: string | null;
  phone: string | null;
  billingStreet: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string | null;
  xeroContactId: string | null;
}): BillToParty {
  return {
    kind: "company",
    recordId: c.id,
    name: c.name ?? "",
    email: c.companyEmail,
    phone: c.phone,
    addressLine1: c.billingStreet,
    city: c.billingCity,
    region: c.billingState,
    postalCode: c.billingPostalCode,
    country: c.billingCountry,
    xeroContactId: c.xeroContactId,
  };
}

function partyFromContact(c: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  mailingStreet: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingPostalCode: string | null;
  mailingCountry: string | null;
}): BillToParty {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return {
    kind: "contact",
    recordId: c.id,
    name: name || c.email || "",
    email: c.email,
    phone: c.phone ?? c.mobilePhone,
    addressLine1: c.mailingStreet,
    city: c.mailingCity,
    region: c.mailingState,
    postalCode: c.mailingPostalCode,
    country: c.mailingCountry,
    xeroContactId: null, // contacts don't cache a xero id column in v1
  };
}

export interface ResolvedInvoice {
  companyId: string | null;
  contactId: string | null;
  amount: number;
  reference: string;
  description: string;
  sensitivityClass: string;
  party: BillToParty;
}

/**
 * Resolve bill-to party + amount for an opportunity and invoice type. Reads any
 * financing satellite via the caller's tx, so RLS already guaranteed the caller
 * may see it (the route gates financing types to FINTECH/ADMIN).
 */
export async function resolveInvoice(
  tx: Prisma.TransactionClient,
  opportunityId: string,
  invoiceType: InvoiceType,
  overrides: { billToCompanyId?: string; billToContactId?: string; amount?: number } = {},
): Promise<Outcome<ResolvedInvoice>> {
  const cfg = INVOICE_TYPE_CONFIG[invoiceType];
  if (cfg.itemized) {
    return fail(400, "studio_itemized_not_supported_until_x1b");
  }

  const opp = await tx.opportunity.findUnique({
    where: { id: opportunityId },
    include: oppInclude,
  });
  if (!opp) return fail(404, "opportunity_not_found");

  const reference = opp.name ?? `Opportunity ${opp.id}`;

  // --- bill-to ---
  let party: BillToParty | null = null;
  if (invoiceType === "easyfund") {
    const lender = opp.easyFundLoan?.lenderCompany;
    if (!lender) return fail(400, "easyfund_lender_not_set");
    party = partyFromCompany(lender);
  } else if (invoiceType === "mastercover") {
    const insurer = opp.masterCoverApplication?.insurerCompany;
    if (!insurer) return fail(400, "mastercover_insurer_not_set");
    party = partyFromCompany(insurer);
  } else if (invoiceType === "other" && overrides.billToContactId) {
    const contact = await tx.contact.findUnique({ where: { id: overrides.billToContactId } });
    if (!contact) return fail(400, "bill_to_contact_not_found");
    party = partyFromContact(contact);
  } else if (invoiceType === "other" && overrides.billToCompanyId) {
    const company = await tx.company.findUnique({ where: { id: overrides.billToCompanyId } });
    if (!company) return fail(400, "bill_to_company_not_found");
    party = partyFromCompany(company);
  } else {
    // subscription + other(default): the primary contact's company.
    const company = opp.contactRecord?.companyRecord;
    if (!company) return fail(400, "primary_contact_company_not_set");
    party = partyFromCompany(company);
  }
  if (!party.name) return fail(400, "bill_to_party_has_no_name");

  // --- amount ---
  let amount: number | null;
  if (invoiceType === "mastercover") {
    // MasterCover referral fee is entered manually by Fintech at invoice time.
    amount = overrides.amount ?? null;
    if (amount == null) {
      return fail(400, "mastercover_amount_required: Fintech must enter the referral amount");
    }
  } else if (overrides.amount != null) {
    amount = overrides.amount; // manual override (e.g. 'other', or overriding subscription)
  } else if (invoiceType === "easyfund") {
    amount = toNumber(opp.easyFundLoan?.amountFromLender);
  } else {
    amount = toNumber(opp.opportunityAmount);
  }
  if (amount == null || amount <= 0) {
    return fail(400, `invoice_amount_missing_or_nonpositive (${invoiceType})`);
  }

  const description = cfg.description
    .replace("{opportunity_name}", reference)
    .replace("{company_name}", party.kind === "company" ? party.name : "");

  return ok({
    companyId: party.kind === "company" ? party.recordId : (opp.contactRecord?.companyId ?? null),
    contactId: party.kind === "contact" ? party.recordId : (opp.contactId ?? null),
    amount,
    reference,
    description,
    sensitivityClass: cfg.sensitivityClass,
    party,
  });
}

/** Single org in v1 — kept as a value so the emit payload/Invoice carry it. */
export const DEFAULT_ORG_KEY = "yachtway";

export interface CreatedDraft {
  invoiceId: string;
  reused: boolean;
  sensitivityClass: string;
}

/**
 * Resolve + create a local Invoice DRAFT (idempotent by opportunity+type). Does
 * NOT emit to Make. Used by the manual create route and the auto-draft-on-won
 * hook. Runs inside the caller's tx so RLS governs every read/write.
 */
export async function createInvoiceDraft(
  tx: Prisma.TransactionClient,
  args: {
    opportunityId: string;
    invoiceType: InvoiceType;
    currency: string;
    actorId?: string | null;
    actorRole?: string | null;
    billingProvider?: string;
    overrides?: { billToCompanyId?: string; billToContactId?: string; amount?: number };
  },
): Promise<Outcome<CreatedDraft>> {
  const key = idempotencyKeyFor(args.opportunityId, args.invoiceType);
  const existing = await tx.invoice.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    return ok({ invoiceId: existing.id, reused: true, sensitivityClass: existing.sensitivityClass });
  }

  const resolved = await resolveInvoice(tx, args.opportunityId, args.invoiceType, args.overrides ?? {});
  if (!resolved.ok) return resolved;
  const r = resolved.value;

  const invoice = await tx.invoice.create({
    data: {
      opportunityId: args.opportunityId,
      companyId: r.companyId,
      contactId: r.contactId,
      invoiceType: args.invoiceType,
      billingProvider: args.billingProvider ?? "xero",
      orgKey: DEFAULT_ORG_KEY,
      currency: args.currency,
      amount: r.amount,
      reference: r.reference,
      itemized: false,
      status: "draft",
      sensitivityClass: r.sensitivityClass,
      idempotencyKey: key,
      createdById: args.actorId ?? null,
      xeroContactId: r.party.xeroContactId,
    },
  });

  await logInvoiceActivity(tx, {
    event: "draft_created",
    invoiceId: invoice.id,
    companyId: r.companyId,
    contactId: r.contactId,
    sensitivityClass: r.sensitivityClass,
    actorId: args.actorId,
    detail: args.invoiceType,
  });

  await writeAudit(tx, {
    actorUserId: args.actorId,
    actorRole: args.actorRole,
    action: "create",
    resourceClass: invoiceResourceClass(args.invoiceType),
    tableName: "invoices",
    recordId: invoice.id,
    after: { status: "draft", invoiceType: args.invoiceType, amount: r.amount, sensitivityClass: r.sensitivityClass },
  });

  return ok({ invoiceId: invoice.id, reused: false, sensitivityClass: r.sensitivityClass });
}

/** An itemized line for the emit payload — Xero resolves price/account/tax from
 *  the ItemCode; crm_line_id round-trips so the callback can write amounts back. */
export interface ItemizedEmitLine {
  crm_line_id: string;
  item_code: string;
  quantity: number;
  description: string | null;
  unit_price: number | null;
}

/** The Make Scenario A payload — minimal by design (data minimization, §7).
 *  Pass `itemizedLines` for studio (ItemCode lines); otherwise a single lump-sum
 *  line is built from amount/account/tax. */
export function buildEmitPayload(args: {
  invoiceId: string;
  invoiceType: InvoiceType;
  orgKey: string | null;
  action: string;
  currency: string;
  reference: string;
  description: string;
  amount: number;
  party: BillToParty;
  idempotencyKey: string | null;
  itemizedLines?: ItemizedEmitLine[];
}): Record<string, unknown> {
  const cfg = INVOICE_TYPE_CONFIG[args.invoiceType];
  const lines =
    args.itemizedLines && args.itemizedLines.length > 0
      ? args.itemizedLines.map((li) => ({
          crm_line_id: li.crm_line_id,
          item_code: li.item_code,
          quantity: li.quantity,
          ...(li.description ? { description: li.description } : {}),
          ...(li.unit_price != null ? { unit_price: li.unit_price } : {}),
        }))
      : [
          {
            description: args.description,
            amount: args.amount,
            account_code: cfg.accountCode,
            tax_type: cfg.taxType,
          },
        ];
  return {
    crm_invoice_id: args.invoiceId,
    org_key: args.orgKey,
    invoice_type: args.invoiceType,
    action: args.action,
    currency: args.currency,
    reference: args.reference,
    due_days: cfg.dueDays,
    lines,
    bill_to: {
      xero_contact_id: args.party.xeroContactId,
      name: args.party.name,
      email: args.party.email,
      phone: args.party.phone,
      address: {
        line1: args.party.addressLine1,
        city: args.party.city,
        region: args.party.region,
        postal_code: args.party.postalCode,
        country: args.party.country,
      },
    },
    idempotency_key: args.idempotencyKey,
  };
}

// ---------------------------------------------------------------------------
// Itemized studio (X1b): line items + single/multi-opportunity invoices.
// ---------------------------------------------------------------------------

/** Per-foot | per-unit basis for a product code — the synced Product wins, else
 *  the FOOT_CODES fallback in @yachtway/shared. */
export async function basisForProduct(
  tx: Prisma.TransactionClient,
  code: string,
): Promise<"foot" | "unit"> {
  const product = await tx.product.findFirst({ where: { productCode: code } });
  const basis = product?.quantityBasis;
  if (basis === "foot" || basis === "unit") return basis;
  return basisForCode(code);
}

/** Add a studio line item to an opportunity, deriving quantity from the product
 *  basis (per-foot → vessel length; else entered qty / 1). */
export async function addLineItem(
  tx: Prisma.TransactionClient,
  args: {
    opportunityId: string;
    productCode: string;
    quantity?: number;
    unitPrice?: number;
    description?: string;
    vesselLengthFt?: number;
    actorId?: string | null;
  },
): Promise<Outcome<{ id: string; quantity: number }>> {
  const opp = await tx.opportunity.findUnique({
    where: { id: args.opportunityId },
    include: { relatedListingRecord: { select: { lengthFt: true, overallLengthFt: true } } },
  });
  if (!opp) return fail(404, "opportunity_not_found");

  const basis = await basisForProduct(tx, args.productCode);
  let quantity: number;
  if (args.quantity != null) {
    quantity = args.quantity;
  } else if (basis === "foot") {
    const lengthFt =
      args.vesselLengthFt ??
      (opp.relatedListingRecord?.lengthFt != null ? Number(opp.relatedListingRecord.lengthFt) : undefined) ??
      (opp.relatedListingRecord?.overallLengthFt != null ? Number(opp.relatedListingRecord.overallLengthFt) : undefined);
    try {
      quantity = quantityFor(args.productCode, { vesselLengthFt: lengthFt });
    } catch (e) {
      return fail(400, (e as Error).message);
    }
  } else {
    quantity = 1;
  }

  const line = await tx.opportunityLineItem.create({
    data: {
      opportunityId: args.opportunityId,
      productCode: args.productCode,
      quantity,
      ...(args.unitPrice != null ? { unitPrice: args.unitPrice } : {}),
      ...(args.description ? { description: args.description } : {}),
      createdById: args.actorId ?? null,
    },
  });
  return ok({ id: line.id, quantity });
}

/** Studio bill-to: StudioDetail bill-to company → studio company → primary
 *  contact's company. Returns the resolved company + party. */
async function resolveStudioBillTo(
  tx: Prisma.TransactionClient,
  opportunityId: string,
): Promise<Outcome<{ companyId: string; contactId: string | null; party: BillToParty; reference: string }>> {
  const opp = await tx.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      contactRecord: { include: { companyRecord: true } },
      studioDetail: { include: { billToCompanyRecord: true, companyRecord: true } },
    },
  });
  if (!opp) return fail(404, "opportunity_not_found");
  const company =
    opp.studioDetail?.billToCompanyRecord ??
    opp.studioDetail?.companyRecord ??
    opp.contactRecord?.companyRecord ??
    null;
  if (!company) return fail(400, "studio_bill_to_company_not_set");
  const party = partyFromCompany(company);
  if (!party.name) return fail(400, "bill_to_party_has_no_name");
  return ok({
    companyId: company.id,
    contactId: opp.contactId ?? null,
    party,
    reference: opp.name ?? `Opportunity ${opp.id}`,
  });
}

/** Deterministic idempotency key for a (possibly multi-opp) studio invoice. */
export function studioIdempotencyKey(opportunityIds: string[]): string {
  return `studio:${[...opportunityIds].sort().join("+")}`;
}

/**
 * Create an itemized studio invoice DRAFT from one or more opportunities that
 * share a bill-to. Aggregates their uninvoiced line items onto one invoice and
 * links each line back to it. Never emits (approval gate handles that).
 */
export async function createStudioInvoiceDraft(
  tx: Prisma.TransactionClient,
  args: { opportunityIds: string[]; currency: string; actorId?: string | null; actorRole?: string | null },
): Promise<Outcome<CreatedDraft>> {
  const ids = [...new Set(args.opportunityIds)];
  if (ids.length === 0) return fail(400, "no_opportunities");

  const key = studioIdempotencyKey(ids);
  const existing = await tx.invoice.findUnique({ where: { idempotencyKey: key } });
  if (existing) return ok({ invoiceId: existing.id, reused: true, sensitivityClass: existing.sensitivityClass });

  // All opps must resolve to the SAME bill-to company.
  let billToCompanyId: string | null = null;
  let primaryContactId: string | null = null;
  let party: BillToParty | null = null;
  const references: string[] = [];
  for (const id of ids) {
    const r = await resolveStudioBillTo(tx, id);
    if (!r.ok) return r;
    if (billToCompanyId && billToCompanyId !== r.value.companyId) {
      return fail(400, "multi_opp_bill_to_mismatch");
    }
    billToCompanyId = r.value.companyId;
    primaryContactId ??= r.value.contactId;
    party ??= r.value.party;
    references.push(r.value.reference);
  }

  // Gather uninvoiced line items across all the opps.
  const lineItems = await tx.opportunityLineItem.findMany({
    where: { opportunityId: { in: ids }, invoiceId: null },
  });
  if (lineItems.length === 0) return fail(400, "no_line_items");

  const provisionalAmount = lineItems.reduce(
    (sum, li) => sum + Number(li.quantity ?? 1) * Number(li.unitPrice ?? 0),
    0,
  );
  const reference = references.length === 1 ? references[0]! : `Studio Services (${references.length} bookings)`;

  const invoice = await tx.invoice.create({
    data: {
      opportunityId: ids[0]!,
      companyId: billToCompanyId,
      contactId: primaryContactId,
      invoiceType: "studio",
      orgKey: DEFAULT_ORG_KEY,
      currency: args.currency,
      amount: provisionalAmount,
      reference,
      itemized: true,
      status: "draft",
      sensitivityClass: "general",
      idempotencyKey: key,
      createdById: args.actorId ?? null,
      xeroContactId: party?.xeroContactId ?? null,
    },
  });

  await tx.opportunityLineItem.updateMany({
    where: { id: { in: lineItems.map((li) => li.id) } },
    data: { invoiceId: invoice.id },
  });

  await logInvoiceActivity(tx, {
    event: "draft_created",
    invoiceId: invoice.id,
    companyId: billToCompanyId,
    contactId: primaryContactId,
    sensitivityClass: "general",
    actorId: args.actorId,
    detail: `studio · ${lineItems.length} lines`,
  });
  await writeAudit(tx, {
    actorUserId: args.actorId,
    actorRole: args.actorRole,
    action: "create",
    resourceClass: "invoice.general",
    tableName: "invoices",
    recordId: invoice.id,
    after: { status: "draft", invoiceType: "studio", opportunityIds: ids, lineCount: lineItems.length },
  });

  return ok({ invoiceId: invoice.id, reused: false, sensitivityClass: "general" });
}

/** Build itemized emit lines from an invoice's linked OpportunityLineItems. */
export async function buildItemizedEmitLines(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<ItemizedEmitLine[]> {
  const lines = await tx.opportunityLineItem.findMany({ where: { invoiceId } });
  return lines
    .filter((li) => li.productCode)
    .map((li) => ({
      crm_line_id: li.id,
      item_code: li.productCode!,
      quantity: Number(li.quantity ?? 1),
      description: li.description ?? null,
      unit_price: li.unitPrice != null ? Number(li.unitPrice) : null,
    }));
}

export type InvoiceActivityEvent =
  | "estimate_created"
  | "draft_created"
  | "sent"
  | "paid";

const ACTIVITY_LABEL: Record<InvoiceActivityEvent, string> = {
  estimate_created: "Estimate created",
  draft_created: "Invoice draft created",
  sent: "Invoice sent",
  paid: "Invoice paid",
};

/**
 * Write an `invoice` timeline activity as a Message row (channel note, internal),
 * sensitivity-matched to the invoice so a rep never sees a financing invoice's
 * activity. Best-effort: callers should not fail the operation if this throws.
 */
export async function logInvoiceActivity(
  tx: Prisma.TransactionClient,
  args: {
    event: InvoiceActivityEvent;
    invoiceId: string;
    companyId: string | null;
    contactId: string | null;
    sensitivityClass: string;
    actorId?: string | null;
    detail?: string;
  },
): Promise<void> {
  const body = args.detail
    ? `${ACTIVITY_LABEL[args.event]} — ${args.detail}`
    : ACTIVITY_LABEL[args.event];
  await tx.message.create({
    data: {
      companyId: args.companyId,
      contactId: args.contactId,
      channel: "note",
      messageType: "invoice",
      direction: "internal",
      body,
      sensitivityClass: args.sensitivityClass,
      createdById: args.actorId ?? null,
      activityTimestamp: new Date(),
    },
  });
}

/** Rebuild the bill-to party from a stored invoice's company/contact (for emit
 *  at approve time). Prefers the billed company; falls back to the contact. */
export async function buildPartyForInvoice(
  tx: Prisma.TransactionClient,
  invoice: { companyId: string | null; contactId: string | null; xeroContactId: string | null },
): Promise<BillToParty | null> {
  if (invoice.companyId) {
    const c = await tx.company.findUnique({ where: { id: invoice.companyId } });
    if (c) {
      const p = partyFromCompany(c);
      if (invoice.xeroContactId) p.xeroContactId = invoice.xeroContactId;
      return p;
    }
  }
  if (invoice.contactId) {
    const c = await tx.contact.findUnique({ where: { id: invoice.contactId } });
    if (c) return partyFromContact(c);
  }
  return null;
}

/** invoice.general | invoice.financing for the type (re-exported for routes). */
export { invoiceResourceClass };

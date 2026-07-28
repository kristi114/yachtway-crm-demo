import { useSyncExternalStore } from "react";
import type { CurrencyCode } from "@/lib/currency";
import { getOpportunity, getCompany, OPPORTUNITIES, type Opportunity } from "@/lib/mock-data";
import {
  STUDIO_PASS_PRODUCT_ID,
  getProduct,
  hasMembershipPricing,
  priceProduct,
  MEMBERSHIP_KEY,
  MEMBER_VALUE,
  NON_MEMBER_VALUE,
  round2,
} from "@/lib/products";
import { activateStudioPass, STUDIO_PASS_PRICE } from "@/lib/studio-pass";


/**
 * Billing store - Invoices & Estimates issued by YachtWay to companies.
 * localStorage-backed for the demo; replace with real backend later.
 */

export type DocKind = "invoice" | "estimate";

export type DocStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "accepted"
  | "declined";

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  /** Catalog product this line came from, when picked from the catalog. */
  productId?: string;
  /** e.g. "ft", "month", "each" - shown next to the quantity. */
  unit_label?: string;
  /** Vessel this line is priced against (per-ft work). */
  vessel_name?: string;
  vessel_length_ft?: number;
  /** Human readable summary of the product options chosen. */
  options_summary?: string;
  /** Raw variable values for round-tripping. */
  variables?: Record<string, string | number | boolean>;
}


export type PaymentMethodKind = "card" | "ach" | "sepa" | "wire";

export const PAYMENT_METHODS: { value: PaymentMethodKind; label: string; hint: string }[] = [
  { value: "card", label: "Credit card", hint: "Auto-charged on file when the work is ready" },
  { value: "ach", label: "ACH direct debit (US)", hint: "Auto-debited from your bank account" },
  { value: "sepa", label: "SEPA direct debit (EU)", hint: "Auto-debited from your IBAN" },
  { value: "wire", label: "Wire transfer", hint: "We'll invoice you - manual payment" },
];

export const paymentMethodLabel = (m?: PaymentMethodKind) =>
  PAYMENT_METHODS.find((p) => p.value === m)?.label ?? "-";

export interface BillingDoc {
  id: string;
  kind: DocKind;
  number: string;                 // INV-2026-001 / EST-2026-014
  companyId: string;
  name: string;
  currency: CurrencyCode;
  status: DocStatus;
  issued_at: string;              // ISO
  due_at: string | null;          // ISO
  line_items: LineItem[];
  notes?: string;
  created_by_name: string;
  recipient_email?: string;
  recipient_contact_id?: string;
  recipient_contact_name?: string;
  cc_emails?: string[];
  share_token?: string;
  sentAt?: string;
  client_response_at?: string;
  client_response_note?: string;
  /** Linked opportunity (estimates generated from a deal, or invoices linked later). */
  opportunityId?: string;
  opportunityName?: string;
  /** Studio shoot location - drives whether a travel fee is applicable. */
  shootLocation?: string;
  /** Payment method the client picked when accepting an estimate - used for auto-charge. */
  payment_method?: PaymentMethodKind;
  /** Set on an estimate once it has been converted into an invoice. */
  converted_invoice_id?: string;
  /** Set on an invoice created from an accepted estimate. */
  converted_from_estimate_id?: string;
  converted_at?: string;
}

const STORAGE_KEY = "yw:billing:v1";

const SEED: BillingDoc[] = [
  {
    id: "inv_2026_0001",
    kind: "invoice",
    number: "INV-2026-0001",
    companyId: "cmp_shipyard_azimut",
    name: "Azimut Yachts",
    currency: "EUR",
    status: "paid",
    issued_at: "2026-05-14T09:00:00.000Z",
    due_at: "2026-06-14T00:00:00.000Z",
    line_items: [
      { id: "li_1", description: "Q2 2026 Premium listing plan (12 listings)", quantity: 12, unit_price: 450 },
      { id: "li_2", description: "3D tour production credits", quantity: 6, unit_price: 320 },
    ],
    notes: "Paid via SEPA transfer.",
    created_by_name: "Léa Fournier",
  },
  {
    id: "inv_2026_0002",
    kind: "invoice",
    number: "INV-2026-0002",
    companyId: "cmp_shipyard_azimut",
    name: "Azimut Yachts",
    currency: "EUR",
    status: "sent",
    issued_at: "2026-07-01T09:00:00.000Z",
    due_at: "2026-07-31T00:00:00.000Z",
    line_items: [
      { id: "li_1", description: "Q3 2026 Premium listing plan", quantity: 1, unit_price: 5400 },
    ],
    created_by_name: "Léa Fournier",
  },
  {
    id: "inv_2026_0003",
    kind: "invoice",
    number: "INV-2026-0003",
    companyId: "referral:ref_seed_1",
    name: "Marathon Speciality Finance",
    currency: "USD",
    status: "sent",
    issued_at: "2026-07-11T15:00:00.000Z",
    due_at: "2026-08-11T00:00:00.000Z",
    line_items: [
      { id: "li_1", description: "Referral fee - Whitfield - EasyFund 425k", quantity: 1, unit_price: 2796.87 },
    ],
    notes: "Referral (lender) · Whitfield - EasyFund 425k · Ref INV-1042",
    created_by_name: "Debbie",
    recipient_email: "ap@marathonsf.com",
  },
  {
    id: "est_2026_0014",
    kind: "estimate",
    number: "EST-2026-0014",
    companyId: "cmp_shipyard_azimut",
    name: "Azimut Yachts",
    currency: "EUR",
    status: "sent",
    issued_at: "2026-07-08T09:00:00.000Z",
    due_at: null,
    line_items: [
      { id: "li_1", description: "Custom microsite build", quantity: 1, unit_price: 12000 },
      { id: "li_2", description: "Annual hosting & maintenance", quantity: 1, unit_price: 2400 },
    ],
    notes: "Valid for 30 days.",
    created_by_name: "Léa Fournier",
  },
];

function load(): BillingDoc[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BillingDoc[]) : SEED;
  } catch {
    return SEED;
  }
}

let state: BillingDoc[] = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
}

export function subscribeBilling(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function snapshot() {
  return state;
}

export function useBillingStore() {
  return useSyncExternalStore(subscribeBilling, snapshot, snapshot);
}

export function listDocs(kind?: DocKind): BillingDoc[] {
  const list = kind ? state.filter((d) => d.kind === kind) : state;
  return [...list].sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1));
}

export function getDoc(id: string): BillingDoc | undefined {
  return state.find((d) => d.id === id);
}

export function docTotal(doc: BillingDoc): number {
  return doc.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
}

function nextNumber(kind: DocKind): string {
  const prefix = kind === "invoice" ? "INV" : "EST";
  const year = new Date().getFullYear();
  const count = state.filter((d) => d.kind === kind).length + 1;
  return `${prefix}-${year}-${String(count).padStart(4, "0")}`;
}

export function addDoc(
  input: Omit<BillingDoc, "id" | "number" | "issued_at"> & { issued_at?: string },
): BillingDoc {
  const doc: BillingDoc = {
    ...input,
    id: `${input.kind === "invoice" ? "inv" : "est"}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    number: nextNumber(input.kind),
    issued_at: input.issued_at ?? new Date().toISOString(),
  };
  const auto = autoOpportunityForDoc(doc);
  if (auto) {
    doc.opportunityId = auto.id;
    doc.opportunityName = auto.name;
  }
  state = [doc, ...state];
  persist();
  emit();
  return doc;
}

/**
 * Every invoice / estimate belongs to a deal: when the rep did not link an
 * opportunity we create one automatically so the work shows up in a pipeline.
 */
function autoOpportunityForDoc(doc: BillingDoc): Opportunity | undefined {
  if (doc.opportunityId) return undefined;
  // Invoices converted from an accepted estimate inherit that estimate's deal.
  if (doc.converted_from_estimate_id) return undefined;

  const categories = doc.line_items.map((li) => getProduct(li.productId)?.category ?? "");
  const isStudio = categories.some((c) => c.startsWith("Studio"));
  const pipeline: Opportunity["pipeline"] = isStudio ? "Studio" : "SaaS Sales";
  const stage = isStudio ? "Service Requested" : "Proposal Sent";
  const today = new Date().toISOString().slice(0, 10);
  const company = getCompany(doc.companyId);

  const opp: Opportunity = {
    id: `opp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name: `${company?.name ?? doc.name} - ${doc.number}`,
    pipeline,
    stage,
    amountUsd: docTotal(doc),
    closeDate: (doc.due_at ?? doc.issued_at).slice(0, 10) || today,
    owner: doc.created_by_name || "Me",
    companyId: doc.companyId ?? null,
    contactId: doc.recipient_contact_id ?? null,
    listingId: null,
    probability: doc.kind === "invoice" ? 90 : 40,
    stageEnteredAt: today,
    lostReason: null,
    closeReason: "",
  } as Opportunity;

  OPPORTUNITIES.unshift(opp);
  return opp;
}


/** True when the doc sells the Studio Pass membership subscription. */
function sellsStudioPass(doc: BillingDoc): boolean {
  return doc.line_items.some((li) => li.productId === STUDIO_PASS_PRODUCT_ID);
}

/**
 * A company only earns member rates once it actually pays for the pass:
 * an invoice marked paid, or an estimate the client accepted (auto-charged).
 */
function syncStudioPass(doc: BillingDoc | undefined, status: DocStatus) {
  if (!doc || !sellsStudioPass(doc)) return;
  if (status === "paid" || status === "accepted") {
    activateStudioPass(doc.companyId, doc.currency, { docId: doc.id, docNumber: doc.number });
  }
}

export function updateDocStatus(id: string, status: DocStatus) {
  state = state.map((d) => (d.id === id ? { ...d, status } : d));
  persist();
  emit();
  syncStudioPass(getDoc(id), status);
}


export type DocPatch = Partial<
  Pick<
    BillingDoc,
    | "status"
    | "currency"
    | "due_at"
    | "issued_at"
    | "line_items"
    | "notes"
    | "recipient_email"
    | "recipient_contact_id"
    | "recipient_contact_name"
    | "cc_emails"
    | "opportunityId"
    | "opportunityName"
    | "shootLocation"
    | "payment_method"
  >
>;

export function updateDoc(id: string, patch: DocPatch): BillingDoc | undefined {
  let updated: BillingDoc | undefined;
  state = state.map((d) => {
    if (d.id !== id) return d;
    updated = { ...d, ...patch };
    return updated;
  });
  persist();
  emit();
  return updated;
}


export function getDocByToken(token: string): BillingDoc | undefined {
  return state.find((d) => d.share_token === token);
}

function makeToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export interface SendDocOptions {
  recipient_email: string;
  recipient_contact_id?: string;
  recipient_contact_name?: string;
  cc_emails?: string[];
}

export function sendDoc(id: string, opts: SendDocOptions): BillingDoc | undefined {
  let updated: BillingDoc | undefined;
  state = state.map((d) => {
    if (d.id !== id) return d;
    updated = {
      ...d,
      status: "sent",
      recipient_email: opts.recipient_email,
      recipient_contact_id: opts.recipient_contact_id,
      recipient_contact_name: opts.recipient_contact_name,
      cc_emails: opts.cc_emails?.length ? opts.cc_emails : undefined,
      share_token: d.share_token ?? makeToken(),
      sentAt: new Date().toISOString(),
    };
    return updated;
  });
  persist();
  emit();
  return updated;
}

export function respondToDoc(
  token: string,
  response: "accepted" | "declined",
  note?: string,
  paymentMethod?: PaymentMethodKind,
): BillingDoc | undefined {
  let updated: BillingDoc | undefined;
  state = state.map((d) => {
    if (d.share_token !== token) return d;
    updated = {
      ...d,
      status: response,
      client_response_at: new Date().toISOString(),
      client_response_note: note?.trim() || undefined,
      payment_method: paymentMethod ?? d.payment_method,
    };
    return updated;
  });
  persist();
  emit();
  syncStudioPass(updated, response);
  if (updated && response === "accepted" && updated.kind === "estimate") {
    convertEstimateToInvoice(updated.id);
  }

  return getDocByToken(token);
}

/** Estimates accepted by the client become invoices automatically. */
export function convertEstimateToInvoice(estimateId: string): BillingDoc | undefined {
  const est = getDoc(estimateId);
  if (!est || est.kind !== "estimate") return undefined;
  if (est.converted_invoice_id) return getDoc(est.converted_invoice_id);

  const opp = est.opportunityId ? getOpportunity(est.opportunityId) : undefined;
  const isStudio = opp?.pipeline === "Studio";
  const due = isStudio ? null : new Date();
  if (due) due.setDate(due.getDate() + 14);

  const invoice = addDoc({
    kind: "invoice",
    companyId: est.companyId,
    name: est.name,
    currency: est.currency,
    status: "sent",
    due_at: due ? due.toISOString() : null,
    line_items: est.line_items.map((li) => ({ ...li })),
    notes: [est.notes, `Converted from accepted estimate ${est.number}.`]
      .filter(Boolean)
      .join("\n"),
    created_by_name: est.created_by_name,
    recipient_email: est.recipient_email,
    recipient_contact_id: est.recipient_contact_id,
    recipient_contact_name: est.recipient_contact_name,
    cc_emails: est.cc_emails,
    opportunityId: est.opportunityId,
    opportunityName: est.opportunityName,
    payment_method: est.payment_method,
    converted_from_estimate_id: est.id,
    share_token: est.share_token ? `${est.share_token}i` : undefined,
    sentAt: new Date().toISOString(),
  });

  state = state.map((d) =>
    d.id === est.id
      ? { ...d, converted_invoice_id: invoice.id, converted_at: new Date().toISOString() }
      : d,
  );
  persist();
  emit();
  return invoice;
}

export interface StudioPassSavings {
  /** Sum of the non-member premium currently being charged. */
  savings: number;
  /** What the same lines would cost at member rates. */
  memberTotal: number;
  nonMemberTotal: number;
  /** Studio Pass cost being compared against (199 / month). */
  passPrice: number;
  /** Net benefit after paying for one month of the pass. */
  netFirstMonth: number;
  /** Number of lines priced at the non-member rate. */
  lineCount: number;
  /** True when the pass is already being sold on this document. */
  passOnDoc: boolean;
}

/**
 * How much the client would save on this document at member rates - shown on
 * invoices / estimates so reps can pitch the Studio Pass.
 */
export function studioPassSavings(lineItems: LineItem[]): StudioPassSavings | null {
  let memberTotal = 0;
  let nonMemberTotal = 0;
  let lineCount = 0;
  const passOnDoc = lineItems.some((li) => li.productId === STUDIO_PASS_PRODUCT_ID);

  for (const li of lineItems) {
    const product = getProduct(li.productId);
    if (!product || !hasMembershipPricing(product)) continue;
    if (li.variables?.[MEMBERSHIP_KEY] === MEMBER_VALUE) continue;

    const values = { ...(li.variables ?? {}) };
    const nonMember = priceProduct(product, li.quantity, {
      ...values,
      [MEMBERSHIP_KEY]: NON_MEMBER_VALUE,
    });
    const member = priceProduct(product, li.quantity, {
      ...values,
      [MEMBERSHIP_KEY]: MEMBER_VALUE,
    });
    // Prefer the amount actually on the line so manual edits are respected.
    const charged = round2(li.quantity * li.unit_price) || nonMember.total;
    nonMemberTotal += charged;
    memberTotal += member.total;
    lineCount += 1;
  }

  const savings = round2(nonMemberTotal - memberTotal);
  if (lineCount === 0 || savings <= 0) return null;

  return {
    savings,
    memberTotal: round2(memberTotal),
    nonMemberTotal: round2(nonMemberTotal),
    passPrice: STUDIO_PASS_PRICE,
    netFirstMonth: round2(savings - STUDIO_PASS_PRICE),
    lineCount,
    passOnDoc,
  };
}

export function listDocsForOpportunity(opportunityId: string): BillingDoc[] {
  return state
    .filter((d) => d.opportunityId === opportunityId)
    .sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1));
}

export function removeDoc(id: string) {
  state = state.filter((d) => d.id !== id);
  persist();
  emit();
}


export const STATUS_STYLES: Record<DocStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-brand/15 text-brand-deep border border-brand/30",
  paid: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  overdue: "bg-destructive text-destructive-foreground",
  accepted: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  declined: "bg-muted text-muted-foreground line-through",
};

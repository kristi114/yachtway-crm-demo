import { useSyncExternalStore } from "react";
import type { CurrencyCode } from "@/lib/currency";
import { formatMoney } from "@/lib/currency";
import { addDoc, removeDoc, updateDocStatus, type DocStatus } from "@/lib/billing";

/**
 * Referrals ledger for the Fintech flow.
 *
 * Each record represents either:
 *  - a lender bill (YachtWay bills a lender for a referred loan), or
 *  - a dealer bill/payout (YachtWay bills or pays a dealer for the referral).
 *
 * When a referral record is created it is ALSO written into the billing
 * store (as an invoice) so accounting / the Billing department sees it in
 * All invoices. Deleting/updating the referral record keeps them in sync.
 */

export type ReferralType = "lender_bill" | "dealer_bill" | "dealer_payout";

export type ReferralStatus =
  | "draft"
  | "approved"     // approved, not yet sent
  | "sent"         // invoice sent to counterparty
  | "paid"
  | "credit"       // dealer credit issued
  | "bill";        // outstanding bill

export interface ReferralRecord {
  id: string;
  type: ReferralType;
  opportunity_id: string;
  opportunity_name: string;
  counterparty_name: string;      // lender or dealer name
  counterparty_email?: string;
  amount: number;
  currency: CurrencyCode;
  status: ReferralStatus;
  reference: string;              // Xero invoice # placeholder or free-text reference
  notes?: string;
  billing_doc_id?: string;        // link to mirrored billing invoice
  created_by_name: string;
  createdAt: string;             // ISO
  updated_at: string;             // ISO
}

const STORAGE_KEY = "yw:referrals:v1";

const SEED: ReferralRecord[] = [
  {
    id: "ref_seed_1",
    type: "lender_bill",
    opportunity_id: "opp_003",
    opportunity_name: "Whitfield - EasyFund 425k",
    counterparty_name: "Marathon Speciality Finance",
    counterparty_email: "ap@marathonsf.com",
    amount: 2796.87,
    currency: "USD",
    status: "sent",
    reference: "INV-1042",
    billing_doc_id: "inv_2026_0003",
    created_by_name: "Debbie",
    createdAt: "2026-07-11T15:00:00.000Z",
    updated_at: "2026-07-11T15:00:00.000Z",
  },
  {
    id: "ref_seed_2",
    type: "dealer_bill",
    opportunity_id: "opp_003",
    opportunity_name: "Whitfield - EasyFund 425k",
    counterparty_name: "MN Marine Group",
    amount: 537.86,
    currency: "USD",
    status: "bill",
    reference: "Marathon Speciality Finance",
    created_by_name: "Debbie",
    createdAt: "2026-07-11T15:05:00.000Z",
    updated_at: "2026-07-11T15:05:00.000Z",
  },
  {
    id: "ref_seed_3",
    type: "lender_bill",
    opportunity_id: "opp_004",
    opportunity_name: "Petrova - Azimut Grande 27M",
    counterparty_name: "Northstar Yacht Finance",
    amount: 5400,
    currency: "USD",
    status: "approved",
    reference: "",
    created_by_name: "Debbie",
    createdAt: "2026-07-10T12:00:00.000Z",
    updated_at: "2026-07-10T12:00:00.000Z",
  },
];

function load(): ReferralRecord[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReferralRecord[]) : SEED;
  } catch {
    return SEED;
  }
}

let state: ReferralRecord[] = load();
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

export function subscribeReferrals(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function snapshot() {
  return state;
}

export function useReferralsStore() {
  return useSyncExternalStore(subscribeReferrals, snapshot, snapshot);
}

export function listReferrals(): ReferralRecord[] {
  return [...state].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listReferralsForOpportunity(oppId: string): ReferralRecord[] {
  return listReferrals().filter((r) => r.opportunity_id === oppId);
}

export function getReferral(id: string): ReferralRecord | undefined {
  return state.find((r) => r.id === id);
}

function referralStatusToDocStatus(s: ReferralStatus): DocStatus {
  if (s === "paid") return "paid";
  if (s === "sent" || s === "bill" || s === "approved") return "sent";
  return "draft";
}

function referralLineDescription(r: ReferralRecord): string {
  if (r.type === "lender_bill") return `Referral fee - ${r.opportunity_name}`;
  if (r.type === "dealer_bill") return `Dealer chargeback - ${r.opportunity_name}`;
  return `Dealer payout - ${r.opportunity_name}`;
}

function mirrorToBilling(r: ReferralRecord): string {
  // Mirror the referral into the billing store as an invoice so Accounting /
  // the Billing department sees it. Only lender/dealer BILLS are mirrored -
  // dealer payouts are outgoing, not customer invoices.
  if (r.type === "dealer_payout") return "";
  const doc = addDoc({
    kind: "invoice",
    companyId: `referral:${r.id}`,
    name: r.counterparty_name,
    currency: r.currency,
    status: referralStatusToDocStatus(r.status),
    due_at: null,
    line_items: [
      { id: "li_1", description: referralLineDescription(r), quantity: 1, unit_price: r.amount },
    ],
    notes: `Referral (${r.type === "lender_bill" ? "lender" : "dealer"}) · ${r.opportunity_name}${r.reference ? ` · Ref ${r.reference}` : ""}`,
    created_by_name: r.created_by_name,
    recipient_email: r.counterparty_email,
  });
  return doc.id;
}

export function addReferral(
  input: Omit<ReferralRecord, "id" | "createdAt" | "updated_at" | "billing_doc_id">,
): ReferralRecord {
  const now = new Date().toISOString();
  const rec: ReferralRecord = {
    ...input,
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updated_at: now,
  };
  const docId = mirrorToBilling(rec);
  if (docId) rec.billing_doc_id = docId;

  state = [rec, ...state];
  persist();
  emit();
  return rec;
}

export function updateReferral(id: string, patch: Partial<ReferralRecord>): ReferralRecord | undefined {
  let updated: ReferralRecord | undefined;
  state = state.map((r) => {
    if (r.id !== id) return r;
    updated = { ...r, ...patch, updated_at: new Date().toISOString() };
    return updated;
  });
  if (updated?.billing_doc_id) {
    updateDocStatus(updated.billing_doc_id, referralStatusToDocStatus(updated.status));
  }
  persist();
  emit();
  return updated;
}

export function removeReferral(id: string) {
  const rec = state.find((r) => r.id === id);
  if (rec?.billing_doc_id) removeDoc(rec.billing_doc_id);
  state = state.filter((r) => r.id !== id);
  persist();
  emit();
}

export function formatReferralAmount(r: ReferralRecord): string {
  return formatMoney(r.amount, r.currency);
}

export const REFERRAL_STATUS_STYLES: Record<ReferralStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-brand/15 text-brand-deep border border-brand/30",
  sent: "bg-sky-500/15 text-sky-600 border border-sky-500/30",
  paid: "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30",
  credit: "bg-amber-500/15 text-amber-700 border border-amber-500/30",
  bill: "bg-orange-500/15 text-orange-700 border border-orange-500/30",
};

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  sent: "Invoice sent",
  paid: "Paid",
  credit: "Credit",
  bill: "Bill",
};

export const REFERRAL_TYPE_LABEL: Record<ReferralType, string> = {
  lender_bill: "Lender bill",
  dealer_bill: "Dealer bill",
  dealer_payout: "Dealer payout",
};

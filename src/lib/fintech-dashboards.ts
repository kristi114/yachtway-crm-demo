import { useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import { Clock, CheckCircle2 } from "lucide-react";
import { CONTACTS } from "@/lib/mock-data";

/**
 * Fintech deals store (Lender / Insurance).
 *
 * Editable, partner-scoped records behind the Lender & Insurance dashboards.
 * Each deal carries a `partnerId` so a partner login only sees/edits its own
 * deals. localStorage-backed for the mock; the seam for the EasyFund/MasterCover
 * reporting + write APIs.
 */

export type FintechProduct = "lender" | "insurance";

export interface Deal {
  id: string;
  product: FintechProduct;
  partnerId: string;
  applicant: string;
  contactId?: string;
  amount: number;
  submittedOn: string;
  status: string;
  stage: string;
  vessel: string;
  tab: string;
}

/** Partner organizations (the "logins"). */
export const PARTNERS: { id: string; name: string; product: FintechProduct }[] = [
  { id: "lp_oceanline", name: "Oceanline Capital", product: "lender" },
  { id: "lp_meridian", name: "Meridian Marine Finance", product: "lender" },
  { id: "ip_mastercover", name: "MasterCover Underwriters", product: "insurance" },
];
export function partnerName(id?: string): string {
  return PARTNERS.find((p) => p.id === id)?.name ?? "—";
}

const VESSELS = [
  "2022 Sunseeker Predator 74",
  "2023 Vanquish Yachts VQ555 Sports",
  "2023 Pershing 8X",
  "2021 Azimut S6",
  "2024 Riva 68 Diable",
  "2020 Prestige 520",
  "2022 Ferretti 500",
  "2023 Princess Y72",
  "2021 Beneteau Gran Turismo 45",
  "2024 Fairline Squadron 68",
];

const POOL = CONTACTS.filter((c) => c.firstName);
function who(i: number): { applicant: string; contactId?: string } {
  const c = POOL[i % POOL.length];
  if (!c) return { applicant: "Unknown applicant" };
  return { applicant: `${c.firstName} ${c.lastName}`.trim(), contactId: c.id };
}
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString();
}

/* ------------------------------------------------------------------ */
/* Config (per product)                                                */
/* ------------------------------------------------------------------ */

export interface DashboardTab {
  key: string;
  label: string;
  icon: LucideIcon;
}
export interface DashboardConfig {
  key: FintechProduct;
  title: string;
  subtitle: string;
  amountLabel: string;
  tabs: DashboardTab[];
  closedTab: string;
  statusOptions: string[];
  stageOptions: string[];
}

export function lenderConfig(): DashboardConfig {
  return {
    key: "lender",
    title: "Lender — EasyFund",
    subtitle: "Loan applications across the EasyFund pipeline.",
    amountLabel: "Loan Amount",
    tabs: [
      { key: "in_progress", label: "In Progress", icon: Clock },
      { key: "funded", label: "Funded", icon: CheckCircle2 },
    ],
    closedTab: "funded",
    statusOptions: ["New", "In Progress", "Approved", "Rejected", "Funded"],
    stageOptions: ["Application Assessment", "Conditional Approval", "Underwriting", "Docs Out", "Funded"],
  };
}
export function insuranceConfig(): DashboardConfig {
  return {
    key: "insurance",
    title: "Insurance — MasterCover",
    subtitle: "MasterCover quotes and bound policies.",
    amountLabel: "Premium",
    tabs: [
      { key: "in_progress", label: "In Progress", icon: Clock },
      { key: "bound", label: "Bound", icon: CheckCircle2 },
    ],
    closedTab: "bound",
    statusOptions: ["Quote", "In Progress", "Rejected", "Bound"],
    stageOptions: ["Quote Requested", "Underwriting", "Bound", "Renewed"],
  };
}

const CLOSED_STATUSES = new Set(["Funded", "Bound", "Active", "Completed"]);

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

function seed(): Deal[] {
  return [
    // Lender — Oceanline Capital
    { id: "ln_1", product: "lender", partnerId: "lp_oceanline", ...who(0), amount: 80_450, submittedOn: daysAgo(2), status: "New", stage: "Application Assessment", vessel: VESSELS[0], tab: "in_progress" },
    { id: "ln_2", product: "lender", partnerId: "lp_oceanline", ...who(1), amount: 240_000, submittedOn: daysAgo(3), status: "In Progress", stage: "Conditional Approval", vessel: VESSELS[1], tab: "in_progress" },
    { id: "ln_3", product: "lender", partnerId: "lp_oceanline", ...who(2), amount: 425_000, submittedOn: daysAgo(4), status: "In Progress", stage: "Underwriting", vessel: VESSELS[2], tab: "in_progress" },
    { id: "ln_6", product: "lender", partnerId: "lp_oceanline", ...who(5), amount: 1_200_000, submittedOn: daysAgo(9), status: "Funded", stage: "Funded", vessel: VESSELS[5], tab: "funded" },
    { id: "ln_7", product: "lender", partnerId: "lp_oceanline", ...who(6), amount: 318_000, submittedOn: daysAgo(12), status: "Funded", stage: "Funded", vessel: VESSELS[6], tab: "funded" },
    // Lender — Meridian Marine Finance (different partner)
    { id: "ln_4", product: "lender", partnerId: "lp_meridian", ...who(3), amount: 155_000, submittedOn: daysAgo(4), status: "Rejected", stage: "Application Assessment", vessel: VESSELS[3], tab: "in_progress" },
    { id: "ln_5", product: "lender", partnerId: "lp_meridian", ...who(4), amount: 92_500, submittedOn: daysAgo(6), status: "New", stage: "Application Assessment", vessel: VESSELS[4], tab: "in_progress" },
    { id: "ln_8", product: "lender", partnerId: "lp_meridian", ...who(7), amount: 540_000, submittedOn: daysAgo(15), status: "Funded", stage: "Funded", vessel: VESSELS[7], tab: "funded" },
    // Insurance — MasterCover Underwriters
    { id: "ins_1", product: "insurance", partnerId: "ip_mastercover", ...who(2), amount: 4_850, submittedOn: daysAgo(1), status: "Quote", stage: "Quote Requested", vessel: VESSELS[2], tab: "in_progress" },
    { id: "ins_2", product: "insurance", partnerId: "ip_mastercover", ...who(4), amount: 7_200, submittedOn: daysAgo(3), status: "In Progress", stage: "Underwriting", vessel: VESSELS[4], tab: "in_progress" },
    { id: "ins_3", product: "insurance", partnerId: "ip_mastercover", ...who(8), amount: 3_400, submittedOn: daysAgo(5), status: "Rejected", stage: "Underwriting", vessel: VESSELS[8], tab: "in_progress" },
    { id: "ins_5", product: "insurance", partnerId: "ip_mastercover", ...who(5), amount: 12_600, submittedOn: daysAgo(11), status: "Bound", stage: "Bound", vessel: VESSELS[5], tab: "bound" },
    { id: "ins_6", product: "insurance", partnerId: "ip_mastercover", ...who(6), amount: 5_950, submittedOn: daysAgo(14), status: "Bound", stage: "Renewed", vessel: VESSELS[6], tab: "bound" },
  ];
}

const KEY = "yw:fintech-deals:v1";

function load(): Deal[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Deal[];
    return Array.isArray(parsed) && parsed.length ? parsed : seed();
  } catch {
    return seed();
  }
}

let deals: Deal[] = load();
const listeners = new Set<() => void>();
const snap = () => deals;
function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(deals));
  } catch {
    /* ignore */
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useDeals(): Deal[] {
  return useSyncExternalStore(subscribe, snap, snap);
}

/** Deals for a product, optionally scoped to one partner. */
export function dealsFor(all: Deal[], product: FintechProduct, partnerId?: string | null): Deal[] {
  return all.filter((d) => d.product === product && (!partnerId || d.partnerId === partnerId));
}

export function updateDeal(id: string, patch: Partial<Deal>) {
  deals = deals.map((d) => {
    if (d.id !== id) return d;
    const next = { ...d, ...patch };
    // Keep the tab consistent with the (possibly changed) status.
    if (patch.status) {
      const cfg = next.product === "lender" ? lenderConfig() : insuranceConfig();
      next.tab = CLOSED_STATUSES.has(next.status) ? cfg.closedTab : "in_progress";
    }
    return next;
  });
  persist();
  listeners.forEach((l) => l());
}

/** Contact ids attached to a partner's deals — the contacts a partner may see. */
export function allowedContactIdsForPartner(partnerId: string): Set<string> {
  return new Set(deals.filter((d) => d.partnerId === partnerId && d.contactId).map((d) => d.contactId as string));
}

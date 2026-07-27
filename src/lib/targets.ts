import { useSyncExternalStore } from "react";
import { COMPANIES, OPPORTUNITIES, companiesOwnedBy } from "@/lib/mock-data";
import { DEMO_USER_LIST } from "@/lib/auth";

export type TargetPeriod = "month" | "quarter" | "year";

export interface TargetSet {
  new_dealers: number;         // count
  broker_seats_sold: number;   // count of broker seats sold in period
  websites_sold: number;       // count of Custom Website deployments sold in period
  activation_rate: number;     // percent 0-100 (% of owned dealers with any service active)
  studio_revenue: number;      // USD, from Studio pipeline wins in period
  pipeline_value: number;      // USD, sum of open opp value at period end
  won_revenue: number;         // USD, sum of won opps in period across all pipelines
}

export const TARGET_METRICS: {
  key: keyof TargetSet;
  label: string;
  unit: "count" | "percent" | "usd";
  hint: string;
}[] = [
  { key: "new_dealers", label: "New Dealers Signed", unit: "count", hint: "Dealer accounts activated in the period" },
  { key: "broker_seats_sold", label: "Broker Seats Sold", unit: "count", hint: "New broker seats added across owned dealers" },
  { key: "websites_sold", label: "Websites Sold", unit: "count", hint: "Custom Website deployments launched in the period" },
  { key: "activation_rate", label: "User Activation Rate", unit: "percent", hint: "% of owned dealers with at least one service active" },
  { key: "studio_revenue", label: "Studio Revenue", unit: "usd", hint: "Won opps in the Studio pipeline" },
  { key: "pipeline_value", label: "Open Pipeline Value", unit: "usd", hint: "Sum of open opportunity amounts" },
  { key: "won_revenue", label: "Won Revenue", unit: "usd", hint: "Sum of all won opps in the period" },
];

export const DEFAULT_TARGETS: Record<TargetPeriod, TargetSet> = {
  month: { new_dealers: 3, broker_seats_sold: 15, websites_sold: 2, activation_rate: 70, studio_revenue: 15_000, pipeline_value: 250_000, won_revenue: 40_000 },
  quarter: { new_dealers: 9, broker_seats_sold: 45, websites_sold: 6, activation_rate: 75, studio_revenue: 45_000, pipeline_value: 600_000, won_revenue: 120_000 },
  year: { new_dealers: 36, broker_seats_sold: 180, websites_sold: 24, activation_rate: 80, studio_revenue: 180_000, pipeline_value: 1_500_000, won_revenue: 500_000 },
};

type Store = Record<string, Partial<Record<TargetPeriod, Partial<TargetSet>>>>;

const STORAGE_KEY = "yw:targets:v1";

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

let state: Store = load();
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

export function subscribeTargets(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function snapshot() {
  return state;
}

export function useTargetsStore() {
  return useSyncExternalStore(subscribeTargets, snapshot, snapshot);
}

export function getTargets(userId: string, period: TargetPeriod): TargetSet {
  const stored = state[userId]?.[period] ?? {};
  return { ...DEFAULT_TARGETS[period], ...stored };
}

export function setTargets(userId: string, period: TargetPeriod, values: TargetSet) {
  state = {
    ...state,
    [userId]: {
      ...(state[userId] ?? {}),
      [period]: { ...values },
    },
  };
  persist();
  emit();
}

// ==============================================================
// Period math
// ==============================================================
export function periodRange(period: TargetPeriod, ref = new Date()): { start: Date; end: Date; label: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  if (period === "month") {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    return { start, end, label: start.toLocaleString(undefined, { month: "long", year: "numeric" }) };
  }
  if (period === "quarter") {
    const q = Math.floor(m / 3);
    const start = new Date(y, q * 3, 1);
    const end = new Date(y, q * 3 + 3, 1);
    return { start, end, label: `Q${q + 1} ${y}` };
  }
  const start = new Date(y, 0, 1);
  const end = new Date(y + 1, 0, 1);
  return { start, end, label: `${y}` };
}

function inRange(dateStr: string | undefined | null, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  return t >= start.getTime() && t < end.getTime();
}

const WON_STAGES = new Set([
  "Closed Won", "Won", "Completed", "Contract", "Funded", "Booked",
]);

export function computeActuals(userId: string, period: TargetPeriod): TargetSet {
  const { start, end } = periodRange(period);
  const owned = companiesOwnedBy(userId);
  const ownerName = DEMO_USER_LIST.find((u) => u.id === userId)?.name ?? "";

  // Dealer-scope: Main-vertical dealers/brokerages
  const dealers = owned.filter(
    (c) => c.vertical === "Main" && (c.companyType === "Dealer" || c.companyType === "Brokerage"),
  );

  const newDealers = dealers.filter((c) => inRange(c.activeCustomerDate, start, end)).length;

  const activatedCount = dealers.filter((c) => {
    const s = c.servicesUsed;
    return s.saas || s.studio || s.mastercover || s.easyclose || s.connectCrm || s.easyfund || s.live || s.vato;
  }).length;
  const activationRate = dealers.length > 0
    ? Math.round((activatedCount / dealers.length) * 100)
    : 0;

  const ownedIds = new Set(owned.map((c) => c.id));
  const myOpps = OPPORTUNITIES.filter(
    (o) => (o.companyId && ownedIds.has(o.companyId)) || o.owner === ownerName,
  );

  const wonInPeriod = myOpps.filter((o) => WON_STAGES.has(o.stage) && inRange(o.closeDate, start, end));

  const studioRevenue = wonInPeriod
    .filter((o) => o.pipeline === "Studio")
    .reduce((s, o) => s + o.amountUsd, 0);
  const wonRevenue = wonInPeriod.reduce((s, o) => s + o.amountUsd, 0);

  const pipelineValue = myOpps
    .filter((o) => !WON_STAGES.has(o.stage) && o.stage !== "Closed Lost" && o.stage !== "Lost")
    .reduce((s, o) => s + o.amountUsd, 0);

  // Broker seats sold: sum crmBrokerCount across dealers newly activated in period.
  const brokerSeatsSold = dealers
    .filter((c) => inRange(c.activeCustomerDate, start, end))
    .reduce((s, c) => s + (c.crmBrokerCount ?? 0), 0);

  // Websites sold: dealers newly activated in period who have Custom Website enabled.
  const websitesSold = dealers.filter(
    (c) => inRange(c.activeCustomerDate, start, end) && c.customWebsiteEnabled,
  ).length;

  return {
    new_dealers: newDealers,
    broker_seats_sold: brokerSeatsSold,
    websites_sold: websitesSold,
    activation_rate: activationRate,
    studio_revenue: studioRevenue,
    pipeline_value: pipelineValue,
    won_revenue: wonRevenue,
  };
}

import type { CurrencyCode } from "@/lib/currency";

export function formatTargetValue(
  v: number,
  unit: "count" | "percent" | "usd",
  currency: CurrencyCode = "USD",
): string {
  if (unit === "percent") return `${Math.round(v)}%`;
  if (unit === "usd") {
    return new Intl.NumberFormat(
      currency === "USD" ? "en-US" : currency === "GBP" ? "en-GB" : "de-DE",
      { style: "currency", currency, maximumFractionDigits: 0 },
    ).format(v);
  }
  return `${Math.round(v)}`;
}

// A separate sanity constant: sales reps eligible for targets
export function repUsers() {
  return DEMO_USER_LIST.filter((u) => u.role === "sales_rep" || u.role === "fintech");
}

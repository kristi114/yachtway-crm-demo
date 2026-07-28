// ==========================================================
// Fintech revenue / profit + bank tool adoption
// ----------------------------------------------------------
// Revenue is derived from won opportunities in the EasyFund and
// MasterCover pipelines with a close date inside the current
// calendar year (annual = YTD booked).
//
// Profit uses a per-product gross-margin assumption (payouts to
// lending partners, underwriting + servicing cost). Swap these for
// real COGS once accounting feeds land.
// ==========================================================

import { COMPANIES, OPPORTUNITIES, type Company } from "./mock-data";

export const FINTECH_MARGINS = {
  easyfund: 0.62,     // referral fee net of partner rev-share
  mastercover: 0.48,  // premium commission net of carrier costs
} as const;

const WON_STAGES = new Set([
  "Closed Won", "Won", "Completed", "Contract", "Funded", "Booked",
]);

export interface ProductPnl {
  key: "easyfund" | "mastercover";
  label: string;
  /** Booked revenue this calendar year. */
  annualRevenue: number;
  /** Gross profit = revenue * margin. */
  annualProfit: number;
  marginPct: number;
  wonDeals: number;
  /** Still-open pipeline for the same product. */
  openPipeline: number;
}

function pnlFor(key: "easyfund" | "mastercover", pipeline: string, label: string): ProductPnl {
  const year = new Date().getFullYear();
  let annualRevenue = 0, wonDeals = 0, openPipeline = 0;
  for (const o of OPPORTUNITIES) {
    if (o.pipeline !== pipeline) continue;
    const won = WON_STAGES.has(o.stage);
    const inYear = new Date(o.closeDate).getFullYear() === year;
    if (won && inYear) { annualRevenue += o.amountUsd; wonDeals += 1; }
    else if (!won && o.stage !== "Closed Lost" && o.stage !== "Lost") openPipeline += o.amountUsd;
  }
  const marginPct = FINTECH_MARGINS[key];
  return {
    key, label, annualRevenue, wonDeals, openPipeline,
    marginPct: Math.round(marginPct * 100),
    annualProfit: Math.round(annualRevenue * marginPct),
  };
}

/** EasyFund + MasterCover annual revenue and profit. */
export function fintechProductPnl(): ProductPnl[] {
  return [
    pnlFor("easyfund", "EasyFund", "EasyFund"),
    pnlFor("mastercover", "MasterCover", "MasterCover"),
  ];
}

// ---------------- Bank tool adoption ----------------

// Tools a bank / lender partner can be live on. MasterCover (insurance) and the
// generic API-connected flag are intentionally excluded — they aren't lending
// products, so they don't belong on the bank-partner adoption view.
export const BANK_TOOLS = [
  { key: "vato", label: "VATO valuations", hint: "Vessel valuation & titling checks" },
  { key: "easyfund", label: "Loan applications", hint: "EasyFund application intake" },
] as const;

export type BankToolKey = (typeof BANK_TOOLS)[number]["key"];

export function bankPartners(): Company[] {
  return COMPANIES.filter(
    (c) => c.companyType === "Bank" || c.companyType === "Lender" || c.companyType === "Insurance",
  );
}

export function bankUsesTool(c: Company, key: BankToolKey): boolean {
  return Boolean(c.servicesUsed[key]);
}

export interface BankToolAdoption {
  key: BankToolKey;
  label: string;
  hint: string;
  using: number;
  notUsing: number;
  total: number;
  pct: number;
}

export function bankToolAdoption(): BankToolAdoption[] {
  const banks = bankPartners();
  const total = Math.max(1, banks.length);
  return BANK_TOOLS.map((t) => {
    const using = banks.filter((c) => bankUsesTool(c, t.key)).length;
    return {
      key: t.key, label: t.label, hint: t.hint,
      using, notUsing: banks.length - using, total: banks.length,
      pct: Math.round((using / total) * 100),
    };
  });
}

/** Banks live on at least one tool vs banks on none. */
export function bankEngagementSplit() {
  const banks = bankPartners();
  const active = banks.filter((c) => BANK_TOOLS.some((t) => bankUsesTool(c, t.key)));
  const dormant = banks.filter((c) => !BANK_TOOLS.some((t) => bankUsesTool(c, t.key)));
  return { banks, active, dormant };
}

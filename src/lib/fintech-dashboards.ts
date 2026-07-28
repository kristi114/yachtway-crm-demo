import type { LucideIcon } from "lucide-react";
import { Clock, CheckCircle2 } from "lucide-react";
import { CONTACTS } from "@/lib/mock-data";

/**
 * Mock data for the Fintech dashboards (Lender / Insurance / VATO).
 *
 * Modelled on the EasyFund "Applications" design: a tabbed, searchable, sortable
 * table of applications/policies/valuations. Applicants link to real CRM
 * contacts. Swap these builders for the EasyFund / MasterCover / VATO reporting
 * APIs when the backend is wired.
 */

export interface FintechRow {
  id: string;
  applicant: string;
  contactId?: string;
  /** Loan amount / premium / valuation, in USD. */
  amount: number;
  submittedOn: string; // ISO date
  status: string;
  stage: string;
  vessel: string;
  tab: string;
}

export interface DashboardTab {
  key: string;
  label: string;
  icon: LucideIcon;
}

export interface DashboardConfig {
  key: string;
  title: string;
  subtitle: string;
  amountLabel: string;
  tabs: DashboardTab[];
  rows: FintechRow[];
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

/** Pick a real contact for the applicant so the row links to a CRM record. */
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
/* Lender — EasyFund                                                   */
/* ------------------------------------------------------------------ */

export function lenderDashboard(): DashboardConfig {
  const rows: FintechRow[] = [
    { id: "ln_1", ...who(0), amount: 80_450, submittedOn: daysAgo(2), status: "New", stage: "Application Assessment", vessel: VESSELS[0], tab: "in_progress" },
    { id: "ln_2", ...who(1), amount: 240_000, submittedOn: daysAgo(3), status: "In Progress", stage: "Conditional Approval", vessel: VESSELS[1], tab: "in_progress" },
    { id: "ln_3", ...who(2), amount: 425_000, submittedOn: daysAgo(4), status: "In Progress", stage: "Underwriting", vessel: VESSELS[2], tab: "in_progress" },
    { id: "ln_4", ...who(3), amount: 155_000, submittedOn: daysAgo(4), status: "Rejected", stage: "Application Assessment", vessel: VESSELS[3], tab: "in_progress" },
    { id: "ln_5", ...who(4), amount: 92_500, submittedOn: daysAgo(6), status: "New", stage: "Application Assessment", vessel: VESSELS[4], tab: "in_progress" },
    { id: "ln_6", ...who(5), amount: 1_200_000, submittedOn: daysAgo(9), status: "Funded", stage: "Funded", vessel: VESSELS[5], tab: "funded" },
    { id: "ln_7", ...who(6), amount: 318_000, submittedOn: daysAgo(12), status: "Funded", stage: "Funded", vessel: VESSELS[6], tab: "funded" },
    { id: "ln_8", ...who(7), amount: 540_000, submittedOn: daysAgo(15), status: "Funded", stage: "Funded", vessel: VESSELS[7], tab: "funded" },
  ];
  return {
    key: "lender",
    title: "Lender — EasyFund",
    subtitle: "Loan applications across the EasyFund pipeline.",
    amountLabel: "Loan Amount",
    tabs: [
      { key: "in_progress", label: "In Progress", icon: Clock },
      { key: "funded", label: "Funded", icon: CheckCircle2 },
    ],
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* Insurance — MasterCover                                             */
/* ------------------------------------------------------------------ */

export function insuranceDashboard(): DashboardConfig {
  const rows: FintechRow[] = [
    { id: "ins_1", ...who(2), amount: 4_850, submittedOn: daysAgo(1), status: "Quote", stage: "Quote Requested", vessel: VESSELS[2], tab: "in_progress" },
    { id: "ins_2", ...who(4), amount: 7_200, submittedOn: daysAgo(3), status: "In Progress", stage: "Underwriting", vessel: VESSELS[4], tab: "in_progress" },
    { id: "ins_3", ...who(8), amount: 3_400, submittedOn: daysAgo(5), status: "Rejected", stage: "Underwriting", vessel: VESSELS[8], tab: "in_progress" },
    { id: "ins_4", ...who(1), amount: 9_100, submittedOn: daysAgo(2), status: "Quote", stage: "Quote Requested", vessel: VESSELS[1], tab: "in_progress" },
    { id: "ins_5", ...who(5), amount: 12_600, submittedOn: daysAgo(11), status: "Bound", stage: "Bound", vessel: VESSELS[5], tab: "bound" },
    { id: "ins_6", ...who(6), amount: 5_950, submittedOn: daysAgo(14), status: "Bound", stage: "Bound", vessel: VESSELS[6], tab: "bound" },
    { id: "ins_7", ...who(9), amount: 8_300, submittedOn: daysAgo(20), status: "Bound", stage: "Renewed", vessel: VESSELS[9], tab: "bound" },
  ];
  return {
    key: "insurance",
    title: "Insurance — MasterCover",
    subtitle: "MasterCover quotes and bound policies.",
    amountLabel: "Premium",
    tabs: [
      { key: "in_progress", label: "In Progress", icon: Clock },
      { key: "bound", label: "Bound", icon: CheckCircle2 },
    ],
    rows,
  };
}


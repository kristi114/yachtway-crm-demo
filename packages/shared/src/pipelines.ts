import type { PipelineSensitivity } from "./opportunity.js";

/**
 * The opportunity pipelines and their stages, in order — the single source
 * of truth for the DB seed (same pattern as DEFAULT_ROLE_GRANTS). Transcribed
 * from "YachtWay CRM - Proposed Field Catalog.xlsx" → Picklist Options →
 * "Reference: Opportunity field options by pipeline (GHL - live)".
 *
 * `sensitivityClass` marks the financing pipelines (EasyFund, MasterCover) whose
 * opportunity rows are hidden from callers without the matching grant. Stage
 * outcome flags feed Phase 5 conversion/velocity reporting:
 *   isClosed — terminal stage (reaching it forces an Opportunity.status of
 *   Won/Lost/Abandoned). Outcome is NOT encoded on the stage.
 */
export interface StageSeed {
  key: string;
  name: string;
  /** terminal stage — reaching it forces a Won/Lost/Abandoned status choice */
  isClosed?: boolean;
}

export interface PipelineSeed {
  key: string;
  name: string;
  sensitivityClass?: PipelineSensitivity;
  lostReasons?: string[];
  stages: StageSeed[];
}

/** Slugify a stage/pipeline display name into a stable key. */
export function pipelineSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const stage = (name: string, flags?: { isClosed?: boolean }): StageSeed => ({
  key: pipelineSlug(name),
  name,
  ...(flags?.isClosed ? { isClosed: true } : {}),
});

// Outcome (won/lost/abandoned) is tracked on Opportunity.status, NOT the stage.
// Only the terminal "Closed" stage is marked isClosed — reaching it forces the
// user to pick a closed status.
const closed = { isClosed: true };

export const PIPELINE_SEED: PipelineSeed[] = [
  {
    key: "assouline_partnership",
    name: "Assouline Partnership",
    stages: [stage("Potential Lead"), stage("Contacted"), stage("Proposal Sent"), stage("Closed", closed)],
  },
  {
    key: "custom_package_proposal",
    name: "Custom Package Proposal",
    stages: [stage("New Lead"), stage("Contacted"), stage("Proposal Sent"), stage("Closed", closed)],
  },
  {
    // Merged pipeline — replaces the former "Dealer Leads" + "New Dealer Signups"
    // pipelines, covering the full dealer lifecycle from lead to onboarded.
    key: "dealers",
    name: "Dealer Signups",
    stages: [
      stage("New Lead"),
      stage("Discovery/Contacted"),
      stage("Demo"),
      stage("Proposal Sent"),
      stage("Contract"),
      stage("Onboarded"),
      stage("Closed", closed),
    ],
  },
  {
    key: "easyclose",
    name: "EasyClose",
    stages: [
      stage("Service Requested"),
      stage("Deliverables In Progress"),
      stage("Delivered"),
      stage("Closed", closed),
    ],
  },
  {
    key: "easyfund",
    name: "EasyFund",
    sensitivityClass: "easyfund",
    lostReasons: [
      "Credit Score Under 650",
      "Credit Score 650-700",
      "No Available Loan Product",
      "Vessel Did Not Qualify",
      "Paid Cash",
      "Buyer Did Not Qualify",
      "Financed Elsewhere",
      "Other - EasyFund",
    ],
    stages: [
      stage("Pre-Qual Complete"),
      stage("Unresponsive"),
      stage("Still Shopping"),
      stage("Partial Application"),
      stage("Application Complete"),
      stage("In Review"),
      stage("Approved"),
      stage("Loan Closed"),
      stage("Closed", closed),
    ],
  },
  {
    key: "easyfund_dealer_partners",
    name: "EasyFund Dealer Partners",
    stages: [
      stage("Prospecting"),
      stage("Initial Discussion"),
      stage("Proposal Presentation"),
      stage("Implementation"),
      stage("Closed", closed),
    ],
  },
  {
    key: "easysign",
    name: "EasySign",
    stages: [stage("New Lead"), stage("Contacted"), stage("Closed", closed)],
  },
  {
    key: "general_closed_from_sf",
    name: "General Closed from SF",
    stages: [stage("New Lead"), stage("Contacted"), stage("Proposal Sent"), stage("Closed", closed)],
  },
  {
    key: "mastercover",
    name: "MasterCover",
    sensitivityClass: "mastercover",
    // catalog typo "Qualigy" corrected to "Qualify".
    lostReasons: ["Vessel Did Not Qualify", "Quote Too High", "Other - Mastercover"],
    stages: [
      stage("New Lead"),
      stage("Contacted"),
      stage("Still Shopping"),
      stage("Application Complete"),
      stage("Closed", closed),
    ],
  },
  {
    key: "studio",
    name: "Studio",
    stages: [
      stage("Service Requested"),
      stage("Studio Booked"),
      stage("Shoot Complete"),
      stage("Content Delivered"),
      stage("Closed", closed),
    ],
  },
  {
    key: "website_builds",
    name: "Website Builds",
    stages: [stage("New Lead"), stage("Contacted"), stage("Proposal Sent"), stage("Closed", closed)],
  },
  {
    key: "yachtway_connect_crm",
    name: "YachtWay Connect CRM",
    stages: [stage("New Lead"), stage("Contacted"), stage("Proposal Sent"), stage("Closed", closed)],
  },
];

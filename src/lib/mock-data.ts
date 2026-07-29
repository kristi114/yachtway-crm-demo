/**
 * YachtWay CRM mock data - two verticals.
 *
 * Field keys mirror real YachtWay AWS field names from yachtwayInternal.json
 * so the UI can be wired to the backend without renaming anything. All arrays
 * are exported const-typed so the mock layer swaps cleanly for API responses.
 */

import { COMPANY_SECTIONS, CONTACT_SECTIONS, LISTING_SECTIONS, OPPORTUNITY_SECTIONS } from "./field-schema";
import { fillCatalogFields } from "./mock-field-fill";
import type { CurrencyCode } from "./currency";

export type Vertical = "Main" | "FinTech";

// -------- Companies --------
// Yacht:  Shipyard, Dealer, Brokerage
// Fintech: Bank, Lender
// Cross:   Insurance, Service Yard

export type CompanyType =
  | "Shipyard"
  | "Dealer"
  | "Brokerage"
  | "Bank"
  | "Lender"
  | "Insurance"
  | "Service Yard";

export type CompanyStatus = "Member" | "Customer" | "Partner" | "Lead" | "Prospect";

export interface Company {
  /** Catalog fields backfilled from the field schema. */
  [key: string]: unknown;
  id: string;
  vertical: Vertical;
  name: string;
  companyType: CompanyType;
  status: CompanyStatus;
  logoUrl: string | null;
  parentCompanyId: string | null;
  website: string;
  phone: string;
  billingCity: string;
  billingState: string;
  billingCountry: string;
  yachtwayDbAccountId: string;
  sfAccountId: string;
  xeroContactIdOrgA: string;
  xeroContactIdOrgB: string;
  yachtwayDealerPage: string;
  dealerTier: string;
  activeCustomerDate: string;
  /** Home currency of the account - reps invoice / quote in this currency. */
  currency: CurrencyCode;
  activeListings: number;
  apiConnected: boolean;
  customWebsiteEnabled: boolean;  // YachtWay custom website solution
  verifiedDealer: boolean;
  saasArrUsd: number;
  enrichedFromAws: boolean;
  ownerUserId: string | null;        // YachtWay sales rep who owns the account
  primaryContactId: string | null;      // Primary point of contact at the company
  scrapedBrokerCount: number;        // brokers enriched from public / scraped sources
  crmBrokerCount: number;            // brokers actually linked in CRM
  lastContactedAt: string;
  lastContactChannel: "" | "Email" | "Call" | "Meeting" | "WhatsApp";
  servicesUsed: {
    saas: boolean; studio: boolean; mastercover: boolean;
    easyclose: boolean; connectCrm: boolean; easyfund: boolean;
    live: boolean; customWebsite: boolean; // YachtWay custom website solution
    drive: boolean; // YachtWay Drive - vessel delivery / logistics
    vato: boolean; // VATO - fintech verification / titling service
    easysign: boolean; // EasySign - e-signature for yacht dealers
  };
  studioSpendYtd: number;
  lastLogin: string;       // "" = dealer has never signed into YachtWay portal
  lastStudioSessionAt: string;     // "" = dealer has never booked a Studio session
  easyfundReferralsTotal: number;
  easyfundReferralsApproved: number;
  easyfundReferralsFunded: number;
  easyfundClosedReferralsAmount: number;
  // ---- Rep workflow (Top-10 audit #1) ----
  nextStep: string;                 // "" = no planned next step
  nextStepDate: string;            // "" = no date scheduled (YYYY-MM-DD)
}

export function companyInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function companyLogoUrl(company: Company): string | undefined {
  if (company.logoUrl) return company.logoUrl;
  // Dealer logo from the catalog field (dealer_logo_url), when it's a real
  // image URL (ignore the catalog's backfilled placeholder text).
  const dealerLogo = company.dealerLogoUrl;
  if (typeof dealerLogo === "string" && /^(https?:|data:)/.test(dealerLogo.trim())) {
    return dealerLogo.trim();
  }
  const initials = companyInitials(company.name);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials || "C")}&background=ece7f6&color=260754&size=128&rounded=false&bold=true&length=2`;
}

// -------- Contacts --------
// Yacht:  Broker (works at Dealer/Brokerage/Shipyard), Dealer Contact, Shipyard Contact
// Fintech: Loan Applicant, Bank Contact, Lender Contact

export type ContactType =
  | "Broker"
  | "Dealer Contact"
  | "Shipyard Contact"
  | "Loan Applicant"
  | "Bank Contact"
  | "Lender Contact"
  | "Buyer";

export interface Contact {
  /** Catalog fields backfilled from the field schema. */
  [key: string]: unknown;
  id: string;
  vertical: Vertical;
  companyId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  contactType: ContactType;
  lifecycleStage: string;
  leadSource: string;
  utmSource: string;
  utmCampaign: string;
  yachtwayDbId: string;
  sfContactId: string;
  brokerLicenseNumber: string;
  brokerLicenseState: string;
  roleAtDealership: string;
  sessions_30d: number;
  listingViewsToDate: number;
  buyerIntentScore: number;
  lastLoginAt: string;
  avgResponseTimeHours: number;
  studioSpendYtd: number;
  // Fintech-only (Loan Applicant)
  loanApplicationId: string | null;
  avatarUrl?: string | null;
  companyRole?: CompanyRole | null;
  // ---- Rep workflow (Top-10 audit #1) ----
  nextStep: string;                 // "" = no planned next step
  nextStepDate: string;            // "" = no date scheduled (YYYY-MM-DD)
}

export const COMPANY_ROLES = [
  "Owner",
  "Admin",
  "Broker",
  "Marketing",
  "Manager",
  "Closing Agent",
  "F&I",
] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export function contactInitials(first: string, last: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

export function contactAvatarUrl(contact: Contact): string | undefined {
  if (contact.avatarUrl) return contact.avatarUrl;
  const initials = contactInitials(contact.firstName, contact.lastName);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials || "?")}&background=e6efff&color=1e3a8a&size=128&rounded=true&bold=true&length=2`;
}

// -------- Brands & Representations --------
export interface Brand {
  id: string;
  name: string;
  manufacturerCountry: string;
  tier: "Luxury" | "Premium" | "Mainstream";
  /** Managed-entity flag - inactive brands stay on records but leave pickers. */
  active?: boolean;
  /** Brand logo image; shown on brand cards. Falls back to the name if absent. */
  logoUrl?: string;
}
export interface BrandRepresentation {
  companyId: string;   // Dealer or Brokerage
  brandId: string;
  exclusive: boolean;
}

// -------- Listings --------
export interface Listing {
  /** Catalog fields backfilled from the field schema. */
  [key: string]: unknown;
  id: string;
  companyId: string;              // dealer/brokerage that lists it
  brokerContactId: string | null;
  brandId: string;
  model: string;
  year: number;
  lengthFt: number;
  priceUsd: number;
  status: "Active" | "Pending" | "Sold" | "Withdrawn";
  hullId: string;
  listedAt: string;
  listingUrl: string | null;      // public YachtWay listing page
  has_3d_tour: boolean;            // YachtWay Studio 3D walkthrough attached
  photoCount: number;             // total media assets on the listing
  // ---- Listing quality signals (drive the heat score) ----
  mediaQuality: "poor" | "fair" | "good" | "excellent"; // AI-scored photo quality
  photoSetting: "onWater" | "mixed" | "dock" | "trailer"; // where photos were shot; dock/trailer = enhancement upsell
  hasVideo: boolean;              // walkthrough video / YouTube URL attached
  descriptionLength: number;      // characters in the marketing description (0 = missing)
  priceHidden: boolean;           // "Contact for price" - buyers bounce
  featuresTotal: number;          // total feature slots on the schema
  featuresFilled: number;         // how many the dealer actually filled in
}



// -------- Loan Applications (EasyFund) --------
export interface LoanApplication {
  id: string;                                       // yachtwayPrequalificationId
  contactId: string;
  yachtwayEasyfundExternalId: string;
  stage:
    | "Started" | "Prequalified" | "Docs Requested" | "Underwriting"
    | "Approved" | "Funded" | "Declined";
  creditScore: string;
  monthlyIncome: number;
  monthlyDebt: number;
  downPayment: number;
  estimatedQualification: number;
  monthlyPaymentMin: number;
  monthlyPaymentMax: number;
  dobYear: number;
  coapplicant: boolean;
  bankCompanyId: string | null;                   // assigned lender partner
}

// -------- Universal activities --------
export type RelatedType = "contact" | "company" | "listing" | "opportunity";

export type NoteVisibility = "private" | "team" | "public" | "secure";

export interface Note {
  id: string;
  relatedType: RelatedType;
  relatedId: string;
  author: string;
  body: string;
  createdAt: string;
  /** Who can see this note. `private` = author only; `team` = the account team; `public` = everyone. */
  visibility: NoteVisibility;
}
export interface Task {
  id: string;
  relatedType: RelatedType;
  relatedId: string;
  title: string;
  assignee: string;
  dueDate: string;
  status: "Open" | "In Progress" | "Done";
  priority: "Low" | "Med" | "High";
  notes?: string;
}
export interface CalendarEvent {
  id: string;
  relatedType: RelatedType;
  relatedId: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  attendees: string[];
}

/** Structured reasons for lost/closed opportunities (Top-10 audit #4). */
export const LOST_REASONS = [
  "Price",
  "Timing",
  "Lost to competitor",
  "No decision",
  "No budget",
  "Product gap",
  "Other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export interface Opportunity {
  /** Catalog fields backfilled from the field schema. */
  [key: string]: unknown;
  id: string;
  name: string;
  pipeline:
    | "SaaS Sales" | "Dealer Signups" | "EasyFund" | "MasterCover"
    | "Studio" | "EasyClose" | "Referral Partners";
  stage: string;
  amountUsd: number;
  closeDate: string;
  owner: string;
  companyId: string | null;
  contactId: string | null;
  listingId: string | null;
  // ---- Pipeline health (Top-10 audit #2, #4) ----
  probability: number;                 // 0-100 weighted forecast
  stageEnteredAt: string;            // ISO date - when the deal moved into current stage
  lostReason: LostReason | null;      // only set for lost deals
  closeReason: string;                // free-text notes on why won/lost
}

// ==============================================================
// SEED DATA
// ==============================================================

export const BRANDS: Brand[] = [
  { id: "brd_azimut",     name: "Azimut",       manufacturerCountry: "Italy",  tier: "Luxury" },
  { id: "brd_ferretti",   name: "Ferretti",     manufacturerCountry: "Italy",  tier: "Luxury" },
  { id: "brd_sunseeker",  name: "Sunseeker",    manufacturerCountry: "UK",     tier: "Luxury" },
  { id: "brd_princess",   name: "Princess",     manufacturerCountry: "UK",     tier: "Luxury" },
  { id: "brd_riviera",    name: "Riviera",      manufacturerCountry: "Australia", tier: "Premium" },
  { id: "brd_pershing",   name: "Pershing",     manufacturerCountry: "Italy",  tier: "Luxury" },
  { id: "brd_sea_ray",    name: "Sea Ray",      manufacturerCountry: "USA",    tier: "Mainstream", logoUrl: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20260%20120'%3E%3Crect%20width='260'%20height='120'%20rx='14'%20fill='%23ffffff'/%3E%3Ctext%20x='130'%20y='60'%20text-anchor='middle'%20font-family='Georgia,serif'%20font-size='36'%20font-style='italic'%20font-weight='700'%20fill='%23123a7a'%3ESea%20Ray%3C/text%3E%3Ctext%20x='130'%20y='86'%20text-anchor='middle'%20font-family='Arial'%20font-size='12'%20letter-spacing='4'%20fill='%236b7280'%3EBOATS%3C/text%3E%3C/svg%3E" },
  { id: "brd_whaler",     name: "Boston Whaler",manufacturerCountry: "USA",    tier: "Premium",    logoUrl: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%20260%20120'%3E%3Crect%20width='260'%20height='120'%20rx='14'%20fill='%23002a5c'/%3E%3Ctext%20x='130'%20y='56'%20text-anchor='middle'%20font-family='Arial'%20font-size='26'%20font-weight='700'%20fill='%23ffffff'%3EBOSTON%3C/text%3E%3Ctext%20x='130'%20y='84'%20text-anchor='middle'%20font-family='Arial'%20font-size='22'%20font-weight='400'%20letter-spacing='2'%20fill='%23cfe0f5'%3EWHALER%3C/text%3E%3C/svg%3E" },
];

export const COMPANIES: Company[] = [
  // ---- Yacht: Shipyards ----
  {
    id: "cmp_shipyard_azimut", vertical: "Main", name: "Azimut-Benetti Group",
    companyType: "Shipyard", status: "Member", logoUrl: null, parentCompanyId: null,
    website: "https://azimutyachts.com", yachtwayDealerPage: "https://YachtWay.com/shipyard/azimut-benetti-group", phone: "+39 011 93161",
    billingCity: "Avigliana", billingState: "TO", billingCountry: "Italy",
    yachtwayDbAccountId: "acc_yard_azimut", sfAccountId: "0015g00000SHP01",
    xeroContactIdOrgA: "", xeroContactIdOrgB: "",
    dealerTier: "N/A", activeCustomerDate: "",
    currency: "EUR",
    activeListings: 0, apiConnected: false, customWebsiteEnabled: false, verifiedDealer: true,
    saasArrUsd: 0, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "cnt_008", scrapedBrokerCount: 0, crmBrokerCount: 1,
    lastContactedAt: "2026-06-28", lastContactChannel: "Email",
    servicesUsed: { saas: false, studio: false, mastercover: false, easyclose: false, connectCrm: false, easyfund: false, live: false, customWebsite: false, drive: false, vato: false, easysign: false },
    studioSpendYtd: 0,
    lastLogin: "", lastStudioSessionAt: "",
    easyfundReferralsTotal: 0, easyfundReferralsApproved: 0,
    easyfundReferralsFunded: 0, easyfundClosedReferralsAmount: 0,
    nextStep: "Confirm Q4 booth co-marketing spend", nextStepDate: "2026-08-05",
  },
  {
    id: "cmp_shipyard_sunseeker", vertical: "Main", name: "Sunseeker International",
    companyType: "Shipyard", status: "Member", logoUrl: null, parentCompanyId: null,
    website: "https://sunseeker.com", yachtwayDealerPage: "https://YachtWay.com/shipyard/sunseeker-international", phone: "+44 1202 381111",
    billingCity: "Poole", billingState: "Dorset", billingCountry: "UK",
    yachtwayDbAccountId: "acc_yard_sunseeker", sfAccountId: "0015g00000SHP02",
    xeroContactIdOrgA: "", xeroContactIdOrgB: "",
    dealerTier: "N/A", activeCustomerDate: "",
    currency: "GBP",
    activeListings: 0, apiConnected: false, customWebsiteEnabled: false, verifiedDealer: true,
    saasArrUsd: 0, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: null, scrapedBrokerCount: 0, crmBrokerCount: 0,
    lastContactedAt: "2026-05-14", lastContactChannel: "Meeting",
    servicesUsed: { saas: false, studio: false, mastercover: false, easyclose: false, connectCrm: false, easyfund: false, live: false, customWebsite: false, drive: false, vato: false, easysign: false },
    studioSpendYtd: 0,
    lastLogin: "", lastStudioSessionAt: "",
    easyfundReferralsTotal: 0, easyfundReferralsApproved: 0,
    easyfundReferralsFunded: 0, easyfundClosedReferralsAmount: 0,
    nextStep: "Reopen Studio partnership discussion", nextStepDate: "2026-07-28",
  },
  // ---- Yacht: Dealers/Brokerages ----
  {
    id: "cmp_001", vertical: "Main", name: "Riviera Yachts Miami",
    companyType: "Dealer", status: "Member", logoUrl: null, parentCompanyId: "cmp_shipyard_azimut",
    website: "https://rivierayachtsmiami.com", yachtwayDealerPage: "https://YachtWay.com/dealer/riviera-yachts-miami", phone: "+1 305 555 0142",
    billingCity: "Miami", billingState: "FL", billingCountry: "USA",
    yachtwayDbAccountId: "acc_9f3d2a71", sfAccountId: "0015g00000ABc12",
    xeroContactIdOrgA: "xr_a_4581", xeroContactIdOrgB: "",
    dealerTier: "Platinum", activeCustomerDate: "2023-04-12",
    currency: "USD",
    activeListings: 47, apiConnected: true, customWebsiteEnabled: true, verifiedDealer: true,
    saasArrUsd: 42000, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "cnt_001", scrapedBrokerCount: 12, crmBrokerCount: 8,
    lastContactedAt: "2026-07-13", lastContactChannel: "Call",
    servicesUsed: { saas: true, studio: true, mastercover: false, easyclose: true, connectCrm: true, easyfund: true, live: false, customWebsite: true, drive: true, vato: false, easysign: false },
    studioSpendYtd: 24_500,
    lastLogin: "2026-07-12", lastStudioSessionAt: "2026-07-05",
    easyfundReferralsTotal: 32, easyfundReferralsApproved: 21,
    easyfundReferralsFunded: 14, easyfundClosedReferralsAmount: 8_450_000,
    nextStep: "Send SaaS renewal DocuSign", nextStepDate: "2026-07-18",
  },
  {
    id: "cmp_002", vertical: "Main", name: "Azure Marine Group",
    companyType: "Brokerage", status: "Member", logoUrl: null, parentCompanyId: null,
    website: "https://azuremarine.eu", yachtwayDealerPage: "https://YachtWay.com/dealer/azure-marine-group", phone: "+377 97 55 12 88",
    billingCity: "Monaco", billingState: "", billingCountry: "Monaco",
    yachtwayDbAccountId: "acc_1b8e4c22", sfAccountId: "0015g00000ABc19",
    xeroContactIdOrgA: "", xeroContactIdOrgB: "xr_b_7712",
    dealerTier: "Gold", activeCustomerDate: "2022-11-03",
    currency: "EUR",
    activeListings: 22, apiConnected: true, customWebsiteEnabled: false, verifiedDealer: true,
    saasArrUsd: 24000, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "cnt_002", scrapedBrokerCount: 18, crmBrokerCount: 6,
    lastContactedAt: "2026-06-22", lastContactChannel: "Email",
    servicesUsed: { saas: true, studio: false, mastercover: true, easyclose: false, connectCrm: true, easyfund: true, live: false, customWebsite: false, drive: false, vato: false, easysign: false },
    studioSpendYtd: 8_200,
    lastLogin: "2026-07-10", lastStudioSessionAt: "",
    easyfundReferralsTotal: 8, easyfundReferralsApproved: 5,
    easyfundReferralsFunded: 3, easyfundClosedReferralsAmount: 1_920_000,
    nextStep: "Follow up on MasterCover quote", nextStepDate: "2026-07-22",
  },
  {
    id: "cmp_003", vertical: "Main", name: "Sunseeker Fort Lauderdale",
    companyType: "Dealer", status: "Member", logoUrl: null, parentCompanyId: "cmp_shipyard_sunseeker",
    website: "https://sunseeker-ftl.com", yachtwayDealerPage: "https://YachtWay.com/dealer/sunseeker-fort-lauderdale", phone: "+1 954 555 0198",
    billingCity: "Fort Lauderdale", billingState: "FL", billingCountry: "USA",
    yachtwayDbAccountId: "acc_5a2c9e18", sfAccountId: "0015g00000ABc44",
    xeroContactIdOrgA: "xr_a_4590", xeroContactIdOrgB: "",
    dealerTier: "Platinum", activeCustomerDate: "2021-06-22",
    currency: "USD",
    activeListings: 63, apiConnected: true, customWebsiteEnabled: true, verifiedDealer: true,
    saasArrUsd: 58000, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "cnt_004", scrapedBrokerCount: 14, crmBrokerCount: 12,
    lastContactedAt: "2026-07-11", lastContactChannel: "Meeting",
    servicesUsed: { saas: true, studio: true, mastercover: true, easyclose: true, connectCrm: true, easyfund: true, live: true, customWebsite: true, drive: true, vato: false, easysign: false },
    studioSpendYtd: 62_100,
    lastLogin: "2026-07-13", lastStudioSessionAt: "2026-06-05",
    easyfundReferralsTotal: 51, easyfundReferralsApproved: 38,
    easyfundReferralsFunded: 27, easyfundClosedReferralsAmount: 14_820_000,
    nextStep: "Deliver Studio ROI deck to Karen", nextStepDate: "2026-07-20",
  },
  {
    id: "cmp_004", vertical: "Main", name: "Pershing Newport Marina",
    companyType: "Dealer", status: "Lead", logoUrl: null, parentCompanyId: null,
    website: "https://pershing-newport.com", yachtwayDealerPage: "https://YachtWay.com/dealer/pershing-newport-marina", phone: "+1 401 555 0110",
    billingCity: "Newport", billingState: "RI", billingCountry: "USA",
    yachtwayDbAccountId: "acc_2d1f7b09", sfAccountId: "",
    xeroContactIdOrgA: "", xeroContactIdOrgB: "",
    dealerTier: "Prospect", activeCustomerDate: "",
    currency: "USD",
    activeListings: 11, apiConnected: false, customWebsiteEnabled: false, verifiedDealer: true,
    saasArrUsd: 0, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "cnt_005", scrapedBrokerCount: 9, crmBrokerCount: 2,
    lastContactedAt: "2026-05-30", lastContactChannel: "Email",
    servicesUsed: { saas: false, studio: false, mastercover: false, easyclose: false, connectCrm: false, easyfund: true, live: false, customWebsite: false, drive: false, vato: false, easysign: false },
    studioSpendYtd: 0,
    lastLogin: "", lastStudioSessionAt: "",
    easyfundReferralsTotal: 3, easyfundReferralsApproved: 2,
    easyfundReferralsFunded: 1, easyfundClosedReferralsAmount: 640_000,
    nextStep: "Book onboarding kickoff", nextStepDate: "2026-07-24",
  },
  {
    id: "cmp_006", vertical: "Main", name: "Coastline Brokerage",
    companyType: "Brokerage", status: "Member", logoUrl: null, parentCompanyId: null,
    dealerLogoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23ece7f6'/%3E%3Cg stroke='%23260754' stroke-width='3.5' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='32' cy='17' r='4'/%3E%3Cpath d='M32 21v27M20 30h24M16 38c0 9 7 14 16 14s16-5 16-14'/%3E%3C/g%3E%3C/svg%3E",
    website: "https://coastlinebrokerage.com", yachtwayDealerPage: "https://YachtWay.com/dealer/coastline-brokerage", phone: "+1 619 555 0122",
    billingCity: "San Diego", billingState: "CA", billingCountry: "USA",
    yachtwayDbAccountId: "acc_cst_881", sfAccountId: "",
    xeroContactIdOrgA: "", xeroContactIdOrgB: "",
    dealerTier: "Silver", activeCustomerDate: "2026-07-08",
    currency: "USD",
    activeListings: 1, apiConnected: false, customWebsiteEnabled: false, verifiedDealer: false,
    saasArrUsd: 12000, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: null, scrapedBrokerCount: 22, crmBrokerCount: 0,
    lastContactedAt: "2026-04-18", lastContactChannel: "Email",
    servicesUsed: { saas: true, studio: false, mastercover: false, easyclose: false, connectCrm: false, easyfund: false, live: false, customWebsite: false, drive: false, vato: false, easysign: false },
    studioSpendYtd: 0,
    lastLogin: "", lastStudioSessionAt: "",

    easyfundReferralsTotal: 0, easyfundReferralsApproved: 0,
    easyfundReferralsFunded: 0, easyfundClosedReferralsAmount: 0,
    nextStep: "Discovery call with owner", nextStepDate: "2026-07-17",
  },
  // ---- Fintech ----
  {
    id: "cmp_005", vertical: "FinTech", name: "Oceanline Capital",
    companyType: "Lender", status: "Partner", logoUrl: null, parentCompanyId: null,
    website: "https://oceanlinecap.com", yachtwayDealerPage: "https://YachtWay.com/lender/oceanline-capital", phone: "+1 212 555 0177",
    billingCity: "New York", billingState: "NY", billingCountry: "USA",
    yachtwayDbAccountId: "acc_8f9a3d40", sfAccountId: "0015g00000ABc71",
    xeroContactIdOrgA: "", xeroContactIdOrgB: "xr_b_7801",
    dealerTier: "N/A", activeCustomerDate: "",
    currency: "USD",
    activeListings: 0, apiConnected: false, customWebsiteEnabled: false, verifiedDealer: false,
    saasArrUsd: 36000, enrichedFromAws: false,
    ownerUserId: "u_fin", primaryContactId: "cnt_010", scrapedBrokerCount: 0, crmBrokerCount: 4,
    lastContactedAt: "2026-07-09", lastContactChannel: "Call",
    servicesUsed: { saas: true, studio: false, mastercover: false, easyclose: false, connectCrm: false, easyfund: true, live: false, customWebsite: false, drive: false, vato: true, easysign: false },
    studioSpendYtd: 0,
    lastLogin: "", lastStudioSessionAt: "",
    easyfundReferralsTotal: 44, easyfundReferralsApproved: 31,
    easyfundReferralsFunded: 22, easyfundClosedReferralsAmount: 12_400_000,
    nextStep: "Quarterly funded-volume review", nextStepDate: "2026-08-10",
  },
  {
    id: "cmp_007", vertical: "FinTech", name: "Harborline Bank",
    companyType: "Bank", status: "Customer", logoUrl: null, parentCompanyId: null,
    website: "https://harborlinebank.com", yachtwayDealerPage: "https://YachtWay.com/lender/harborline-bank", phone: "+1 305 555 0088",
    billingCity: "Miami", billingState: "FL", billingCountry: "USA",
    yachtwayDbAccountId: "acc_hrb_bank", sfAccountId: "0015g00000ABc90",
    xeroContactIdOrgA: "xr_a_5501", xeroContactIdOrgB: "",
    dealerTier: "N/A", activeCustomerDate: "",
    currency: "USD",
    activeListings: 0, apiConnected: true, customWebsiteEnabled: true, verifiedDealer: false,
    saasArrUsd: 72000, enrichedFromAws: false,
    ownerUserId: "u_fin", primaryContactId: "cnt_009", scrapedBrokerCount: 0, crmBrokerCount: 6,
    lastContactedAt: "2026-07-13", lastContactChannel: "Meeting",
    servicesUsed: { saas: true, studio: false, mastercover: false, easyclose: false, connectCrm: true, easyfund: true, live: false, customWebsite: true, drive: true, vato: true, easysign: false },
    studioSpendYtd: 0,
    lastLogin: "", lastStudioSessionAt: "",
    easyfundReferralsTotal: 68, easyfundReferralsApproved: 49,
    easyfundReferralsFunded: 34, easyfundClosedReferralsAmount: 21_100_000,
    nextStep: "Countersign referral partnership contract", nextStepDate: "2026-07-22",
  },
  {
    id: "cmp_008", vertical: "FinTech", name: "Meridian Marine Finance",
    companyType: "Lender", status: "Lead", logoUrl: null, parentCompanyId: null,
    website: "https://meridianmarine.com", yachtwayDealerPage: "https://YachtWay.com/lender/meridian-marine-finance", phone: "+1 415 555 0221",
    billingCity: "San Francisco", billingState: "CA", billingCountry: "USA",
    yachtwayDbAccountId: "acc_mer_881", sfAccountId: "",
    xeroContactIdOrgA: "", xeroContactIdOrgB: "",
    dealerTier: "N/A", activeCustomerDate: "",
    currency: "USD",
    activeListings: 0, apiConnected: false, customWebsiteEnabled: false, verifiedDealer: false,
    saasArrUsd: 0, enrichedFromAws: false,
    ownerUserId: "u_fin", primaryContactId: null, scrapedBrokerCount: 0, crmBrokerCount: 0,
    lastContactedAt: "2026-06-02", lastContactChannel: "Email",
    servicesUsed: { saas: false, studio: false, mastercover: false, easyclose: false, connectCrm: false, easyfund: false, live: false, customWebsite: false, drive: false, vato: false, easysign: false },
    studioSpendYtd: 0,
    lastLogin: "", lastStudioSessionAt: "",
    easyfundReferralsTotal: 0, easyfundReferralsApproved: 0,
    easyfundReferralsFunded: 0, easyfundClosedReferralsAmount: 0,
    nextStep: "Send SaaS pilot proposal", nextStepDate: "2026-07-30",
  },
];
export const BRAND_REPRESENTATIONS: BrandRepresentation[] = [
  // ---- Shipyards: brands they build ----
  { companyId: "cmp_shipyard_azimut",    brandId: "brd_azimut",    exclusive: true },
  { companyId: "cmp_shipyard_azimut",    brandId: "brd_pershing",  exclusive: true },
  { companyId: "cmp_shipyard_sunseeker", brandId: "brd_sunseeker", exclusive: true },
  // ---- Dealers / brokerages: brands they represent ----
  { companyId: "cmp_001", brandId: "brd_riviera",  exclusive: true  },
  { companyId: "cmp_001", brandId: "brd_azimut",   exclusive: false },
  { companyId: "cmp_001", brandId: "brd_pershing", exclusive: false },
  { companyId: "cmp_002", brandId: "brd_ferretti", exclusive: false },
  { companyId: "cmp_002", brandId: "brd_pershing", exclusive: false },
  { companyId: "cmp_002", brandId: "brd_sunseeker",exclusive: false },
  { companyId: "cmp_003", brandId: "brd_sunseeker",exclusive: true  },
  { companyId: "cmp_003", brandId: "brd_princess", exclusive: false },
  { companyId: "cmp_004", brandId: "brd_pershing", exclusive: false },
  { companyId: "cmp_006", brandId: "brd_sea_ray",  exclusive: false },
  { companyId: "cmp_006", brandId: "brd_whaler",   exclusive: false },
];


export const CONTACTS: Contact[] = [
  {
    id: "cnt_001", vertical: "Main", companyId: "cmp_001",
    firstName: "Marco", lastName: "Delgado",
    email: "marco.delgado@rivierayachtsmiami.com", phone: "+1 305 555 0143",
    contactType: "Broker", lifecycleStage: "Customer",
    leadSource: "Partner", utmSource: "yachtway-partner", utmCampaign: "dealer-onboard-2023",
    yachtwayDbId: "usr_a12b34c5", sfContactId: "0035g00000XYc11",
    brokerLicenseNumber: "FL-BR-88231", brokerLicenseState: "FL",
    roleAtDealership: "Sales Manager",
    sessions_30d: 42, listingViewsToDate: 3120, buyerIntentScore: 88,
    lastLoginAt: "2026-07-12", avgResponseTimeHours: 1.8, studioSpendYtd: 24_500,
    loanApplicationId: null,
    nextStep: "Send SaaS renewal DocuSign", nextStepDate: "2026-07-18",
  },
  {
    id: "cnt_002", vertical: "Main", companyId: "cmp_002",
    firstName: "Sophie", lastName: "Laurent",
    email: "sophie.laurent@azuremarine.eu", phone: "+377 97 55 12 89",
    contactType: "Broker", lifecycleStage: "Customer",
    leadSource: "Trade Show", utmSource: "monaco-yacht-show", utmCampaign: "mys-2024",
    yachtwayDbId: "usr_f88a90d1", sfContactId: "0035g00000XYc22",
    brokerLicenseNumber: "MC-BR-00412", brokerLicenseState: "Monaco",
    roleAtDealership: "Broker",
    sessions_30d: 28, listingViewsToDate: 1980, buyerIntentScore: 74,
    lastLoginAt: "2026-07-13", avgResponseTimeHours: 3.2, studioSpendYtd: 8_200,
    loanApplicationId: null,
    nextStep: "Share MasterCover binding quote", nextStepDate: "2026-07-22",
  },
  {
    id: "cnt_004", vertical: "Main", companyId: "cmp_003",
    firstName: "Karen", lastName: "Nakamura",
    email: "karen@sunseeker-ftl.com", phone: "+1 954 555 0201",
    contactType: "Dealer Contact", lifecycleStage: "Customer",
    leadSource: "Referral", utmSource: "", utmCampaign: "",
    yachtwayDbId: "usr_ee2233f4", sfContactId: "0035g00000XYc55",
    brokerLicenseNumber: "FL-BR-77120", brokerLicenseState: "FL",
    roleAtDealership: "Owner",
    sessions_30d: 61, listingViewsToDate: 5240, buyerIntentScore: 93,
    lastLoginAt: "2026-07-13", avgResponseTimeHours: 0.9, studioSpendYtd: 62_100,
    loanApplicationId: null,
    nextStep: "Deliver Studio ROI deck", nextStepDate: "2026-07-20",
  },
  {
    id: "cnt_005", vertical: "Main", companyId: "cmp_004",
    firstName: "Daniel", lastName: "O'Sullivan",
    email: "dan@pershing-newport.com", phone: "+1 401 555 0111",
    contactType: "Dealer Contact", lifecycleStage: "MQL",
    leadSource: "Cold Outreach", utmSource: "outbound-q1-26", utmCampaign: "northeast-dealers",
    yachtwayDbId: "usr_99cc11ab", sfContactId: "",
    brokerLicenseNumber: "RI-BR-01221", brokerLicenseState: "RI",
    roleAtDealership: "Finance Manager",
    sessions_30d: 6, listingViewsToDate: 210, buyerIntentScore: 41,
    lastLoginAt: "2026-07-04", avgResponseTimeHours: 12.4, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "Confirm demo attendees", nextStepDate: "2026-07-17",
  },
  {
    id: "cnt_007", vertical: "Main", companyId: "cmp_002",
    firstName: "Luca", lastName: "Bianchi",
    email: "luca.bianchi@azuremarine.eu", phone: "+377 97 55 12 90",
    contactType: "Broker", lifecycleStage: "Customer",
    leadSource: "Partner", utmSource: "", utmCampaign: "",
    yachtwayDbId: "usr_lb_11", sfContactId: "",
    brokerLicenseNumber: "MC-BR-00512", brokerLicenseState: "Monaco",
    roleAtDealership: "Broker",
    sessions_30d: 19, listingViewsToDate: 812, buyerIntentScore: 65,
    lastLoginAt: "2026-07-10", avgResponseTimeHours: 4.5, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "Prep Monaco Show intro", nextStepDate: "2026-08-05",
  },
  {
    id: "cnt_008", vertical: "Main", companyId: "cmp_shipyard_azimut",
    firstName: "Renata", lastName: "Ferrari",
    email: "r.ferrari@azimutyachts.com", phone: "+39 011 93161 220",
    contactType: "Shipyard Contact", lifecycleStage: "Customer",
    leadSource: "Referral", utmSource: "", utmCampaign: "",
    yachtwayDbId: "usr_rf_09", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "Head of Digital",
    sessions_30d: 4, listingViewsToDate: 12, buyerIntentScore: 0,
    lastLoginAt: "2026-06-30", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "Circulate Q4 co-marketing brief", nextStepDate: "2026-08-01",
  },
  // ---- Fintech: Loan Applicants ----
  {
    id: "cnt_003", vertical: "FinTech", companyId: null,
    firstName: "James", lastName: "Whitfield",
    email: "jwhitfield@gmail.com", phone: "+1 617 555 0199",
    contactType: "Loan Applicant", lifecycleStage: "SQL",
    leadSource: "Website", utmSource: "google", utmCampaign: "easyfund-summer-26",
    yachtwayDbId: "usr_bb1c22e3", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "",
    sessions_30d: 14, listingViewsToDate: 88, buyerIntentScore: 62,
    lastLoginAt: "2026-07-11", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: "loan_001",
    nextStep: "Follow up on underwriting docs", nextStepDate: "2026-07-16",
  },
  {
    id: "cnt_006", vertical: "FinTech", companyId: null,
    firstName: "Elena", lastName: "Petrova",
    email: "e.petrova@protonmail.com", phone: "+357 99 555 018",
    contactType: "Loan Applicant", lifecycleStage: "Lead",
    leadSource: "Marketplace", utmSource: "yachtway-listing", utmCampaign: "azimut-72",
    yachtwayDbId: "usr_ab77dd12", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "",
    sessions_30d: 22, listingViewsToDate: 141, buyerIntentScore: 79,
    lastLoginAt: "2026-07-12", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: "loan_002",
    nextStep: "Introduce to Marco Delgado", nextStepDate: "2026-07-15",
  },
  // ---- Fintech: Bank / Lender contacts ----
  {
    id: "cnt_009", vertical: "FinTech", companyId: "cmp_007",
    firstName: "Priya", lastName: "Ramaswamy",
    email: "priya.r@harborlinebank.com", phone: "+1 305 555 0089",
    contactType: "Bank Contact", lifecycleStage: "Customer",
    leadSource: "Partner", utmSource: "", utmCampaign: "",
    yachtwayDbId: "usr_pr_hlb", sfContactId: "0035g00000XYc99",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "Marine Lending Director",
    sessions_30d: 11, listingViewsToDate: 0, buyerIntentScore: 0,
    lastLoginAt: "2026-07-13", avgResponseTimeHours: 2.1, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "Countersign referral contract", nextStepDate: "2026-07-22",
  },
  {
    id: "cnt_010", vertical: "FinTech", companyId: "cmp_005",
    firstName: "Aaron", lastName: "Kessler",
    email: "aaron@oceanlinecap.com", phone: "+1 212 555 0178",
    contactType: "Lender Contact", lifecycleStage: "Customer",
    leadSource: "Referral", utmSource: "", utmCampaign: "",
    yachtwayDbId: "usr_ak_olc", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "VP Partnerships",
    sessions_30d: 8, listingViewsToDate: 0, buyerIntentScore: 0,
    lastLoginAt: "2026-07-09", avgResponseTimeHours: 3.4, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "Quarterly funded-volume review", nextStepDate: "2026-08-10",
  },
];

export const LISTINGS: Listing[] = [
  { id: "lst_001", companyId: "cmp_001", brokerContactId: "cnt_001", brandId: "brd_riviera",
    model: "6800 Sport Yacht", year: 2024, lengthFt: 68, priceUsd: 3_200_000,
    status: "Active", hullId: "RIV-6800-24-11", listedAt: "2026-05-14",
    listingUrl: "https://YachtWay.com/listings/riviera-6800-sport-yacht-2024-riv-6800-24-11",
    has_3d_tour: true,  photoCount: 42,
    mediaQuality: "excellent", photoSetting: "onWater", hasVideo: true,
    descriptionLength: 1850, priceHidden: false, featuresTotal: 40, featuresFilled: 38 },
  { id: "lst_002", companyId: "cmp_001", brokerContactId: "cnt_001", brandId: "brd_azimut",
    model: "Grande 27M", year: 2023, lengthFt: 88, priceUsd: 8_950_000,
    status: "Pending", hullId: "AZ-G27-23-04", listedAt: "2026-03-02",
    listingUrl: "https://YachtWay.com/listings/azimut-grande-27m-2023-az-g27-23-04",
    has_3d_tour: true,  photoCount: 58,
    mediaQuality: "excellent", photoSetting: "onWater", hasVideo: true,
    descriptionLength: 2400, priceHidden: true, featuresTotal: 40, featuresFilled: 36 },
  { id: "lst_003", companyId: "cmp_002", brokerContactId: "cnt_002", brandId: "brd_ferretti",
    model: "780", year: 2022, lengthFt: 78, priceUsd: 5_400_000,
    status: "Active", hullId: "FER-780-22-19", listedAt: "2026-06-18",
    listingUrl: "https://YachtWay.com/listings/ferretti-780-2022-fer-780-22-19",
    has_3d_tour: false, photoCount: 24,
    mediaQuality: "fair", photoSetting: "dock", hasVideo: false,
    descriptionLength: 620, priceHidden: false, featuresTotal: 40, featuresFilled: 22 },
  { id: "lst_004", companyId: "cmp_002", brokerContactId: "cnt_007", brandId: "brd_pershing",
    model: "Pershing 8X", year: 2025, lengthFt: 84, priceUsd: 7_800_000,
    status: "Active", hullId: "PSH-8X-25-02", listedAt: "2026-07-01",
    listingUrl: "https://YachtWay.com/listings/pershing-8x-2025-psh-8x-25-02",
    has_3d_tour: false, photoCount: 31,
    mediaQuality: "good", photoSetting: "mixed", hasVideo: false,
    descriptionLength: 1200, priceHidden: false, featuresTotal: 40, featuresFilled: 28 },
  { id: "lst_005", companyId: "cmp_003", brokerContactId: "cnt_004", brandId: "brd_sunseeker",
    model: "Predator 65", year: 2024, lengthFt: 65, priceUsd: 2_650_000,
    status: "Active", hullId: "SUN-P65-24-07", listedAt: "2026-04-22",
    listingUrl: "https://YachtWay.com/listings/sunseeker-predator-65-2024-sun-p65-24-07",
    has_3d_tour: true,  photoCount: 48,
    mediaQuality: "good", photoSetting: "onWater", hasVideo: true,
    descriptionLength: 1600, priceHidden: false, featuresTotal: 40, featuresFilled: 34 },
  { id: "lst_006", companyId: "cmp_003", brokerContactId: "cnt_004", brandId: "brd_princess",
    model: "Y85", year: 2023, lengthFt: 85, priceUsd: 6_100_000,
    status: "Sold", hullId: "PRN-Y85-23-03", listedAt: "2026-01-11",
    listingUrl: "https://YachtWay.com/listings/princess-y85-2023-prn-y85-23-03",
    has_3d_tour: true,  photoCount: 51,
    mediaQuality: "excellent", photoSetting: "onWater", hasVideo: true,
    descriptionLength: 2100, priceHidden: false, featuresTotal: 40, featuresFilled: 39 },
  { id: "lst_007", companyId: "cmp_004", brokerContactId: "cnt_005", brandId: "brd_pershing",
    model: "Pershing 5X", year: 2022, lengthFt: 55, priceUsd: 1_800_000,
    status: "Active", hullId: "PSH-5X-22-14", listedAt: "2026-06-05",
    listingUrl: "https://YachtWay.com/listings/pershing-5x-2022-psh-5x-22-14",
    has_3d_tour: false, photoCount: 18,
    mediaQuality: "poor", photoSetting: "trailer", hasVideo: false,
    descriptionLength: 240, priceHidden: true, featuresTotal: 40, featuresFilled: 12 },
  { id: "lst_008", companyId: "cmp_006", brokerContactId: null, brandId: "brd_whaler",
    model: "420 Outrage", year: 2024, lengthFt: 42, priceUsd: 895_000,
    status: "Active", hullId: "BW-420-24-31", listedAt: "2026-05-30",
    listingUrl: "https://YachtWay.com/listings/boston-whaler-420-outrage-2024-bw-420-24-31",
    has_3d_tour: false, photoCount: 12,
    mediaQuality: "poor", photoSetting: "dock", hasVideo: false,
    descriptionLength: 0, priceHidden: false, featuresTotal: 40, featuresFilled: 8 },
];

// Reconcile company.activeListings with the actual LISTINGS data so counts
// shown across tabs, panels, and detail pages always match.
for (const company of COMPANIES) {
  company.activeListings = LISTINGS.filter(
    (l) => l.companyId === company.id && l.status === "Active",
  ).length;
}





export const LOAN_APPLICATIONS: LoanApplication[] = [
  { id: "loan_001", contactId: "cnt_003",
    yachtwayEasyfundExternalId: "ef_ext_44112",
    stage: "Underwriting", creditScore: "700-749",
    monthlyIncome: 18_500, monthlyDebt: 4_200,
    downPayment: 85_000, estimatedQualification: 425_000,
    monthlyPaymentMin: 3_100, monthlyPaymentMax: 3_650,
    dobYear: 1982, coapplicant: true, bankCompanyId: "cmp_007" },
  { id: "loan_002", contactId: "cnt_006",
    yachtwayEasyfundExternalId: "",
    stage: "Prequalified", creditScore: "750-799",
    monthlyIncome: 42_000, monthlyDebt: 6_800,
    downPayment: 400_000, estimatedQualification: 1_800_000,
    monthlyPaymentMin: 12_400, monthlyPaymentMax: 14_100,
    dobYear: 1975, coapplicant: false, bankCompanyId: "cmp_005" },
];

export const OPPORTUNITIES: Opportunity[] = [
  { id: "opp_001", name: "Riviera Miami - SaaS renewal", pipeline: "SaaS Sales",
    stage: "Negotiation", amountUsd: 48_000, closeDate: "2026-08-15",
    owner: "Mavil", companyId: "cmp_001", contactId: "cnt_001", listingId: null,
    probability: 70, stageEnteredAt: "2026-07-05", lostReason: null, closeReason: "" },
  { id: "opp_002", name: "Sunseeker FTL - Studio upsell", pipeline: "Studio",
    stage: "Studio Booked", amountUsd: 24_000, closeDate: "2026-07-28",
    owner: "Gianmarco", companyId: "cmp_003", contactId: "cnt_004", listingId: null,
    probability: 55, stageEnteredAt: "2026-07-08", lostReason: null, closeReason: "" },
  { id: "opp_003", name: "Whitfield - EasyFund 425k", pipeline: "EasyFund",
    stage: "Underwriting", amountUsd: 425_000, closeDate: "2026-07-30",
    owner: "Debbie", companyId: null, contactId: "cnt_003", listingId: null,
    probability: 60, stageEnteredAt: "2026-07-10", lostReason: null, closeReason: "" },
  { id: "opp_004", name: "Petrova - Azimut Grande 27M", pipeline: "EasyFund",
    stage: "Pre-Qual Complete", amountUsd: 1_800_000, closeDate: "2026-09-10",
    owner: "Debbie", companyId: null, contactId: "cnt_006", listingId: "lst_002",
    probability: 30, stageEnteredAt: "2026-06-28", lostReason: null, closeReason: "" },
  { id: "opp_005", name: "Coastline Brokerage - New signup", pipeline: "Dealer Signups",
    stage: "Discovery", amountUsd: 18_000, closeDate: "2026-08-30",
    owner: "Mavil", companyId: "cmp_006", contactId: null, listingId: null,
    probability: 25, stageEnteredAt: "2026-07-01", lostReason: null, closeReason: "" },
  { id: "opp_006", name: "Harborline Bank - Referral partnership", pipeline: "Referral Partners",
    stage: "Contract", amountUsd: 72_000, closeDate: "2026-08-01",
    owner: "Kristi Toom", companyId: "cmp_007", contactId: "cnt_009", listingId: null,
    probability: 80, stageEnteredAt: "2026-07-09", lostReason: null, closeReason: "" },
  { id: "opp_007", name: "Meridian Marine - SaaS pilot", pipeline: "SaaS Sales",
    stage: "Qualification", amountUsd: 12_000, closeDate: "2026-09-15",
    owner: "Mavil", companyId: "cmp_008", contactId: null, listingId: null,
    probability: 15, stageEnteredAt: "2026-06-20", lostReason: null, closeReason: "" },
  { id: "opp_008", name: "Riviera Miami - Studio refresh", pipeline: "Studio",
    stage: "Service Requested", amountUsd: 8_500, closeDate: "2026-08-05",
    owner: "Gianmarco", companyId: "cmp_001", contactId: "cnt_001", listingId: null,
    probability: 20, stageEnteredAt: "2026-07-11", lostReason: null, closeReason: "" },
  { id: "opp_009", name: "Azure Marine - Studio session", pipeline: "Studio",
    stage: "Shoot Complete", amountUsd: 6_200, closeDate: "2026-07-25",
    owner: "Gianmarco", companyId: "cmp_004", contactId: null, listingId: null,
    probability: 65, stageEnteredAt: "2026-07-06", lostReason: null, closeReason: "" },
  { id: "opp_010", name: "Pershing Newport - Studio kickoff", pipeline: "Studio",
    stage: "Closed", amountUsd: 5_400, closeDate: "2026-07-10",
    owner: "Gianmarco", companyId: "cmp_005", contactId: null, listingId: null,
    probability: 100, stageEnteredAt: "2026-07-10", lostReason: null,
    closeReason: "Delivered on schedule, dealer signed off on final cut." },
];

export const NOTES: Note[] = [
  { id: "n_1", relatedType: "company", relatedId: "cmp_001", author: "Mavil",
    body: "Marco confirmed they will renew SaaS + add 2 seats. Send DocuSign by Friday.",
    createdAt: "2026-07-13", visibility: "team" },
  { id: "n_2", relatedType: "contact", relatedId: "cnt_003", author: "Debbie",
    body: "Docs uploaded, sent to Harborline underwriting queue. Expect 48h response.",
    createdAt: "2026-07-12", visibility: "team" },
  { id: "n_3", relatedType: "company", relatedId: "cmp_003", author: "Gianmarco",
    body: "Karen wants to see Studio ROI dashboard before signing off on the upsell.",
    createdAt: "2026-07-11", visibility: "public" },
  { id: "n_4", relatedType: "contact", relatedId: "cnt_006", author: "Debbie",
    body: "Internal reminder: Elena's partner has veto rights - don't push too hard.",
    createdAt: "2026-07-10", visibility: "private" },
  { id: "n_5", relatedType: "company", relatedId: "cmp_001", author: "Kristi Toom",
    body: "Secure: outstanding payment dispute escalated to legal. Do not discuss with the account team until counsel replies.",
    createdAt: "2026-07-09", visibility: "secure" },
];

export const TASKS: Task[] = [
  { id: "t_1", relatedType: "company", relatedId: "cmp_001", title: "Send SaaS renewal DocuSign",
    assignee: "Mavil", dueDate: "2026-07-24", status: "Open", priority: "High" },
  { id: "t_2", relatedType: "contact", relatedId: "cnt_003", title: "Follow up on underwriting docs",
    assignee: "Debbie", dueDate: "2026-07-26", status: "In Progress", priority: "High" },
  { id: "t_3", relatedType: "company", relatedId: "cmp_003", title: "Prep Studio ROI deck for Karen",
    assignee: "Gianmarco", dueDate: "2026-07-30", status: "Open", priority: "Med" },
  { id: "t_4", relatedType: "company", relatedId: "cmp_006", title: "Discovery call - Coastline Brokerage",
    assignee: "Mavil", dueDate: "2026-08-04", status: "Open", priority: "Med" },
  { id: "t_5", relatedType: "contact", relatedId: "cnt_006", title: "Introduce Elena to Marco Delgado",
    assignee: "Debbie", dueDate: "2026-07-21", status: "Open", priority: "High" },
  { id: "t_6", relatedType: "company", relatedId: "cmp_007", title: "Countersign referral partnership contract",
    assignee: "Kristi Toom", dueDate: "2026-08-01", status: "In Progress", priority: "High" },
];

export const EVENTS: CalendarEvent[] = [
  { id: "e_1", relatedType: "company", relatedId: "cmp_001",
    title: "SaaS renewal call - Riviera Miami", startAt: "2026-07-16T15:00",
    endAt: "2026-07-16T15:30", location: "Zoom",
    attendees: ["Mavil", "Marco Delgado"] },
  { id: "e_2", relatedType: "contact", relatedId: "cnt_006",
    title: "Elena × Marco intro call", startAt: "2026-07-17T11:00",
    endAt: "2026-07-17T11:30", location: "Google Meet",
    attendees: ["Debbie", "Elena Petrova", "Marco Delgado"] },
  { id: "e_3", relatedType: "company", relatedId: "cmp_007",
    title: "Harborline QBR", startAt: "2026-07-22T14:00",
    endAt: "2026-07-22T15:00", location: "Miami HQ",
    attendees: ["Kristi Toom", "Priya Ramaswamy"] },
  { id: "e_4", relatedType: "company", relatedId: "cmp_006",
    title: "Discovery - Coastline Brokerage", startAt: "2026-07-17T18:00",
    endAt: "2026-07-17T18:45", location: "Zoom",
    attendees: ["Mavil"] },
];

// -------- Studio bookings (upcoming YachtWay Studio shoots) --------
export interface StudioBooking {
  id: string;
  companyId: string;                // dealer/brokerage being shot
  vessel: string;                    // vessel name / listing focus
  scheduledAt: string;              // ISO date/time of shoot
  durationHours: number;
  location: string;                  // marina / dock / address
  photographer: string;              // YachtWay studio operator
  crew: string[];                    // extra crew (drone op, editor on-site)
  contactName: string;              // client-side POC on the day
  contactPhone: string;
  package: "3D Tour" | "Full Shoot" | "LIVE Session" | "Drone + 3D";
  status: "Confirmed" | "Tentative" | "Reschedule requested";
  notes: string;
}

export const STUDIO_BOOKINGS: StudioBooking[] = [
  {
    id: "sb_1", companyId: "cmp_001", vessel: "Azimut Grande 27M - hull #4",
    scheduledAt: "2026-07-17T09:00", durationHours: 4,
    location: "Island Gardens Marina, Slip C-14, Miami FL",
    photographer: "Diego Marín", crew: ["Nina Park (drone)"],
    contactName: "Marco Delgado", contactPhone: "+1 305 555 0143",
    package: "Drone + 3D", status: "Confirmed",
    notes: "Owner wants twilight exteriors - be on-dock by 8:30.",
  },
  {
    id: "sb_2", companyId: "cmp_003", vessel: "Sunseeker 88 Yacht - Serenity II",
    scheduledAt: "2026-07-19T13:00", durationHours: 6,
    location: "Pier 66, Fort Lauderdale FL",
    photographer: "Elena Ruiz", crew: ["Tom Becker (editor)"],
    contactName: "Karen Nakamura", contactPhone: "+1 954 555 0201",
    package: "Full Shoot", status: "Confirmed",
    notes: "Karen wants tender + water toys staged. Confirm generator access.",
  },
  {
    id: "sb_3", companyId: "cmp_002", vessel: "Pershing 8X - demo unit",
    scheduledAt: "2026-07-21T10:30", durationHours: 3,
    location: "Port Hercule, Quai Antoine 1er, Monaco",
    photographer: "Luca Rinaldi", crew: [],
    contactName: "Sophie Laurent", contactPhone: "+377 97 55 12 89",
    package: "3D Tour", status: "Tentative",
    notes: "Weather-dependent. Sophie to confirm 24h prior.",
  },
  {
    id: "sb_4", companyId: "cmp_001", vessel: "Azimut Verve 47 - listing #2201",
    scheduledAt: "2026-07-24T15:00", durationHours: 2,
    location: "Miami Beach Marina, Slip D-9",
    photographer: "Diego Marín", crew: [],
    contactName: "Marco Delgado", contactPhone: "+1 305 555 0143",
    package: "LIVE Session", status: "Confirmed",
    notes: "First LIVE pilot with buyer in Chicago on the call.",
  },
];

/** Upcoming studio bookings for companies owned by a rep, sorted soonest first. */
export function upcomingStudioBookingsForOwner(userId: string): StudioBooking[] {
  const owned = new Set(companiesOwnedBy(userId).map((c) => c.id));
  const now = Date.now();
  return STUDIO_BOOKINGS
    .filter((b) => owned.has(b.companyId) && new Date(b.scheduledAt).getTime() >= now - 3_600_000)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}



// -------- Email log (inbound/outbound between rep and account) --------
export interface EmailLog {
  id: string;
  relatedType: RelatedType;
  relatedId: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string;
  snippet: string;
  sentAt: string; // ISO date
}

export const EMAILS: EmailLog[] = [
  { id: "em_1", relatedType: "company", relatedId: "cmp_001", direction: "outbound",
    from: "alex.rivera@YachtWay.com", to: "marco.delgado@rivierayachtsmiami.com",
    subject: "Renewal terms - attached", snippet: "Marco, sending over the redlined MSA with the 2-seat add-on…",
    sentAt: "2026-07-13" },
  { id: "em_2", relatedType: "company", relatedId: "cmp_001", direction: "inbound",
    from: "marco.delgado@rivierayachtsmiami.com", to: "alex.rivera@YachtWay.com",
    subject: "Re: Renewal terms - attached", snippet: "Looks good - one clarification on the Studio credits rollover…",
    sentAt: "2026-07-12" },
  { id: "em_3", relatedType: "company", relatedId: "cmp_001", direction: "outbound",
    from: "alex.rivera@YachtWay.com", to: "marco.delgado@rivierayachtsmiami.com",
    subject: "Q3 Studio content plan", snippet: "Proposing 12 vessel shoots for Q3. Draft calendar inside…",
    sentAt: "2026-07-02" },
  { id: "em_4", relatedType: "company", relatedId: "cmp_003", direction: "outbound",
    from: "alex.rivera@YachtWay.com", to: "karen@sunseeker-ftl.com",
    subject: "Studio ROI dashboard walkthrough", snippet: "Karen, attaching last quarter's Studio attribution report…",
    sentAt: "2026-07-11" },
  { id: "em_5", relatedType: "company", relatedId: "cmp_003", direction: "inbound",
    from: "karen@sunseeker-ftl.com", to: "alex.rivera@YachtWay.com",
    subject: "Re: Studio ROI dashboard walkthrough", snippet: "Numbers look strong. Let us schedule the upsell conversation…",
    sentAt: "2026-07-10" },
  { id: "em_6", relatedType: "company", relatedId: "cmp_002", direction: "outbound",
    from: "alex.rivera@YachtWay.com", to: "sophie.laurent@azuremarine.eu",
    subject: "Onboarding remaining brokers", snippet: "Sophie - noticed only 6 of your 18 brokers are set up in CRM. Can we…",
    sentAt: "2026-06-22" },
  { id: "em_7", relatedType: "company", relatedId: "cmp_004", direction: "outbound",
    from: "alex.rivera@YachtWay.com", to: "dan@pershing-newport.com",
    subject: "Following up - SaaS pilot", snippet: "Dan, checking in on the pilot conversation from last month…",
    sentAt: "2026-05-30" },
  { id: "em_8", relatedType: "company", relatedId: "cmp_006", direction: "outbound",
    from: "alex.rivera@YachtWay.com", to: "info@coastlinebrokerage.com",
    subject: "Coastline × YachtWay intro", snippet: "Hi team - we enriched your 22 brokers into our platform and…",
    sentAt: "2026-04-18" },
];


// ---------- Query helpers ----------

export function getCompany(id: string) { return COMPANIES.find((c) => c.id === id); }
export function getContact(id: string) { return CONTACTS.find((c) => c.id === id); }
export function getBrand(id: string) { return BRANDS.find((b) => b.id === id); }
export function getListing(id: string) { return LISTINGS.find((l) => l.id === id); }
export function getOpportunity(id: string) { return OPPORTUNITIES.find((o) => o.id === id); }
export function getLoanApplication(id: string | null) {
  return id ? LOAN_APPLICATIONS.find((l) => l.id === id) : undefined;
}

// ---------- Offices (additional locations for a company) ----------
export const OFFICE_PURPOSES = ["Sales", "Service", "Shipyard", "Showroom", "Corporate", "Other"] as const;
export type OfficePurpose = (typeof OFFICE_PURPOSES)[number];

export interface Office {
  id: string;
  companyId: string;
  label: string;
  isHeadquarters: boolean;
  purpose: OfficePurpose;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  managerContactId: string | null;
}
export const OFFICES: Office[] = [];
export function officesForCompany(companyId: string): Office[] {
  return OFFICES.filter((o) => o.companyId === companyId);
}
export function addOffice(partial: Partial<Office> & { companyId: string; label: string }): Office {
  const created: Office = {
    id: partial.id ?? `off_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    companyId: partial.companyId,
    label: partial.label,
    isHeadquarters: partial.isHeadquarters ?? false,
    purpose: partial.purpose ?? "Sales",
    addressLine1: partial.addressLine1 ?? "",
    addressLine2: partial.addressLine2 ?? "",
    city: partial.city ?? "",
    state: partial.state ?? "",
    postalCode: partial.postalCode ?? "",
    country: partial.country ?? "",
    phone: partial.phone ?? "",
    email: partial.email ?? "",
    managerContactId: partial.managerContactId ?? null,
  };
  OFFICES.push(created);
  bump();
  return created;
}

export function updateOffice(id: string, patch: Partial<Office>): Office | undefined {
  const o = OFFICES.find((x) => x.id === id);
  if (!o) return undefined;
  Object.assign(o, patch);
  bump();
  return o;
}
export function removeOffice(id: string): void {
  const i = OFFICES.findIndex((x) => x.id === id);
  if (i >= 0) { OFFICES.splice(i, 1); bump(); }
}

// ---------- Runtime mutations (mock layer) ----------
// The mock arrays are mutable at runtime so "New company" / "New listing"
// dialogs can append records and list pages re-render via a lightweight
// version counter + window event.

let _dataVersion = 0;
const _listeners = new Set<() => void>();
function bump() {
  _dataVersion += 1;
  for (const fn of _listeners) fn();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("crm:data"));
}
export function subscribeMockData(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
export function getMockDataVersion(): number { return _dataVersion; }

function defaultServicesUsed(): Company["servicesUsed"] {
  return {
    saas: false, studio: false, mastercover: false, easyclose: false,
    connectCrm: false, easyfund: false, live: false, customWebsite: false,
    drive: false, vato: false, easysign: false,
  };
}

/** Append a new company. Accepts any subset of Company fields; sensible
 *  defaults fill the rest so existing UI components don't crash on
 *  missing values. Returns the created record. */
export function addCompany(partial: Partial<Company> & { name: string }): Company {
  const id = partial.id ?? `cmp_${Date.now().toString(36)}`;
  const created: Company = {
    id,
    vertical: partial.vertical ?? "Main",
    name: partial.name,
    companyType: partial.companyType ?? "Dealer",
    status: partial.status ?? "Lead",
    logoUrl: partial.logoUrl ?? null,
    parentCompanyId: partial.parentCompanyId ?? null,
    website: partial.website ?? "",
    phone: partial.phone ?? "",
    billingCity: partial.billingCity ?? "",
    billingState: partial.billingState ?? "",
    billingCountry: partial.billingCountry ?? "",
    yachtwayDbAccountId: partial.yachtwayDbAccountId ?? "",
    sfAccountId: partial.sfAccountId ?? "",
    xeroContactIdOrgA: partial.xeroContactIdOrgA ?? "",
    xeroContactIdOrgB: partial.xeroContactIdOrgB ?? "",
    yachtwayDealerPage: partial.yachtwayDealerPage ?? "",
    dealerTier: partial.dealerTier ?? "Prospect",
    activeCustomerDate: partial.activeCustomerDate ?? "",
    currency: partial.currency ?? "USD",
    activeListings: partial.activeListings ?? 0,
    apiConnected: partial.apiConnected ?? false,
    customWebsiteEnabled: partial.customWebsiteEnabled ?? false,
    verifiedDealer: partial.verifiedDealer ?? false,
    saasArrUsd: partial.saasArrUsd ?? 0,
    enrichedFromAws: partial.enrichedFromAws ?? false,
    ownerUserId: partial.ownerUserId ?? null,
    primaryContactId: partial.primaryContactId ?? null,
    scrapedBrokerCount: partial.scrapedBrokerCount ?? 0,
    crmBrokerCount: partial.crmBrokerCount ?? 0,
    lastContactedAt: partial.lastContactedAt ?? "",
    lastContactChannel: partial.lastContactChannel ?? "",
    servicesUsed: { ...defaultServicesUsed(), ...(partial.servicesUsed ?? {}) },
    studioSpendYtd: partial.studioSpendYtd ?? 0,
    lastLogin: partial.lastLogin ?? "",
    lastStudioSessionAt: partial.lastStudioSessionAt ?? "",
    easyfundReferralsTotal: partial.easyfundReferralsTotal ?? 0,
    easyfundReferralsApproved: partial.easyfundReferralsApproved ?? 0,
    easyfundReferralsFunded: partial.easyfundReferralsFunded ?? 0,
    easyfundClosedReferralsAmount: partial.easyfundClosedReferralsAmount ?? 0,
    nextStep: partial.nextStep ?? "",
    nextStepDate: partial.nextStepDate ?? "",
  };
  COMPANIES.push(created);
  bump();
  return created;
}

export function addListing(partial: Partial<Listing> & { model: string; brandId: string; companyId: string }): Listing {
  const id = partial.id ?? `lst_${Date.now().toString(36)}`;
  const created: Listing = {
    id,
    companyId: partial.companyId,
    brokerContactId: partial.brokerContactId ?? null,
    brandId: partial.brandId,
    model: partial.model,
    year: partial.year ?? new Date().getFullYear(),
    lengthFt: partial.lengthFt ?? 0,
    priceUsd: partial.priceUsd ?? 0,
    status: partial.status ?? "Active",
    hullId: partial.hullId ?? "",
    listedAt: partial.listedAt ?? new Date().toISOString().slice(0, 10),
    listingUrl: partial.listingUrl ?? null,
    has_3d_tour: partial.has_3d_tour ?? false,
    photoCount: partial.photoCount ?? 0,
    mediaQuality: partial.mediaQuality ?? "fair",
    photoSetting: partial.photoSetting ?? "dock",
    hasVideo: partial.hasVideo ?? false,
    descriptionLength: partial.descriptionLength ?? 0,
    priceHidden: partial.priceHidden ?? false,
    featuresTotal: partial.featuresTotal ?? 0,
    featuresFilled: partial.featuresFilled ?? 0,
  };
  LISTINGS.push(created);
  bump();
  return created;
}

/** Update an existing opportunity in place and notify subscribers. */
export function updateOpportunity(id: string, patch: Partial<Opportunity>): Opportunity | undefined {
  const opp = OPPORTUNITIES.find((o) => o.id === id);
  if (!opp) return undefined;
  // Stamp stageEnteredAt when stage actually changes.
  if (patch.stage && patch.stage !== opp.stage) {
    patch.stageEnteredAt = new Date().toISOString().slice(0, 10);
  }
  Object.assign(opp, patch);
  bump();
  return opp;
}

/** Update an existing contact in place and notify subscribers. */
export function updateContact(id: string, patch: Partial<Contact>): Contact | undefined {
  const c = CONTACTS.find((x) => x.id === id);
  if (!c) return undefined;
  Object.assign(c, patch);
  if (c.companyId) ensurePrimaryContact(c.companyId);
  bump();
  return c;
}

/**
 * Primary-contact auto-assignment: the first contact linked to a company becomes
 * its primary point of contact. Runs whenever contacts are created / relinked /
 * removed, and repairs stale pointers (primary contact deleted or moved away).
 */
export function ensurePrimaryContact(companyId: string): string | null {
  const company = COMPANIES.find((c) => c.id === companyId);
  if (!company) return null;
  const linked = CONTACTS.filter((c) => c.companyId === companyId);
  const current = company.primaryContactId
    ? linked.find((c) => c.id === company.primaryContactId)
    : undefined;
  if (current) return current.id;
  company.primaryContactId = linked[0]?.id ?? null;
  return company.primaryContactId;
}

/** Explicitly promote a contact to primary on its company. */
export function setPrimaryContact(companyId: string, contactId: string): void {
  const company = COMPANIES.find((c) => c.id === companyId);
  if (!company) return;
  const contact = CONTACTS.find((c) => c.id === contactId && c.companyId === companyId);
  if (!contact) return;
  company.primaryContactId = contactId;
  bump();
}

/** Create a contact. The first contact on a company auto-flags as primary. */
export function addContact(
  partial: Partial<Contact> & { firstName: string; lastName: string },
): Contact {
  const id = partial.id ?? `cnt_${Date.now().toString(36)}`;
  const created: Contact = {
    id,
    vertical: partial.vertical ?? "Main",
    companyId: partial.companyId ?? null,
    firstName: partial.firstName,
    lastName: partial.lastName,
    email: partial.email ?? "",
    phone: partial.phone ?? "",
    contactType: partial.contactType ?? "Broker",
    lifecycleStage: partial.lifecycleStage ?? "Lead",
    leadSource: partial.leadSource ?? "",
    utmSource: partial.utmSource ?? "",
    utmCampaign: partial.utmCampaign ?? "",
    yachtwayDbId: partial.yachtwayDbId ?? "",
    sfContactId: partial.sfContactId ?? "",
    brokerLicenseNumber: partial.brokerLicenseNumber ?? "",
    brokerLicenseState: partial.brokerLicenseState ?? "",
    roleAtDealership: partial.roleAtDealership ?? "",
    sessions_30d: partial.sessions_30d ?? 0,
    listingViewsToDate: partial.listingViewsToDate ?? 0,
    buyerIntentScore: partial.buyerIntentScore ?? 0,
    lastLoginAt: partial.lastLoginAt ?? "",
    avgResponseTimeHours: partial.avgResponseTimeHours ?? 0,
    studioSpendYtd: partial.studioSpendYtd ?? 0,
    loanApplicationId: partial.loanApplicationId ?? null,
    avatarUrl: partial.avatarUrl ?? null,
    companyRole: partial.companyRole ?? null,
    nextStep: partial.nextStep ?? "",
    nextStepDate: partial.nextStepDate ?? "",
  };
  CONTACTS.push(created);
  if (created.companyId) ensurePrimaryContact(created.companyId);
  bump();
  return created;
}


// ---------- Merge helpers (dedupe companies / contacts / opportunities) ----------
/** Apply per-field winners to `target`. `winners[field] === "source"` copies source[field]. */
function applyWinners<T>(
  target: T, source: T, winners: Record<string, "source" | "target">,
) {
  const t = target as unknown as Record<string, unknown>;
  const s = source as unknown as Record<string, unknown>;
  for (const [key, who] of Object.entries(winners)) {
    if (who === "source") t[key] = s[key];
  }
}

/** Merge `sourceId` INTO `targetId`. Target survives. All related records
 *  are re-pointed to target, then source is removed. `winners` decides which
 *  scalar field values survive on the target. */
export function mergeCompanies(
  sourceId: string, targetId: string, winners: Record<string, "source" | "target">,
): Company | undefined {
  if (sourceId === targetId) return undefined;
  const source = COMPANIES.find((c) => c.id === sourceId);
  const target = COMPANIES.find((c) => c.id === targetId);
  if (!source || !target) return undefined;
  applyWinners(target, source, winners);
  // Re-point related records
  for (const c of CONTACTS) if (c.companyId === sourceId) c.companyId = targetId;
  for (const c of COMPANIES) if (c.parentCompanyId === sourceId) c.parentCompanyId = targetId;
  for (const l of LISTINGS) if (l.companyId === sourceId) l.companyId = targetId;
  for (const o of OPPORTUNITIES) if (o.companyId === sourceId) o.companyId = targetId;
  for (const r of BRAND_REPRESENTATIONS) if (r.companyId === sourceId) r.companyId = targetId;
  for (const la of LOAN_APPLICATIONS) if (la.bankCompanyId === sourceId) la.bankCompanyId = targetId;
  for (const off of OFFICES) if (off.companyId === sourceId) off.companyId = targetId;
  // Delete source
  const idx = COMPANIES.findIndex((c) => c.id === sourceId);
  if (idx >= 0) COMPANIES.splice(idx, 1);
  bump();
  return target;
}

export function mergeContacts(
  sourceId: string, targetId: string, winners: Record<string, "source" | "target">,
): Contact | undefined {
  if (sourceId === targetId) return undefined;
  const source = CONTACTS.find((c) => c.id === sourceId);
  const target = CONTACTS.find((c) => c.id === targetId);
  if (!source || !target) return undefined;
  applyWinners(target, source, winners);
  for (const l of LISTINGS) if (l.brokerContactId === sourceId) l.brokerContactId = targetId;
  for (const o of OPPORTUNITIES) if (o.contactId === sourceId) o.contactId = targetId;
  for (const c of COMPANIES) if (c.primaryContactId === sourceId) c.primaryContactId = targetId;
  for (const la of LOAN_APPLICATIONS) if (la.contactId === sourceId) la.contactId = targetId;
  for (const off of OFFICES) if (off.managerContactId === sourceId) off.managerContactId = targetId;
  const idx = CONTACTS.findIndex((c) => c.id === sourceId);
  if (idx >= 0) CONTACTS.splice(idx, 1);
  bump();
  return target;
}

export function mergeOpportunities(
  sourceId: string, targetId: string, winners: Record<string, "source" | "target">,
): Opportunity | undefined {
  if (sourceId === targetId) return undefined;
  const source = OPPORTUNITIES.find((o) => o.id === sourceId);
  const target = OPPORTUNITIES.find((o) => o.id === targetId);
  if (!source || !target) return undefined;
  applyWinners(target, source, winners);
  const idx = OPPORTUNITIES.findIndex((o) => o.id === sourceId);
  if (idx >= 0) OPPORTUNITIES.splice(idx, 1);
  bump();
  return target;
}

export function contactsForCompany(companyId: string) {
  return CONTACTS.filter((c) => c.companyId === companyId);
}
export function childCompanies(parentId: string) {
  return COMPANIES.filter((c) => c.parentCompanyId === parentId);
}
export function brandsForCompany(companyId: string) {
  return BRAND_REPRESENTATIONS
    .filter((r) => r.companyId === companyId)
    .map((r) => ({ ...r, brand: getBrand(r.brandId)! }));
}
export function listingsForCompany(companyId: string) {
  return LISTINGS.filter((l) => l.companyId === companyId);
}
export function listingsForBroker(contactId: string) {
  return LISTINGS.filter((l) => l.brokerContactId === contactId);
}
export function activitiesFor(type: RelatedType, id: string) {
  return {
    notes: NOTES.filter((n) => n.relatedType === type && n.relatedId === id),
    tasks: TASKS.filter((t) => t.relatedType === type && t.relatedId === id),
    events: EVENTS.filter((e) => e.relatedType === type && e.relatedId === id),
    opportunities: OPPORTUNITIES.filter((o) =>
      (type === "company" && o.companyId === id) ||
      (type === "contact" && o.contactId === id) ||
      (type === "listing" && o.listingId === id),
    ),
    emails: EMAILS.filter((e) => e.relatedType === type && e.relatedId === id)
      .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1)),
  };
}

export function companiesOwnedBy(userId: string) {
  return COMPANIES.filter((c) => c.ownerUserId === userId);
}
export function daysSince(iso: string) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}
export type ServiceKey = keyof Company["servicesUsed"];
export const SERVICE_LABELS: Record<ServiceKey, string> = {
  saas: "SaaS",
  studio: "Studio",
  mastercover: "PFS",
  easyclose: "eNotary",
  connectCrm: "Connect CRM",
  easyfund: "Loan applications",
  live: "LIVE",
  customWebsite: "Custom Website",
  drive: "Drive",
  vato: "VATO",
  easysign: "EasySign",
};

/** Services not launched yet - kept in the data model but hidden in the UI.
 *  Remove a key here when the service goes live. */
export const UNAVAILABLE_SERVICES: ServiceKey[] = ["connectCrm", "easyclose"];
export function isServiceAvailable(k: ServiceKey): boolean {
  return !UNAVAILABLE_SERVICES.includes(k);
}

/**
 * Which services are *available* to each company type (single source of truth
 * for every Services-adoption view). Unavailable services render as blank
 * cells and never count toward a company's adoption total. Types not listed
 * (Bank, Insurance, Service Yard) fall back to all launched services.
 */
export const SERVICES_BY_COMPANY_TYPE: Partial<Record<CompanyType, ServiceKey[]>> = {
  Lender: ["drive", "vato", "easyfund", "mastercover"],
  Brokerage: ["saas", "studio", "live", "drive", "easysign", "easyfund", "customWebsite"],
  Dealer: ["saas", "studio", "live", "drive", "easysign", "easyfund", "customWebsite"],
  Shipyard: ["saas", "studio", "live", "drive", "easysign", "easyfund", "customWebsite"],
};

/** Launched services available to a specific company, in a stable order. */
export function availableServicesForCompany(company: Company): ServiceKey[] {
  const base =
    SERVICES_BY_COMPANY_TYPE[company.companyType] ?? (Object.keys(SERVICE_LABELS) as ServiceKey[]);
  return base.filter(isServiceAvailable);
}

export function isServiceAvailableForCompany(company: Company, k: ServiceKey): boolean {
  return isServiceAvailable(k) && availableServicesForCompany(company).includes(k);
}

/** The listing platform itself - every paying account starts here. */
export const LISTING_PLATFORM_SERVICE: ServiceKey = "saas";

export type CompanyPlan = "BASIC" | "PLUS";

/**
 * Accounts on the listing platform with no add-on services are BASIC.
 * Anything beyond the listing platform (Studio, LIVE, Drive, EasyFund...) is PLUS.
 */
export function companyPlan(company: Company): CompanyPlan {
  const addOns = (Object.keys(company.servicesUsed) as ServiceKey[]).filter(
    (k) => k !== LISTING_PLATFORM_SERVICE && isServiceAvailable(k) && company.servicesUsed[k],
  );
  return addOns.length === 0 ? "BASIC" : "PLUS";
}

/** Add-on services (excludes the listing platform) currently active. */
export function companyAddOns(company: Company): ServiceKey[] {
  return (Object.keys(company.servicesUsed) as ServiceKey[]).filter(
    (k) => k !== LISTING_PLATFORM_SERVICE && isServiceAvailable(k) && company.servicesUsed[k],
  );
}


// ============================================================
// Dealer scoring & book insights
// ============================================================

export type ScoreTier = "Cold" | "Cool" | "Warm" | "Hot" | "On Fire";

export interface DealerScore {
  score: number;                     // 0-100
  tier: ScoreTier;
  reasons: { label: string; weight: number }[]; // negative weights are drags
}

export function scoreTier(score: number): ScoreTier {
  if (score >= 85) return "On Fire";
  if (score >= 70) return "Hot";
  if (score >= 55) return "Warm";
  if (score >= 40) return "Cool";
  return "Cold";
}

/** Deterministic dealer/brokerage health score based on portal, Studio,
 *  broker coverage, listing volume, media quality, and product mix. */
export function computeDealerScore(company: Company): DealerScore {
  const reasons: DealerScore["reasons"] = [];
  let score = 100;

  const isDealerOrBroker =
    company.companyType === "Dealer" || company.companyType === "Brokerage";
  if (!isDealerOrBroker || company.vertical !== "Main") {
    // Non-dealer accounts fall back to a neutral 70 so they don't skew rollups.
    return { score: 70, tier: "Warm", reasons: [] };
  }

  // Portal engagement
  const loginDays = daysSince(company.lastLogin);
  if (!company.lastLogin) {
    score -= 30;
    reasons.push({ label: "Never signed into YachtWay portal", weight: -30 });
  } else if (loginDays > 30) {
    score -= 20;
    reasons.push({ label: `No portal login in ${loginDays}d`, weight: -20 });
  } else if (loginDays > 14) {
    score -= 10;
    reasons.push({ label: `Portal quiet ${loginDays}d`, weight: -10 });
  }

  // Studio usage
  const studioDays = daysSince(company.lastStudioSessionAt);
  if (!company.lastStudioSessionAt) {
    score -= 15;
    reasons.push({ label: "Never used Studio", weight: -15 });
  } else if (studioDays > 28) {
    score -= 10;
    reasons.push({ label: `Studio quiet ${studioDays}d`, weight: -10 });
  }

  // Broker coverage
  const scraped = company.scrapedBrokerCount;
  const crm = company.crmBrokerCount;
  if (scraped > 0) {
    const coverage = crm / scraped;
    if (coverage < 0.5) {
      score -= 20;
      reasons.push({ label: `Only ${Math.round(coverage * 100)}% broker coverage`, weight: -20 });
    } else if (coverage < 0.75) {
      score -= 10;
      reasons.push({ label: `${Math.round(coverage * 100)}% broker coverage`, weight: -10 });
    }
  }

  // Listing volume
  const listings = listingsForCompany(company.id);
  const active = listings.filter((l) => l.status === "Active");
  if (listings.length === 0) {
    score -= 25;
    reasons.push({ label: "No listings uploaded", weight: -25 });
  } else if (active.length === 0) {
    score -= 15;
    reasons.push({ label: "No active listings", weight: -15 });
  }

  // 3D tours
  if (active.length > 0) {
    const with3d = active.filter((l) => l.has_3d_tour).length;
    if (with3d === 0) {
      score -= 10;
      reasons.push({ label: "No 3D tours on any listing", weight: -10 });
    }
  }

  // Service adoption - the account has to actually USE something to score well.
  const s = company.servicesUsed;
  const activeServices = [
    s.saas, s.studio, s.mastercover, s.easyclose, s.connectCrm, s.easyfund, s.live, s.customWebsite, s.drive, s.vato,
  ].filter(Boolean).length;
  if (activeServices === 0) {
    score -= 40;
    reasons.push({ label: "Not using any YachtWay services", weight: -40 });
  } else if (activeServices === 1) {
    score -= 20;
    reasons.push({ label: "Only 1 service adopted", weight: -20 });
  } else if (activeServices === 2) {
    score -= 10;
    reasons.push({ label: "Only 2 services adopted", weight: -10 });
  } else if (!s.easyfund) {
    score -= 5;
    reasons.push({ label: "EasyFund not enabled", weight: -5 });
  }

  score = Math.max(0, Math.min(100, score));
  return { score, tier: scoreTier(score), reasons };
}

/** How many days ago was the dealer activated (Infinity if never). */
export function activationDays(company: Company): number {
  return daysSince(company.activeCustomerDate);
}

export function has3DTours(company: Company): { with3d: number; total: number } {
  const active = listingsForCompany(company.id).filter((l) => l.status === "Active");
  return { with3d: active.filter((l) => l.has_3d_tour).length, total: active.length };
}

export interface BookInsights {
  totalDealers: number;
  noPortalLogin30d: Company[];      // active dealers dark 30+ days (or never)
  neverStudio: Company[];           // Main dealers/brokerages, activated, never Studio
  neverStudioInState: (state: string) => Company[];
  studioLapsed4w: Company[];        // used studio in past, quiet 28+ days
  noListings: Company[];            // activated dealers with zero listings
  activatedLast7dNoListing: Company[];
  activatedLast7dNoBrokers: Company[];
  belowWarm: { company: Company; score: DealerScore }[]; // score < 55
  noThreeDTours: Company[];         // active dealers with active listings but 0 3D tours
  neverLive: Company[];             // activated dealers never using YachtWay LIVE
}

/** Aggregate cross-account insights, optionally scoped to a rep. */
export function bookInsights(scope: Company[] = COMPANIES): BookInsights {
  const dealers = scope.filter(
    (c) => c.vertical === "Main" && (c.companyType === "Dealer" || c.companyType === "Brokerage"),
  );
  const activated = dealers.filter((c) => c.activeCustomerDate);

  const noPortalLogin30d = activated.filter((c) => daysSince(c.lastLogin) > 30);
  const neverStudio = activated.filter((c) => !c.lastStudioSessionAt);
  const studioLapsed4w = activated.filter(
    (c) => c.lastStudioSessionAt && daysSince(c.lastStudioSessionAt) > 28,
  );
  const noListings = activated.filter((c) => listingsForCompany(c.id).length === 0);

  const last7d = activated.filter((c) => activationDays(c) <= 7);
  const activatedLast7dNoListing = last7d.filter((c) => listingsForCompany(c.id).length === 0);
  const activatedLast7dNoBrokers = last7d.filter((c) => c.crmBrokerCount === 0);

  const belowWarm = dealers
    .map((c) => ({ company: c, score: computeDealerScore(c) }))
    .filter((x) => x.score.score < 55)
    .sort((a, b) => a.score.score - b.score.score);

  const noThreeDTours = activated.filter((c) => {
    const t = has3DTours(c);
    return t.total > 0 && t.with3d === 0;
  });
  const neverLive = activated.filter((c) => !c.servicesUsed.live);

  return {
    totalDealers: dealers.length,
    noPortalLogin30d,
    neverStudio,
    neverStudioInState: (state: string) =>
      neverStudio.filter((c) => c.billingState === state),
    studioLapsed4w,
    noListings,
    activatedLast7dNoListing,
    activatedLast7dNoBrokers,
    belowWarm,
    noThreeDTours,
    neverLive,
  };
}

export const TIER_STYLES: Record<ScoreTier, { text: string; bg: string; ring: string }> = {
  "On Fire": { text: "text-white",      bg: "bg-gradient-to-br from-[oklch(0.62_0.19_25)] to-[oklch(0.5_0.2_15)]", ring: "ring-[oklch(0.62_0.19_25)]/40" },
  Hot:       { text: "text-success",    bg: "bg-success/15",  ring: "ring-success/30" },
  Warm:      { text: "text-brand-deep", bg: "bg-brand/12",    ring: "ring-brand/30" },
  Cool:      { text: "text-warning",    bg: "bg-warning/15",  ring: "ring-warning/30" },
  Cold:      { text: "text-destructive",bg: "bg-destructive/12", ring: "ring-destructive/30" },
};

// Seed extra rows sourced from Mock_Dataset-updated.xlsx.

// ---------- Extra brands referenced by Excel listings ----------
BRANDS.push(
  { id: "brd_benetti",  name: "Benetti",  manufacturerCountry: "Italy", tier: "Luxury" },
  { id: "brd_explorer", name: "Explorer Yachts", manufacturerCountry: "Netherlands", tier: "Luxury" },
);

// ---------- Excel: Accounts → Companies ----------
COMPANIES.push(
  {
    id: "acc_01", vertical: "Main", name: "Marina Bay Yacht Group",
    companyType: "Dealer", status: "Customer", logoUrl: null, parentCompanyId: null,
    website: "https://marinabayyachts.com", yachtwayDealerPage: "", phone: "(954) 555-0100",
    billingCity: "Fort Lauderdale", billingState: "FL", billingCountry: "USA",
    yachtwayDbAccountId: "AC1042", sfAccountId: "",
    xeroContactIdOrgA: "XA-1042", xeroContactIdOrgB: "",
    dealerTier: "Gold", activeCustomerDate: "2026-07-07",
    currency: "USD",
    activeListings: 62, apiConnected: true, customWebsiteEnabled: true, verifiedDealer: true,
    saasArrUsd: 10477, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "con_1001", scrapedBrokerCount: 14, crmBrokerCount: 14,
    lastContactedAt: "2026-07-13", lastContactChannel: "Email",
    servicesUsed: { saas: true, studio: true, mastercover: false, easyclose: false, connectCrm: true, easyfund: true, live: true, customWebsite: true, drive: false, vato: false, easysign: true },
    studioSpendYtd: 22800,
    lastLogin: "2026-07-13", lastStudioSessionAt: "",
    easyfundReferralsTotal: 57, easyfundReferralsApproved: 19,
    easyfundReferralsFunded: 19, easyfundClosedReferralsAmount: 8420000,
    nextStep: "Quarterly business review", nextStepDate: "2026-08-15",
  },
  {
    id: "acc_02", vertical: "Main", name: "Pacific Coast Marine",
    companyType: "Dealer", status: "Customer", logoUrl: null, parentCompanyId: null,
    website: "https://pacificcoastmarine.com", yachtwayDealerPage: "", phone: "(619) 555-0100",
    billingCity: "San Diego", billingState: "CA", billingCountry: "USA",
    yachtwayDbAccountId: "AC1077", sfAccountId: "",
    xeroContactIdOrgA: "XA-1077", xeroContactIdOrgB: "",
    dealerTier: "Gold", activeCustomerDate: "2026-07-09",
    currency: "USD",
    activeListings: 38, apiConnected: true, customWebsiteEnabled: true, verifiedDealer: true,
    saasArrUsd: 9752, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "con_1002", scrapedBrokerCount: 9, crmBrokerCount: 9,
    lastContactedAt: "2026-07-11", lastContactChannel: "Email",
    servicesUsed: { saas: true, studio: false, mastercover: false, easyclose: false, connectCrm: true, easyfund: true, live: false, customWebsite: true, drive: false, vato: false, easysign: true },
    studioSpendYtd: 9600,
    lastLogin: "2026-07-11", lastStudioSessionAt: "",
    easyfundReferralsTotal: 21, easyfundReferralsApproved: 6,
    easyfundReferralsFunded: 6, easyfundClosedReferralsAmount: 2115000,
    nextStep: "Quarterly business review", nextStepDate: "2026-08-15",
  },
  {
    id: "acc_03", vertical: "Main", name: "Edmiston & Co Brokerage",
    companyType: "Brokerage", status: "Customer", logoUrl: null, parentCompanyId: null,
    website: "https://edmiston.com", yachtwayDealerPage: "", phone: "+44 20 7495 5151",
    billingCity: "London", billingState: "England", billingCountry: "United Kingdom",
    yachtwayDbAccountId: "AC1091", sfAccountId: "",
    xeroContactIdOrgA: "XA-1091", xeroContactIdOrgB: "",
    dealerTier: "Gold", activeCustomerDate: "2026-07-09",
    currency: "GBP",
    activeListings: 88, apiConnected: true, customWebsiteEnabled: true, verifiedDealer: true,
    saasArrUsd: 5013, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "con_1003", scrapedBrokerCount: 26, crmBrokerCount: 26,
    lastContactedAt: "2026-07-14", lastContactChannel: "Email",
    servicesUsed: { saas: true, studio: false, mastercover: false, easyclose: false, connectCrm: true, easyfund: true, live: true, customWebsite: true, drive: false, vato: false, easysign: true },
    studioSpendYtd: 54000,
    lastLogin: "2026-07-14", lastStudioSessionAt: "",
    easyfundReferralsTotal: 44, easyfundReferralsApproved: 17,
    easyfundReferralsFunded: 17, easyfundClosedReferralsAmount: 27800000,
    nextStep: "Quarterly business review", nextStepDate: "2026-08-15",
  },
  {
    id: "acc_04", vertical: "Main", name: "Allied Marine Brokers",
    companyType: "Brokerage", status: "Customer", logoUrl: null, parentCompanyId: null,
    website: "https://alliedmarine.com", yachtwayDealerPage: "", phone: "(954) 555-0200",
    billingCity: "Fort Lauderdale", billingState: "FL", billingCountry: "USA",
    yachtwayDbAccountId: "AC1120", sfAccountId: "",
    xeroContactIdOrgA: "XA-1120", xeroContactIdOrgB: "",
    dealerTier: "Gold", activeCustomerDate: "2026-07-06",
    currency: "USD",
    activeListings: 41, apiConnected: true, customWebsiteEnabled: false, verifiedDealer: true,
    saasArrUsd: 3575, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "con_1004", scrapedBrokerCount: 17, crmBrokerCount: 17,
    lastContactedAt: "2026-07-09", lastContactChannel: "Email",
    servicesUsed: { saas: true, studio: true, mastercover: false, easyclose: false, connectCrm: true, easyfund: true, live: true, customWebsite: false, drive: false, vato: false, easysign: false },
    studioSpendYtd: 4200,
    lastLogin: "2026-07-09", lastStudioSessionAt: "",
    easyfundReferralsTotal: 4, easyfundReferralsApproved: 1,
    easyfundReferralsFunded: 1, easyfundClosedReferralsAmount: 680000,
    nextStep: "Quarterly business review", nextStepDate: "2026-08-15",
  },
  {
    id: "acc_05", vertical: "Main", name: "Northstar Shipyard & Refit",
    companyType: "Shipyard", status: "Customer", logoUrl: null, parentCompanyId: null,
    website: "https://northstarshipyard.nl", yachtwayDealerPage: "", phone: "+31 10 555 0100",
    billingCity: "Rotterdam", billingState: "South Holland", billingCountry: "Netherlands",
    yachtwayDbAccountId: "AC1155", sfAccountId: "",
    xeroContactIdOrgA: "XA-1155", xeroContactIdOrgB: "",
    dealerTier: "Gold", activeCustomerDate: "2026-07-01",
    currency: "EUR",
    activeListings: 6, apiConnected: true, customWebsiteEnabled: false, verifiedDealer: true,
    saasArrUsd: 33506, enrichedFromAws: true,
    ownerUserId: "u_rep", primaryContactId: "con_1005", scrapedBrokerCount: 3, crmBrokerCount: 3,
    lastContactedAt: "2026-07-06", lastContactChannel: "Email",
    servicesUsed: { saas: true, studio: true, mastercover: false, easyclose: false, connectCrm: true, easyfund: true, live: true, customWebsite: false, drive: false, vato: false, easysign: false },
    studioSpendYtd: 12000,
    lastLogin: "2026-07-06", lastStudioSessionAt: "",
    easyfundReferralsTotal: 2, easyfundReferralsApproved: 1,
    easyfundReferralsFunded: 1, easyfundClosedReferralsAmount: 5200000,
    nextStep: "Quarterly business review", nextStepDate: "2026-08-15",
  },
);

// ---------- Excel: Broker Contacts + Yacht Buyers → Contacts ----------
CONTACTS.push(
  {
    id: "con_1001", vertical: "Main", companyId: "acc_01",
    firstName: "Grant", lastName: "Whitfield",
    email: "grant@marinabayyachts.com", phone: "(954) 555-0188",
    contactType: "Broker", lifecycleStage: "Customer",
    leadSource: "Partner", utmSource: "", utmCampaign: "",
    yachtwayDbId: "84213", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "Senior Yacht Broker",
    sessions_30d: 48, listingViewsToDate: 0, buyerIntentScore: 0,
    lastLoginAt: "2026-07-14", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
  {
    id: "con_1002", vertical: "Main", companyId: "acc_02",
    firstName: "Hannah", lastName: "Reyes",
    email: "hannah@pacificcoastmarine.com", phone: "(619) 555-0171",
    contactType: "Broker", lifecycleStage: "Customer",
    leadSource: "Partner", utmSource: "", utmCampaign: "",
    yachtwayDbId: "84590", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "Sales Broker",
    sessions_30d: 9, listingViewsToDate: 0, buyerIntentScore: 0,
    lastLoginAt: "2026-07-07", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
  {
    id: "con_1003", vertical: "Main", companyId: "acc_03",
    firstName: "Camille", lastName: "Laurent",
    email: "camille.laurent@edmiston.com", phone: "+33 6 12 44 90 01",
    contactType: "Broker", lifecycleStage: "Customer",
    leadSource: "Partner", utmSource: "", utmCampaign: "",
    yachtwayDbId: "83110", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "Superyacht Broker",
    sessions_30d: 61, listingViewsToDate: 0, buyerIntentScore: 0,
    lastLoginAt: "2026-07-14", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
  {
    id: "con_1004", vertical: "Main", companyId: "acc_04",
    firstName: "Marcus", lastName: "Bell",
    email: "marcus.bell@alliedmarine.com", phone: "(954) 555-0234",
    contactType: "Broker", lifecycleStage: "Customer",
    leadSource: "Partner", utmSource: "", utmCampaign: "",
    yachtwayDbId: "86402", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "Yacht Sales Consultant",
    sessions_30d: 2, listingViewsToDate: 0, buyerIntentScore: 0,
    lastLoginAt: "2026-06-28", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
  {
    id: "con_1005", vertical: "Main", companyId: "acc_05",
    firstName: "Ingrid", lastName: "Vos",
    email: "ingrid.vos@northstarshipyard.nl", phone: "+31 6 20 11 04 55",
    contactType: "Broker", lifecycleStage: "Customer",
    leadSource: "Partner", utmSource: "", utmCampaign: "",
    yachtwayDbId: "82077", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "Commercial Director",
    sessions_30d: 11, listingViewsToDate: 0, buyerIntentScore: 0,
    lastLoginAt: "2026-07-06", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
  {
    id: "con_2001", vertical: "FinTech", companyId: null,
    firstName: "Daniel", lastName: "Okafor",
    email: "daniel.okafor@gmail.com", phone: "(305) 555-0311",
    contactType: "Buyer", lifecycleStage: "SQL",
    leadSource: "Organic Search", utmSource: "", utmCampaign: "",
    yachtwayDbId: "90411", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "",
    sessions_30d: 22, listingViewsToDate: 340, buyerIntentScore: 87,
    lastLoginAt: "2026-07-08", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
  {
    id: "con_2002", vertical: "FinTech", companyId: null,
    firstName: "Priya", lastName: "Anand",
    email: "priya.anand@outlook.com", phone: "+44 7700 900312",
    contactType: "Buyer", lifecycleStage: "MQL",
    leadSource: "Paid Social", utmSource: "", utmCampaign: "",
    yachtwayDbId: "90788", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "",
    sessions_30d: 14, listingViewsToDate: 190, buyerIntentScore: 68,
    lastLoginAt: "2026-07-02", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
  {
    id: "con_2003", vertical: "FinTech", companyId: null,
    firstName: "Robert", lastName: "Kessler",
    email: "rkessler@kesslerholdings.com", phone: "(206) 555-0288",
    contactType: "Buyer", lifecycleStage: "SQL",
    leadSource: "Referral (Dealer)", utmSource: "", utmCampaign: "",
    yachtwayDbId: "91205", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "",
    sessions_30d: 31, listingViewsToDate: 420, buyerIntentScore: 92,
    lastLoginAt: "2026-07-03", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
  {
    id: "con_2004", vertical: "FinTech", companyId: null,
    firstName: "Sophie", lastName: "Berger",
    email: "sophie.berger@bluewave.fr", phone: "+33 6 44 55 66 77",
    contactType: "Buyer", lifecycleStage: "MQL",
    leadSource: "Organic Search", utmSource: "", utmCampaign: "",
    yachtwayDbId: "91663", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "",
    sessions_30d: 4, listingViewsToDate: 48, buyerIntentScore: 29,
    lastLoginAt: "2026-07-06", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
  {
    id: "con_2005", vertical: "FinTech", companyId: null,
    firstName: "Marco", lastName: "Ricci",
    email: "marco.ricci@riccigroup.it", phone: "+39 340 555 0199",
    contactType: "Buyer", lifecycleStage: "SQL",
    leadSource: "Broker Invite", utmSource: "", utmCampaign: "",
    yachtwayDbId: "92014", sfContactId: "",
    brokerLicenseNumber: "", brokerLicenseState: "",
    roleAtDealership: "",
    sessions_30d: 18, listingViewsToDate: 260, buyerIntentScore: 81,
    lastLoginAt: "2026-07-07", avgResponseTimeHours: 0, studioSpendYtd: 0,
    loanApplicationId: null,
    nextStep: "", nextStepDate: "",
  },
);

// ---------- Excel: Listings ----------
LISTINGS.push(
  { id: "lst_30011", companyId: "acc_01", brokerContactId: "con_1001", brandId: "brd_azimut",
    model: "60 Flybridge", year: 2019, lengthFt: 60, priceUsd: 1295000,
    status: "Active", hullId: "YW-lst_30011", listedAt: "2026-05-27",
    listingUrl: "https://YachtWay.com/listings/YW-LST-30011",
    has_3d_tour: true, photoCount: 44,
    mediaQuality: "excellent", photoSetting: "onWater", hasVideo: true,
    descriptionLength: 74, priceHidden: false, featuresTotal: 40, featuresFilled: 32 },
  { id: "lst_30044", companyId: "acc_02", brokerContactId: "con_1002", brandId: "brd_sea_ray",
    model: "SLX 400", year: 2022, lengthFt: 40, priceUsd: 685000,
    status: "Active", hullId: "YW-lst_30044", listedAt: "2026-06-22",
    listingUrl: "https://YachtWay.com/listings/YW-LST-30044",
    has_3d_tour: false, photoCount: 31,
    mediaQuality: "good", photoSetting: "onWater", hasVideo: true,
    descriptionLength: 74, priceHidden: false, featuresTotal: 40, featuresFilled: 32 },
  { id: "lst_30090", companyId: "acc_03", brokerContactId: "con_1003", brandId: "brd_benetti",
    model: "Delfino 93", year: 2016, lengthFt: 93, priceUsd: 6950000,
    status: "Active", hullId: "YW-lst_30090", listedAt: "2026-05-14",
    listingUrl: "https://YachtWay.com/listings/YW-LST-30090",
    has_3d_tour: true, photoCount: 72,
    mediaQuality: "excellent", photoSetting: "onWater", hasVideo: true,
    descriptionLength: 74, priceHidden: false, featuresTotal: 40, featuresFilled: 32 },
  { id: "lst_30122", companyId: "acc_04", brokerContactId: "con_1004", brandId: "brd_ferretti",
    model: "780", year: 2020, lengthFt: 78, priceUsd: 4180000,
    status: "Active", hullId: "YW-lst_30122", listedAt: "2026-06-09",
    listingUrl: "https://YachtWay.com/listings/YW-LST-30122",
    has_3d_tour: false, photoCount: 29,
    mediaQuality: "good", photoSetting: "onWater", hasVideo: true,
    descriptionLength: 74, priceHidden: false, featuresTotal: 40, featuresFilled: 32 },
  { id: "lst_30188", companyId: "acc_05", brokerContactId: "con_1005", brandId: "brd_explorer",
    model: "112 Explorer", year: 2025, lengthFt: 112, priceUsd: 18500000,
    status: "Active", hullId: "YW-lst_30188", listedAt: "2026-07-05",
    listingUrl: "https://YachtWay.com/listings/YW-LST-30188",
    has_3d_tour: true, photoCount: 64,
    mediaQuality: "excellent", photoSetting: "onWater", hasVideo: true,
    descriptionLength: 74, priceHidden: false, featuresTotal: 40, featuresFilled: 32 },
);

// ---------- Excel: Opportunities (EasyFund + MasterCover + Studio) ----------
OPPORTUNITIES.push(
  { id: "opp_ef0011", name: "EasyFund \u2014 Daniel Okafor (Azimut 60)", pipeline: "EasyFund",
    stage: "Approved", amountUsd: 1035000, closeDate: "2026-08-30",
    owner: "Elena Duarte", companyId: "acc_01", contactId: "con_2001", listingId: "lst_30011",
    probability: 55, stageEnteredAt: "2026-07-10", lostReason: null, closeReason: "" },
  { id: "opp_ef0044", name: "EasyFund \u2014 Robert Kessler (Sea Ray SLX 400)", pipeline: "EasyFund",
    stage: "Partial Application", amountUsd: 560000, closeDate: "2026-08-15",
    owner: "Elena Duarte", companyId: "acc_02", contactId: "con_2003", listingId: "lst_30044",
    probability: 55, stageEnteredAt: "2026-07-09", lostReason: null, closeReason: "" },
  { id: "opp_ef0090", name: "EasyFund \u2014 Marco Ricci (Explorer new-build)", pipeline: "EasyFund",
    stage: "Still Shopping", amountUsd: 14000000, closeDate: "2027-01-31",
    owner: "Priya Shah", companyId: "acc_05", contactId: "con_2005", listingId: "lst_30188",
    probability: 55, stageEnteredAt: "2026-07-05", lostReason: null, closeReason: "" },
  { id: "opp_ef0122", name: "EasyFund \u2014 Sophie Berger (browsing)", pipeline: "EasyFund",
    stage: "Still Shopping", amountUsd: 380000, closeDate: "2026-09-30",
    owner: "Priya Shah", companyId: null, contactId: "con_2004", listingId: null,
    probability: 55, stageEnteredAt: "2026-07-08", lostReason: null, closeReason: "" },
  { id: "opp_ef0188", name: "EasyFund \u2014 Priya Anand (Benetti Delfino)", pipeline: "EasyFund",
    stage: "Loan Closed", amountUsd: 5200000, closeDate: "2026-07-08",
    owner: "Elena Duarte", companyId: "acc_03", contactId: "con_2002", listingId: "lst_30090",
    probability: 55, stageEnteredAt: "2026-07-08", lostReason: null, closeReason: "" },
  { id: "opp_mc0011", name: "MasterCover \u2014 Priya Anand (Benetti Delfino)", pipeline: "MasterCover",
    stage: "Application Complete", amountUsd: 48500, closeDate: "2026-07-15",
    owner: "Priya Shah", companyId: null, contactId: "con_2002", listingId: "lst_30090",
    probability: 50, stageEnteredAt: "2026-07-14", lostReason: null, closeReason: "" },
  { id: "opp_mc0044", name: "MasterCover \u2014 Marco Ricci (Explorer new-build)", pipeline: "MasterCover",
    stage: "Still Shopping", amountUsd: 142000, closeDate: "2027-02-01",
    owner: "Priya Shah", companyId: null, contactId: "con_2005", listingId: "lst_30188",
    probability: 50, stageEnteredAt: "2026-07-05", lostReason: null, closeReason: "" },
  { id: "opp_mc0090", name: "MasterCover \u2014 Daniel Okafor (Azimut 60)", pipeline: "MasterCover",
    stage: "New Lead", amountUsd: 12800, closeDate: "2026-08-20",
    owner: "Elena Duarte", companyId: null, contactId: "con_2001", listingId: "lst_30011",
    probability: 50, stageEnteredAt: "2026-07-05", lostReason: null, closeReason: "" },
  { id: "opp_mc0122", name: "MasterCover \u2014 Robert Kessler (Sea Ray SLX 400)", pipeline: "MasterCover",
    stage: "Contacted", amountUsd: 7400, closeDate: "2026-08-25",
    owner: "Elena Duarte", companyId: null, contactId: "con_2003", listingId: "lst_30044",
    probability: 50, stageEnteredAt: "2026-07-09", lostReason: null, closeReason: "" },
  { id: "opp_mc0188", name: "MasterCover \u2014 Sophie Berger (renewal lapse)", pipeline: "MasterCover",
    stage: "Closed", amountUsd: 3900, closeDate: "2026-07-01",
    owner: "Priya Shah", companyId: null, contactId: "con_2004", listingId: "",
    probability: 50, stageEnteredAt: "2026-07-01", lostReason: null, closeReason: "" },
  { id: "opp_st0011", name: "Studio \u2014 Marina Bay: Azimut 60 photo+3D", pipeline: "Studio",
    stage: "Content Delivered", amountUsd: 6800, closeDate: "2026-07-09",
    owner: "Nina Alvarez", companyId: "acc_01", contactId: "con_1001", listingId: "lst_30011",
    probability: 65, stageEnteredAt: "2026-06-24", lostReason: null, closeReason: "" },
  { id: "opp_st0044", name: "Studio \u2014 Edmiston: Benetti Delfino superyacht film", pipeline: "Studio",
    stage: "Studio Booked", amountUsd: 24500, closeDate: "2026-07-05",
    owner: "Nina Alvarez", companyId: "acc_03", contactId: "con_1003", listingId: "lst_30090",
    probability: 65, stageEnteredAt: "2026-07-03", lostReason: null, closeReason: "" },
  { id: "opp_st0090", name: "Studio \u2014 Northstar: 112 Explorer new-build reveal", pipeline: "Studio",
    stage: "Service Requested", amountUsd: 12000, closeDate: "2026-07-05",
    owner: "Tom Becker", companyId: "acc_05", contactId: "con_1005", listingId: "lst_30188",
    probability: 65, stageEnteredAt: "2026-07-06", lostReason: null, closeReason: "" },
  { id: "opp_st0122", name: "Studio \u2014 Pacific Coast: Sea Ray SLX 400 listing set", pipeline: "Studio",
    stage: "Shoot Complete", amountUsd: 3200, closeDate: "2026-07-09",
    owner: "Tom Becker", companyId: "acc_02", contactId: "con_1002", listingId: "lst_30044",
    probability: 65, stageEnteredAt: "2026-07-05", lostReason: null, closeReason: "" },
  { id: "opp_st0188", name: "Studio \u2014 Allied Marine: Ferretti 780 spotlight", pipeline: "Studio",
    stage: "Closed", amountUsd: 4200, closeDate: "2026-07-02",
    owner: "Nina Alvarez", companyId: "acc_04", contactId: "con_1004", listingId: "lst_30122",
    probability: 65, stageEnteredAt: "2026-06-28", lostReason: null, closeReason: "" },
);

// ---------- Excel: EasyFund → LoanApplications ----------
LOAN_APPLICATIONS.push(
  { id: "loan_opp_ef0011", contactId: "con_2001",
    yachtwayEasyfundExternalId: "PQ-88231",
    stage: "Approved", creditScore: "740-799",
    monthlyIncome: 22000, monthlyDebt: 20700,
    downPayment: 260000, estimatedQualification: 1035000,
    monthlyPaymentMin: 6138, monthlyPaymentMax: 7502,
    dobYear: 1980, coapplicant: true, bankCompanyId: null },
  { id: "loan_opp_ef0044", contactId: "con_2003",
    yachtwayEasyfundExternalId: "PQ-88760",
    stage: "Started", creditScore: "800+",
    monthlyIncome: 31000, monthlyDebt: 28000,
    downPayment: 125000, estimatedQualification: 560000,
    monthlyPaymentMin: 3789, monthlyPaymentMax: 4631,
    dobYear: 1980, coapplicant: false, bankCompanyId: null },
  { id: "loan_opp_ef0090", contactId: "con_2005",
    yachtwayEasyfundExternalId: "PQ-89102",
    stage: "Started", creditScore: "800+",
    monthlyIncome: 180000, monthlyDebt: 1400000,
    downPayment: 4500000, estimatedQualification: 14000000,
    monthlyPaymentMin: 70560, monthlyPaymentMax: 86240,
    dobYear: 1980, coapplicant: true, bankCompanyId: null },
  { id: "loan_opp_ef0122", contactId: "con_2004",
    yachtwayEasyfundExternalId: "PQ-89540",
    stage: "Started", creditScore: "700-739",
    monthlyIncome: 7800, monthlyDebt: 19000,
    downPayment: 80000, estimatedQualification: 380000,
    monthlyPaymentMin: 2664, monthlyPaymentMax: 3256,
    dobYear: 1980, coapplicant: true, bankCompanyId: null },
  { id: "loan_opp_ef0188", contactId: "con_2002",
    yachtwayEasyfundExternalId: "PQ-89880",
    stage: "Funded", creditScore: "800+",
    monthlyIncome: 95000, monthlyDebt: 520000,
    downPayment: 1750000, estimatedQualification: 5200000,
    monthlyPaymentMin: 31140, monthlyPaymentMax: 38060,
    dobYear: 1980, coapplicant: false, bankCompanyId: null },
);

// Reconcile activeListings for Excel-imported companies
for (const cmp of COMPANIES) {
  if (cmp.id.startsWith("acc_")) {
    cmp.activeListings = LISTINGS.filter(l => l.companyId === cmp.id && l.status === "Active").length;
  }
}




// ---- Catalog field backfill -------------------------------------------------
// Every field defined in the catalog schema that a sample record does not
// already carry gets a deterministic, plausible value so profile panels and
// edit dialogs render the full field set.
fillCatalogFields(COMPANIES, COMPANY_SECTIONS);
fillCatalogFields(CONTACTS, CONTACT_SECTIONS);
fillCatalogFields(LISTINGS, LISTING_SECTIONS);
fillCatalogFields(OPPORTUNITIES, OPPORTUNITY_SECTIONS);

// ==============================================================
// BRANDS (managed entity)
// ==============================================================
// Brands are a managed lookup, not free text. The catalogue is owned by the
// database (`brands` table); `syncBrandCatalog` replaces the in-memory seed
// with the live rows when the API is reachable, and admin/profile screens
// mutate through the helpers below so every view re-renders via `bump()`.

/** Replace the brand catalogue with rows loaded from the API. */
export function syncBrandCatalog(rows: Brand[]) {
  if (!rows.length) return;
  BRANDS.splice(0, BRANDS.length, ...rows);
  bump();
}

export function upsertBrand(input: Partial<Brand> & { name: string }): Brand {
  const existing = input.id ? BRANDS.find((b) => b.id === input.id) : undefined;
  if (existing) {
    Object.assign(existing, input);
    bump();
    return existing;
  }
  const brand: Brand = {
    id: input.id ?? `brd_${Date.now().toString(36)}`,
    name: input.name.trim(),
    manufacturerCountry: input.manufacturerCountry ?? "",
    tier: input.tier ?? "Premium",
    active: input.active ?? true,
  };
  BRANDS.push(brand);
  bump();
  return brand;
}

/** Toggle a single service (EasyFund, Studio, ...) on a company profile. */
export function setCompanyService(
  companyId: string,
  service: ServiceKey,
  active: boolean,
) {
  const company = COMPANIES.find((c) => c.id === companyId);
  if (!company) return;
  company.servicesUsed = { ...company.servicesUsed, [service]: active };
  bump();
}

export function setBrandActive(id: string, active: boolean) {

  const brand = BRANDS.find((b) => b.id === id);
  if (!brand) return;
  brand.active = active;
  bump();
}

export function deleteBrand(id: string) {
  const idx = BRANDS.findIndex((b) => b.id === id);
  if (idx >= 0) BRANDS.splice(idx, 1);
  for (let i = BRAND_REPRESENTATIONS.length - 1; i >= 0; i--) {
    if (BRAND_REPRESENTATIONS[i].brandId === id) BRAND_REPRESENTATIONS.splice(i, 1);
  }
  bump();
}

/** Replace the brands a dealer / shipyard / brokerage represents. */
export function setCompanyBrands(
  companyId: string,
  entries: { brandId: string; exclusive: boolean }[],
) {
  for (let i = BRAND_REPRESENTATIONS.length - 1; i >= 0; i--) {
    if (BRAND_REPRESENTATIONS[i].companyId === companyId) BRAND_REPRESENTATIONS.splice(i, 1);
  }
  for (const e of entries) BRAND_REPRESENTATIONS.push({ companyId, ...e });
  bump();
}

/** Companies (dealers / shipyards / brokerages) representing a brand. */
export function companiesForBrand(brandId: string) {
  return BRAND_REPRESENTATIONS.filter((r) => r.brandId === brandId)
    .map((r) => getCompany(r.companyId))
    .filter((c): c is Company => !!c);
}

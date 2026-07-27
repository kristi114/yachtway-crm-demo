import { z } from "zod";
import { IdSchema } from "./common.js";

/**
 * Phase 5 — dealer (Company) roll-up formulas.
 *
 * The field catalog marks a set of Company fields as "Derived / computed —
 * read-only". Several are genuine roll-up summaries over the dealer's `listings`
 * (vessels) — they should be the live aggregate of the underlying rows, not a
 * value hand-entered or blindly trusted from the platform feed. This module is
 * the single source of truth for those formulas (mirrors the DEFAULT_ROLE_GRANTS
 * / PIPELINE_SEED pattern): DEALER_ROLLUP_DEFS documents each field's meaning, and
 * the reporting API computes them from `listings` per dealer.
 *
 * Canonical example (from the catalog): listing_views_all_time = the cumulative
 * views for ALL vessels listed by that dealer, regardless of sale status.
 *
 * Only listing-derived roll-ups live here. Company fields sourced from external
 * systems (Amplitude web visits, Xero studio spend, Google Analytics spotlight)
 * are NOT roll-ups over CRM data and continue to arrive via the sync.
 */

export type RollupOp = "count" | "countWhere" | "sum" | "avg";

export interface DealerRollupDef {
  /** output field on DealerRollups */
  field: string;
  /** the Company catalog field this derives (snake_case) */
  companyField: string;
  label: string;
  op: RollupOp;
  /** the listings column aggregated (null for plain count) */
  listingColumn: string | null;
  /** human-readable formula, shown to Heigo / used as the spec */
  formula: string;
}

export const DEALER_ROLLUP_DEFS: DealerRollupDef[] = [
  {
    field: "listingsAllTime",
    companyField: "listings_all_time",
    label: "Listings (All Time)",
    op: "count",
    listingColumn: null,
    formula: "COUNT(listings WHERE company_id = dealer) — every listing ever, any status",
  },
  {
    field: "soldListings",
    companyField: "sold_listings",
    label: "Sold Listings",
    op: "countWhere",
    listingColumn: "sales_status~sold",
    formula: "COUNT(listings WHERE company_id = dealer AND sales_status ILIKE 'sold')",
  },
  {
    field: "activeListings",
    companyField: "total_active_listings",
    label: "Active Listings",
    op: "countWhere",
    listingColumn: "sales_status!~sold",
    formula: "listingsAllTime − soldListings (listings not in a sold status)",
  },
  {
    field: "listingsW3dTour",
    companyField: "listings_w_3d_tour",
    label: "Listings w/ 3D Tour",
    op: "countWhere",
    listingColumn: "has_3d_tour",
    formula: "COUNT(listings WHERE company_id = dealer AND has_3d_tour = true)",
  },
  {
    field: "listingViewsAllTime",
    companyField: "listing_views_all_time",
    label: "Listing Views (All Time)",
    op: "sum",
    listingColumn: "views_total",
    formula: "SUM(listings.views_total) over ALL of the dealer's listings, regardless of sale status",
  },
  {
    field: "listingViews30d",
    companyField: "listing_views_to_date",
    label: "Listing Views (30d)",
    op: "sum",
    listingColumn: "views_30d",
    formula: "SUM(listings.views_30d) over all the dealer's listings",
  },
  {
    field: "inquiriesAllTime",
    companyField: "number_of_inquiries",
    label: "Inquiries (All Time)",
    op: "sum",
    listingColumn: "inquiries_total",
    formula: "SUM(listings.inquiries_total) over all the dealer's listings",
  },
  {
    field: "liveStreamsDone",
    companyField: "live_streams_done",
    label: "Live Streams Done",
    op: "sum",
    listingColumn: "number_of_live_streams",
    formula: "SUM(listings.number_of_live_streams) over all the dealer's listings",
  },
  {
    field: "socialReachToDate",
    companyField: "social_reach_to_date",
    label: "Social Reach (To Date)",
    op: "sum",
    listingColumn: "social_reach",
    formula: "SUM(listings.social_reach) over all the dealer's listings",
  },
  {
    field: "avgListingPhotoCount",
    companyField: "avg_listing_photo_count",
    label: "Avg Listing Photo Count",
    op: "avg",
    listingColumn: "photo_count",
    formula: "AVG(listings.photo_count) over all the dealer's listings",
  },
];

/** Computed roll-up values for one dealer. */
export const DealerRollupsSchema = z.object({
  companyId: IdSchema,
  listingsAllTime: z.number().int().nonnegative(),
  soldListings: z.number().int().nonnegative(),
  activeListings: z.number().int().nonnegative(),
  listingsW3dTour: z.number().int().nonnegative(),
  listingViewsAllTime: z.number().nonnegative(),
  listingViews30d: z.number().nonnegative(),
  inquiriesAllTime: z.number().nonnegative(),
  liveStreamsDone: z.number().nonnegative(),
  socialReachToDate: z.number().nonnegative(),
  /** null when the dealer has no listings (avoid a misleading 0) */
  avgListingPhotoCount: z.number().nonnegative().nullable(),
});
export type DealerRollups = z.infer<typeof DealerRollupsSchema>;

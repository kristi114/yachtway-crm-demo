import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Phase 5 dealer roll-ups: derived Company fields computed live from listings.
 * The key assertion is the catalog rule — listing_views_all_time sums views
 * across ALL of the dealer's listings regardless of sale status (the sold vessel
 * still counts). Requires the local DB. Excluded from the default unit suite.
 */
const app = createApp();

const CO = "itest_rollup_dealer";
const L_ACTIVE = "itest_rollup_l_active";
const L_SOLD = "itest_rollup_l_sold";
const L_ACTIVE2 = "itest_rollup_l_active2";

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`
      INSERT INTO companies (id, name, created_at, updated_at)
      VALUES (${CO}, 'Rollup Dealer', now(), now())
      ON CONFLICT (id) DO NOTHING`;
    // two active + one SOLD listing; views 100 + 250 + 900 = 1250 all-time
    await tx.$executeRaw`
      INSERT INTO listings (id, company_id, sales_status, views_total, views_30d, inquiries_total, number_of_live_streams, social_reach, photo_count, has_3d_tour, created_at, updated_at)
      VALUES
        (${L_ACTIVE},  ${CO}, 'Active', 100, 10, 3, 1, 5000,  20, true,  now(), now()),
        (${L_ACTIVE2}, ${CO}, 'Active', 250, 40, 7, 0, 12000, 30, false, now(), now()),
        (${L_SOLD},    ${CO}, 'Sold',   900, 0,  9, 2, 30000, 10, true,  now(), now())
      ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM listings WHERE id IN (${L_ACTIVE}, ${L_ACTIVE2}, ${L_SOLD})`;
    await tx.$executeRaw`DELETE FROM companies WHERE id = ${CO}`;
  });
  await prisma.$disconnect();
});

describe("Dealer roll-ups (HTTP)", () => {
  it("unauthenticated gets 401", async () => {
    await request(app).get(`/reports/dealers/${CO}/rollups`).expect(401);
  });

  it("404 for an unknown company", async () => {
    await request(app).get(`/reports/dealers/does_not_exist/rollups`).set("x-crm-role", "SALES_REP").expect(404);
  });

  it("listing_views_all_time sums across ALL listings incl. the sold one", async () => {
    const res = await request(app).get(`/reports/dealers/${CO}/rollups`).set("x-crm-role", "SALES_REP").expect(200);
    expect(res.body.listingViewsAllTime).toBe(1250); // 100 + 250 + 900 (sold included)
    expect(res.body.listingsAllTime).toBe(3);
    expect(res.body.soldListings).toBe(1);
    expect(res.body.activeListings).toBe(2);
    expect(res.body.listingsW3dTour).toBe(2);
    expect(res.body.listingViews30d).toBe(50); // 10 + 40 + 0
    expect(res.body.inquiriesAllTime).toBe(19); // 3 + 7 + 9
    expect(res.body.liveStreamsDone).toBe(3); // 1 + 0 + 2
    expect(res.body.socialReachToDate).toBe(47000); // 5000 + 12000 + 30000
    expect(res.body.avgListingPhotoCount).toBeCloseTo(20); // (20 + 30 + 10) / 3
  });
});

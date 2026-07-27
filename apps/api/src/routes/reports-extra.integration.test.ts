import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Phase 5 remaining reports: UTM attribution, EasyFund funnel (fintech-gated),
 * Studio revenue, dealer engagement. Requires the local DB + `pnpm db:setup`.
 * Excluded from the default unit suite.
 */
const app = createApp();

const GEN_OPP = "itest_x_gen";
const EF_OPP = "itest_x_ef";
const STU_OPP = "itest_x_studio";
const EF_LOAN = "itest_x_ef_loan";
const STU_DET = "itest_x_studio_det";
const CO_ENG = "itest_x_eng_co";
const C1 = "itest_x_c1";
const C2 = "itest_x_c2";

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    const dealers = await tx.pipeline.findUnique({
      where: { key: "dealers" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const easyfund = await tx.pipeline.findUnique({
      where: { key: "easyfund" },
      include: { stages: true },
    });
    const studio = await tx.pipeline.findUnique({
      where: { key: "studio" },
      include: { stages: true },
    });
    if (!dealers || !easyfund || !studio) throw new Error("run `pnpm db:setup` first");

    const dStage = dealers.stages[0]!;
    // outcome is on status now; place the EF opp on any stage and mark it Won
    const efStage = easyfund.stages.find((s) => s.key === "loan_closed") ?? easyfund.stages[0]!;
    const stuStage = studio.stages.find((s) => s.key === "studio_booked") ?? studio.stages[1]!;

    await tx.$executeRaw`
      INSERT INTO opportunities (id, name, pipeline_id, stage_id, opportunity_status, utm_source, utm_medium, opportunity_amount, created_at, updated_at)
      VALUES
        (${GEN_OPP}, 'Attr general', ${dealers.id}, ${dStage.id}, 'Open', 'meta', 'cpc', 500.00, now(), now()),
        (${EF_OPP}, 'Attr easyfund', ${easyfund.id}, ${efStage.id}, 'Won', 'referral', 'partner', 1000.00, now(), now()),
        (${STU_OPP}, 'Studio shoot', ${studio.id}, ${stuStage.id}, NULL, NULL, NULL, NULL, now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO easyfund_loans (id, opportunity_id, loan_amount, amount_from_lender, dealer_referral_bonus, created_at, updated_at)
      VALUES (${EF_LOAN}, ${EF_OPP}, 800.00, 750.00, 50.00, now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO studio_details (id, opportunity_id, amount_paid, at_boat_show, created_at, updated_at)
      VALUES (${STU_DET}, ${STU_OPP}, 1200.00, true, now(), now())
      ON CONFLICT (id) DO NOTHING`;

    await tx.$executeRaw`
      INSERT INTO companies (id, name, created_at, updated_at)
      VALUES (${CO_ENG}, 'Engagement Dealer', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO contacts (id, company_id, record_type, first_name, email, sessions_30d, logins_30d, total_logins, buyer_intent_score, created_at, updated_at)
      VALUES
        (${C1}, ${CO_ENG}, 'Broker', 'Ann', 'ann@eng.test', 10, 3, 50, 80, now(), now()),
        (${C2}, ${CO_ENG}, 'Broker', 'Bo',  'bo@eng.test',   5, 0, 20, 40, now(), now())
      ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM easyfund_loans WHERE id = ${EF_LOAN}`;
    await tx.$executeRaw`DELETE FROM studio_details WHERE id = ${STU_DET}`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id IN (${GEN_OPP}, ${EF_OPP}, ${STU_OPP})`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id IN (${C1}, ${C2})`;
    await tx.$executeRaw`DELETE FROM companies WHERE id = ${CO_ENG}`;
  });
  await prisma.$disconnect();
});

describe("UTM attribution", () => {
  it("SALES_REP sees the general source but not the EasyFund one", async () => {
    const res = await request(app).get("/reports/attribution").set("x-crm-role", "SALES_REP").expect(200);
    const sources = res.body.data.map((r: { source: string }) => r.source);
    expect(sources).toContain("meta");
    expect(sources).not.toContain("referral"); // easyfund opp filtered out
  });

  it("ADMIN sees the EasyFund source with won value", async () => {
    const res = await request(app).get("/reports/attribution").set("x-crm-role", "ADMIN").expect(200);
    const referral = res.body.data.find((r: { source: string }) => r.source === "referral");
    expect(referral).toBeTruthy();
    expect(referral.wonCount).toBeGreaterThanOrEqual(1); // Loan Closed is a won stage
    expect(referral.wonValue).toBeGreaterThanOrEqual(1000);
  });
});

describe("EasyFund funnel (fintech-scoped)", () => {
  it("SALES_REP is blocked (403)", async () => {
    await request(app).get("/reports/easyfund-funnel").set("x-crm-role", "SALES_REP").expect(403);
  });

  it("FINTECH sees the funnel with loan amounts", async () => {
    const res = await request(app).get("/reports/easyfund-funnel").set("x-crm-role", "FINTECH").expect(200);
    expect(res.body.totalReferrals).toBeGreaterThanOrEqual(1);
    expect(res.body.closedReferrals).toBeGreaterThanOrEqual(1);
    expect(res.body.closedAmount).toBeGreaterThanOrEqual(750);
    expect(res.body.dealerReferralBonusTotal).toBeGreaterThanOrEqual(50);
    const loanClosed = res.body.stages.find((s: { key: string }) => s.key === "loan_closed");
    expect(loanClosed.amountFromLender).toBeGreaterThanOrEqual(750);
  });
});

describe("Studio revenue", () => {
  it("reports bookings + collected revenue", async () => {
    const res = await request(app).get("/reports/studio").set("x-crm-role", "ADMIN").expect(200);
    expect(res.body.bookings).toBeGreaterThanOrEqual(1);
    expect(res.body.revenueCollected).toBeGreaterThanOrEqual(1200);
    expect(res.body.atBoatShowCount).toBeGreaterThanOrEqual(1);
  });
});

describe("Dealer engagement", () => {
  it("rolls up contact engagement for the dealer", async () => {
    const res = await request(app)
      .get(`/reports/dealers/${CO_ENG}/engagement`)
      .set("x-crm-role", "SALES_REP")
      .expect(200);
    expect(res.body.contactCount).toBe(2);
    expect(res.body.activeContacts30d).toBe(1); // only Ann has logins_30d > 0
    expect(res.body.totalSessions30d).toBe(15); // 10 + 5
    expect(res.body.totalLogins).toBe(70); // 50 + 20
    expect(res.body.avgBuyerIntentScore).toBeCloseTo(60); // (80 + 40) / 2
  });
});

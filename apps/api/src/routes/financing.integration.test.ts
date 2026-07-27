import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * The isolation proof over HTTP: a Sales Rep can read the contact but is blocked
 * (403) from its EasyFund application, while Fintech/Admin see it. Full stack:
 * dev auth -> authorize(easyfund) -> withRole -> RLS. Requires the local DB and
 * `pnpm db:setup`. Excluded from the default unit suite.
 */
const app = createApp();

const CONTACT_ID = "itest_fin_contact";
const OPP_ID = "itest_fin_opp";
const EF_ID = "itest_fin_ef";

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`
      INSERT INTO contacts (id, record_type, first_name, email, created_at, updated_at)
      VALUES (${CONTACT_ID}, 'Buyer', 'Fin', 'fin@example.com', now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO opportunities (id, name, contact_id, created_at, updated_at)
      VALUES (${OPP_ID}, 'Financing opp', ${CONTACT_ID}, now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO easyfund_loans (id, opportunity_id, credit_score, monthly_income, created_at, updated_at)
      VALUES (${EF_ID}, ${OPP_ID}, 780, 18500.00, now(), now())
      ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM easyfund_loans WHERE id = ${EF_ID}`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id = ${OPP_ID}`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CONTACT_ID}`;
  });
  await prisma.$disconnect();
});

describe("EasyFund sub-resource (HTTP isolation)", () => {
  it("SALES_REP can read the contact (general)", async () => {
    await request(app).get(`/contacts/${CONTACT_ID}`).set("x-crm-role", "SALES_REP").expect(200);
  });

  it("SALES_REP is blocked (403) from the contact's EasyFund application", async () => {
    await request(app)
      .get(`/contacts/${CONTACT_ID}/easyfund`)
      .set("x-crm-role", "SALES_REP")
      .expect(403);
  });

  it("SALES_REP is blocked (403) from the EasyFund record directly", async () => {
    await request(app).get(`/easyfund/${EF_ID}`).set("x-crm-role", "SALES_REP").expect(403);
  });

  it("FINTECH can read the EasyFund record", async () => {
    const res = await request(app).get(`/easyfund/${EF_ID}`).set("x-crm-role", "FINTECH").expect(200);
    expect(res.body.id).toBe(EF_ID);
    // credit_score is numeric (Decimal) since the easyfund_credit_fields migration;
    // Prisma serializes it as its string form.
    expect(res.body.creditScore).toBe("780");
  });

  it("FINTECH sees the contact's financing via the sub-resource", async () => {
    const res = await request(app)
      .get(`/contacts/${CONTACT_ID}/easyfund`)
      .set("x-crm-role", "FINTECH")
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(EF_ID);
  });

  it("unauthenticated gets 401", async () => {
    await request(app).get(`/easyfund/${EF_ID}`).expect(401);
  });
});

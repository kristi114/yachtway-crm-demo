import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * MasterCover isolation over HTTP — same proof as EasyFund, on the `mastercover`
 * grant. Requires the local DB and `pnpm db:setup`. Excluded from the default
 * unit suite.
 */
const app = createApp();

const CONTACT_ID = "itest_mc_contact";
const OPP_ID = "itest_mc_opp";
const MC_ID = "itest_mc_app";

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`
      INSERT INTO contacts (id, record_type, first_name, email, created_at, updated_at)
      VALUES (${CONTACT_ID}, 'Buyer', 'Mc', 'mc@example.com', now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO opportunities (id, name, contact_id, created_at, updated_at)
      VALUES (${OPP_ID}, 'Insurance opp', ${CONTACT_ID}, now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO mastercover_applications (id, opportunity_id, policy_status, vessel_name, created_at, updated_at)
      VALUES (${MC_ID}, ${OPP_ID}, 'Policy Current', 'S/Y Test', now(), now())
      ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM mastercover_applications WHERE id = ${MC_ID}`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id = ${OPP_ID}`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CONTACT_ID}`;
  });
  await prisma.$disconnect();
});

describe("MasterCover sub-resource (HTTP isolation)", () => {
  it("SALES_REP can read the contact but is blocked (403) from its MasterCover", async () => {
    await request(app).get(`/contacts/${CONTACT_ID}`).set("x-crm-role", "SALES_REP").expect(200);
    await request(app)
      .get(`/contacts/${CONTACT_ID}/mastercover`)
      .set("x-crm-role", "SALES_REP")
      .expect(403);
  });

  it("MARKETING is blocked (403) from the MasterCover record", async () => {
    await request(app).get(`/mastercover/${MC_ID}`).set("x-crm-role", "MARKETING").expect(403);
  });

  it("FINTECH can read the MasterCover record", async () => {
    const res = await request(app)
      .get(`/mastercover/${MC_ID}`)
      .set("x-crm-role", "FINTECH")
      .expect(200);
    expect(res.body.id).toBe(MC_ID);
    expect(res.body.policyStatus).toBe("Policy Current");
  });

  it("ADMIN sees the contact's insurance via the sub-resource", async () => {
    const res = await request(app)
      .get(`/contacts/${CONTACT_ID}/mastercover`)
      .set("x-crm-role", "ADMIN")
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(MC_ID);
  });

  it("unauthenticated gets 401", async () => {
    await request(app).get(`/mastercover/${MC_ID}`).expect(401);
  });
});

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Brands reference/picklist (build-plan item 5): readable by any authenticated
 * user, ADMIN-managed writes (RLS-backed), case-insensitive dedupe, soft
 * deactivate. Requires the local DB with the brands_namekey_sort migration +
 * policies. Excluded from the unit suite.
 */
const app = createApp();

const SEED = [
  { id: "itest_brand_a", name: "Sea Ray", nameKey: "sea ray", sortOrder: 0 },
  { id: "itest_brand_b", name: "Beneteau", nameKey: "beneteau", sortOrder: 1 },
];
let createdId = "";

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    for (const b of SEED) {
      await tx.brand.upsert({
        where: { id: b.id },
        create: { ...b, active: true },
        update: { active: true, sortOrder: b.sortOrder },
      });
    }
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM brands WHERE id IN (${SEED[0]!.id}, ${SEED[1]!.id}) OR name_key = 'azimut'`;
  });
  await prisma.$disconnect();
});

describe("Brands (HTTP)", () => {
  it("unauthenticated gets 401", async () => {
    await request(app).get("/brands").expect(401);
  });

  it("any authenticated role can read the picklist", async () => {
    const res = await request(app).get("/brands").set("x-crm-role", "SALES_REP").expect(200);
    const names = res.body.data.map((b: { name: string }) => b.name);
    expect(names).toEqual(expect.arrayContaining(["Sea Ray", "Beneteau"]));
  });

  it("a non-admin cannot create a brand (403)", async () => {
    await request(app)
      .post("/brands")
      .set("x-crm-role", "SALES_REP")
      .send({ name: "Azimut" })
      .expect(403);
  });

  it("ADMIN creates a brand", async () => {
    const res = await request(app)
      .post("/brands")
      .set("x-crm-role", "ADMIN")
      .send({ name: "Azimut", sortOrder: 2 })
      .expect(201);
    expect(res.body.name).toBe("Azimut");
    createdId = res.body.id;
  });

  it("rejects a case-insensitive duplicate (409)", async () => {
    await request(app)
      .post("/brands")
      .set("x-crm-role", "ADMIN")
      .send({ name: "  azimut " })
      .expect(409);
  });

  it("ADMIN can soft-deactivate; it drops from the default list but shows with includeInactive", async () => {
    await request(app)
      .patch(`/brands/${createdId}`)
      .set("x-crm-role", "ADMIN")
      .send({ active: false })
      .expect(200);

    const active = await request(app).get("/brands").set("x-crm-role", "SALES_REP").expect(200);
    expect(active.body.data.map((b: { id: string }) => b.id)).not.toContain(createdId);

    const all = await request(app)
      .get("/brands?includeInactive=true")
      .set("x-crm-role", "ADMIN")
      .expect(200);
    expect(all.body.data.map((b: { id: string }) => b.id)).toContain(createdId);
  });
});

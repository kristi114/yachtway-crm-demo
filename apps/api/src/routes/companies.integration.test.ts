import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Exercises the companies CRUD over HTTP through the full stack: dev auth shim
 * -> authorize (grant check) -> withRole -> RLS. Requires the local Postgres up
 * and `pnpm db:setup` run. Excluded from the default unit suite.
 */
const app = createApp();
const created: string[] = [];

afterAll(async () => {
  if (created.length) {
    await withRole("ADMIN", (tx) => tx.company.deleteMany({ where: { id: { in: created } } }));
  }
  await prisma.$disconnect();
});

describe("companies CRUD (HTTP + authorize + RLS)", () => {
  it("rejects an unauthenticated request (no role header) with 401", async () => {
    await request(app).get("/companies").expect(401);
  });

  it("lets SALES_REP create then read back a company", async () => {
    const create = await request(app)
      .post("/companies")
      .set("x-crm-role", "SALES_REP")
      .send({ name: "Test Marine Co", companyType: "Dealer" })
      .expect(201);
    expect(create.body.id).toBeTruthy();
    expect(create.body.name).toBe("Test Marine Co");
    created.push(create.body.id);

    const detail = await request(app)
      .get(`/companies/${create.body.id}`)
      .set("x-crm-role", "SALES_REP")
      .expect(200);
    expect(detail.body.companyType).toBe("Dealer");
  });

  it("forbids MARKETING from creating (read-only on company.general) with 403", async () => {
    await request(app)
      .post("/companies")
      .set("x-crm-role", "MARKETING")
      .send({ name: "Should Not Persist" })
      .expect(403);
  });

  it("returns a list envelope for an authorized role", async () => {
    const res = await request(app).get("/companies").set("x-crm-role", "ADMIN").expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty("nextCursor");
  });

  it("rejects an invalid body with 400 (validation_error)", async () => {
    const res = await request(app)
      .post("/companies")
      .set("x-crm-role", "SALES_REP")
      .send({ companyEmail: "not-an-email" })
      .expect(400);
    expect(res.body.error).toBe("validation_error");
  });
});

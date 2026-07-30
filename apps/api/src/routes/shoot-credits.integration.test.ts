import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Accounting A4 exit proof: studio listing-shoot credits (non-monetary ledger).
 * Granting +n and consuming -1 roll the dealer's balance; over-consumption is
 * rejected; the ledger + the ADMIN Accounting `shoot-credits` tab surface entries.
 * Requires the local DB + db:setup.
 */
const app = createApp();

const DEALER = "itest_sc_dealer";
const rep = { "x-crm-role": "SALES_REP", "x-crm-user-id": "itest_sc_rep" };
const admin = { "x-crm-role": "ADMIN", "x-crm-user-id": "itest_sc_admin" };

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`INSERT INTO companies (id, name, created_at, updated_at) VALUES (${DEALER}, 'Shoot Dealer', now(), now()) ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM audit_logs WHERE table_name = 'studio_shoot_credits' AND record_id = ${DEALER}`;
    await tx.$executeRaw`DELETE FROM studio_shoot_credits WHERE company_id = ${DEALER}`;
    await tx.$executeRaw`DELETE FROM companies WHERE id = ${DEALER}`;
  });
  await prisma.$disconnect();
});

describe("Accounting A4 — studio shoot credits", () => {
  it("granting credits rolls the dealer balance", async () => {
    const res = await request(app).post(`/companies/${DEALER}/shoot-credits`).set(rep).send({ delta: 3, reason: "loyalty promo" });
    expect(res.status).toBe(201);
    expect(res.body.remaining).toBe(3);

    const bal = await request(app).get(`/companies/${DEALER}/shoot-credits`).set(rep).expect(200);
    expect(bal.body.balance.earned).toBe(3);
    expect(bal.body.balance.remaining).toBe(3);
    expect(bal.body.ledger.length).toBeGreaterThanOrEqual(1);
  });

  it("consuming a credit decrements remaining", async () => {
    const res = await request(app).post(`/companies/${DEALER}/shoot-credits`).set(rep).send({ delta: -1, reason: "shoot booked" });
    expect(res.status).toBe(201);
    expect(res.body.remaining).toBe(2);
  });

  it("over-consuming is rejected (409)", async () => {
    const res = await request(app).post(`/companies/${DEALER}/shoot-credits`).set(rep).send({ delta: -5, reason: "oops" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("insufficient_shoot_credits");
  });

  it("the ADMIN Accounting shoot-credits tab surfaces the ledger", async () => {
    const res = await request(app).get(`/accounting/shoot-credits`).set(admin).expect(200);
    const mine = (res.body.data as { companyId: string; kind: string; amount: number }[]).filter((r) => r.companyId === DEALER);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.some((r) => r.kind === "credit_granted")).toBe(true);
    expect(mine.some((r) => r.kind === "credit_consumed")).toBe(true);
  });
});

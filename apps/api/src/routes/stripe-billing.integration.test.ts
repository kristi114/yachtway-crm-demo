import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_itest";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_itest";
  process.env.STRIPE_BASE_URL = "https://api.stripe.test";
  return { whsec: "whsec_itest" };
});

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Phase X-Stripe exit proof: a Stripe-toggled invoice opens a Checkout link on
 * approval; the checkout.session.completed webhook marks it paid + records a
 * stripe-source Payment; a subscription webhook mirrors a Subscription row; and
 * the ADMIN Accounting view shows the payment with source=stripe (rep 403).
 * Requires the local DB + X0/Stripe migrations + INTEGRATION grants.
 */
const app = createApp();

const CO = "itest_st_co";
const CT = "itest_st_ct";
const OPP = "itest_st_opp";
const rep = { "x-crm-role": "SALES_REP", "x-crm-user-id": "itest_st_rep" };
const admin = { "x-crm-role": "ADMIN", "x-crm-user-id": "itest_st_admin" };

let fetchMock: ReturnType<typeof vi.fn>;
const sign = (raw: string) => {
  const ts = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", H.whsec).update(`${ts}.${raw}`, "utf8").digest("hex");
  return `t=${ts},v1=${v1}`;
};
const postEvent = (event: object) => {
  const raw = JSON.stringify(event);
  return request(app).post("/webhooks/stripe").set("Content-Type", "application/json").set("stripe-signature", sign(raw)).send(raw);
};

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

beforeAll(async () => {
  const role = await prisma.role.upsert({ where: { key: "INTEGRATION" }, update: { isActive: true }, create: { key: "INTEGRATION", name: "Integration" } });
  for (const g of SYSTEM_ROLE_GRANTS.INTEGRATION) {
    await prisma.permissionGrant.upsert({
      where: { roleId_resourceClass: { roleId: role.id, resourceClass: g.resource } },
      update: { canRead: g.read, canWrite: g.write },
      create: { roleId: role.id, resourceClass: g.resource, canRead: g.read, canWrite: g.write },
    });
  }
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`INSERT INTO companies (id, name, company_email, stripe_customer_id, created_at, updated_at)
      VALUES (${CO}, 'Stripe Dealer', 'billing@stripe.test', 'cus_1', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO contacts (id, company_id, first_name, email, created_at, updated_at)
      VALUES (${CT}, ${CO}, 'Stan', 'stan@stripe.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO opportunities (id, name, contact_id, opportunity_amount, created_at, updated_at)
      VALUES (${OPP}, 'Stripe deal', ${CT}, 100.00, now(), now()) ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM audit_logs WHERE table_name = 'invoices' AND record_id IN (SELECT id FROM invoices WHERE opportunity_id = ${OPP})`;
    await tx.$executeRaw`DELETE FROM payments WHERE company_id = ${CO}`;
    await tx.$executeRaw`DELETE FROM invoices WHERE opportunity_id = ${OPP}`;
    await tx.$executeRaw`DELETE FROM subscriptions WHERE stripe_subscription_id = 'sub_1'`;
    await tx.$executeRaw`DELETE FROM messages WHERE message_type = 'invoice' AND company_id = ${CO}`;
    // Scoped to THIS suite's event ids. An unqualified
    // `DELETE ... WHERE provider = 'stripe'` would wipe the whole Stripe
    // idempotency ledger — harmless locally, but it destroyed the live one on
    // 2026-08-01 when the suite was pointed at prod by a stale DATABASE_URL.
    await tx.$executeRaw`DELETE FROM webhook_events WHERE provider = 'stripe' AND external_id IN ('evt_pay_1', 'evt_sub_1')`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id = ${OPP}`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CT}`;
    await tx.$executeRaw`DELETE FROM companies WHERE id = ${CO}`;
  });
  await prisma.$disconnect();
});

describe("Stripe billing rail + Accounting (HTTP)", () => {
  let invoiceId = "";

  it("a Stripe-toggled invoice: approve is CRM-native, send opens the Checkout link", async () => {
    const created = await request(app).post(`/opportunities/${OPP}/invoice`).set(rep).send({ invoiceType: "other", amount: 100, billingProvider: "stripe" });
    expect(created.status).toBe(201);
    invoiceId = created.body.invoiceId;

    // Approve no longer touches Stripe — it just finalizes the invoice.
    const appr = await request(app).post(`/invoices/${invoiceId}/approve`).set(rep).send({});
    expect(appr.status).toBe(200);
    expect(appr.body.status).toBe("approved");

    // Send opens the Stripe pay link and marks the invoice sent.
    const sent = await request(app).post(`/invoices/${invoiceId}/send`).set(rep).send({});
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("sent");
    expect(sent.body.payLinkUrl).toBe("https://checkout.stripe.test/cs_1");
    expect(fetchMock).toHaveBeenCalled(); // the Stripe Checkout API call
  });

  it("checkout.session.completed marks the invoice paid + records a stripe payment", async () => {
    const res = await postEvent({
      id: "evt_pay_1",
      type: "checkout.session.completed",
      data: { object: { mode: "payment", payment_status: "paid", amount_total: 10000, payment_intent: "pi_1", metadata: { crm_invoice_id: invoiceId } } },
    });
    expect(res.status).toBe(200);
    const inv = await withRole("ADMIN", (tx) => tx.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } }));
    expect(inv?.status).toBe("paid");
    expect(inv?.payments[0]?.billingProvider).toBe("stripe");
    expect(Number(inv?.payments[0]?.amount)).toBe(100);
  });

  it("a subscription webhook mirrors a Subscription row", async () => {
    const res = await postEvent({
      id: "evt_sub_1",
      type: "customer.subscription.created",
      data: { object: { id: "sub_1", customer: "cus_1", status: "active", currency: "usd", current_period_end: 1893456000, items: { data: [{ quantity: 2, price: { id: "price_1", unit_amount: 5000, nickname: "EasySign" } }] } } },
    });
    expect(res.status).toBe(200);
    const sub = await withRole("ADMIN", (tx) => tx.subscription.findUnique({ where: { stripeSubscriptionId: "sub_1" } }));
    expect(sub?.companyId).toBe(CO);
    expect(sub?.seats).toBe(2);
    expect(Number(sub?.mrr)).toBe(100);
    expect(sub?.status).toBe("active");
  });

  it("Accounting/collected shows the stripe payment with source=stripe (ADMIN); rep is 403", async () => {
    await request(app).get(`/accounting/collected`).set(rep).expect(403);
    const res = await request(app).get(`/accounting/collected`).set(admin).expect(200);
    const row = (res.body.data as { source: string; amount: number; companyId: string }[]).find((r) => r.companyId === CO);
    expect(row?.source).toBe("stripe");
    expect(row?.amount).toBe(100);
  });
});

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Configure Stripe + Mailgun BEFORE the app (env.ts) loads. vi.hoisted runs first.
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_a1";
  process.env.STRIPE_BASE_URL = "https://api.stripe.test";
  process.env.MAILGUN_API_KEY = "key-a1";
  process.env.MAILGUN_DOMAIN = "mg.yachtway.test";
  process.env.MAILGUN_BASE_URL = "https://api.mailgun.test";
});

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Accounting A1 exit proof (CRM-native, no Xero): a dealer subscription invoice is
 * drafted → approved (CRM-native, no external create) → sent (Stripe pay link +
 * emailed via Mailgun) → a manual bank payment is recorded and flips it `paid`.
 * A rep still can't create a financing invoice. Requires the local DB + db:setup.
 */
const app = createApp();

const CO = "itest_a1_co";
const CT = "itest_a1_ct";
const OPP = "itest_a1_opp";
const LENDER = "itest_a1_lender";
const EF_OPP = "itest_a1_ef_opp";

const rep = { "x-crm-role": "SALES_REP", "x-crm-user-id": "itest_a1_rep" };
let easyfund: { id: string; firstStageId: string };
let fetchMock: ReturnType<typeof vi.fn>;
const jsonRes = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

beforeEach(() => {
  // Route Stripe checkout + Mailgun send calls.
  fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/v1/checkout/sessions")) return jsonRes({ id: "cs_a1", url: "https://checkout.stripe.test/cs_a1" });
    if (u.includes("/messages")) return jsonRes({ id: "<mg-a1>", message: "Queued. Thank you." });
    return jsonRes({});
  });
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
    const ef = await tx.pipeline.findUnique({ where: { key: "easyfund" }, include: { stages: { orderBy: { position: "asc" } } } });
    if (!ef) throw new Error("run `pnpm db:setup` before integration tests");
    easyfund = { id: ef.id, firstStageId: ef.stages[0]!.id };

    await tx.$executeRaw`INSERT INTO companies (id, name, company_email, billing_street, billing_city, created_at, updated_at)
      VALUES (${CO}, 'Azimut Dealer', 'billing@azimut.test', '1 Dock Rd', 'Miami', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO contacts (id, company_id, first_name, email, created_at, updated_at)
      VALUES (${CT}, ${CO}, 'Paolo', 'paolo@azimut.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO opportunities (id, name, contact_id, opportunity_amount, created_at, updated_at)
      VALUES (${OPP}, 'Azimut subscription', ${CT}, 1200.00, now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO companies (id, name, created_at, updated_at) VALUES (${LENDER}, 'Acme Lender', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO opportunities (id, name, contact_id, pipeline_id, stage_id, created_at, updated_at)
      VALUES (${EF_OPP}, 'Loan referral', ${CT}, ${easyfund.id}, ${easyfund.firstStageId}, now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO easyfund_loans (id, opportunity_id, lender_id, amount_from_lender, created_at, updated_at)
      VALUES ('itest_a1_ef_loan', ${EF_OPP}, ${LENDER}, 500.00, now(), now()) ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE opportunity_id IN (${OPP}, ${EF_OPP}))`;
    await tx.$executeRaw`DELETE FROM audit_logs WHERE table_name = 'invoices' AND record_id IN (SELECT id FROM invoices WHERE opportunity_id IN (${OPP}, ${EF_OPP}))`;
    await tx.$executeRaw`DELETE FROM invoices WHERE opportunity_id IN (${OPP}, ${EF_OPP})`;
    await tx.$executeRaw`DELETE FROM messages WHERE message_type = 'invoice' AND company_id IN (${CO}, ${LENDER})`;
    await tx.$executeRaw`DELETE FROM easyfund_loans WHERE opportunity_id = ${EF_OPP}`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id IN (${OPP}, ${EF_OPP})`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CT}`;
    await tx.$executeRaw`DELETE FROM companies WHERE id IN (${CO}, ${LENDER})`;
  });
  await prisma.$disconnect();
});

describe("Accounting A1 — invoice create / approve / send / record payment", () => {
  let invoiceId = "";

  it("rep creates a subscription draft — no external calls", async () => {
    const res = await request(app).post(`/opportunities/${OPP}/invoice`).set(rep).send({ invoiceType: "subscription", currency: "USD" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    invoiceId = res.body.invoiceId;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("approve finalizes the invoice as approved (CRM-native, no external create)", async () => {
    const res = await request(app).post(`/invoices/${invoiceId}/approve`).set(rep).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("send opens a Stripe pay link, emails the invoice, and marks it sent", async () => {
    const res = await request(app).post(`/invoices/${invoiceId}/send`).set(rep).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");
    expect(res.body.payLinkUrl).toBe("https://checkout.stripe.test/cs_a1");
    expect(res.body.emailed).toBe(true);
    // Both a Stripe checkout call and a Mailgun send happened.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/v1/checkout/sessions"))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/messages"))).toBe(true);

    const got = await request(app).get(`/invoices/${invoiceId}`).set(rep);
    expect(got.body.status).toBe("sent");
    expect(got.body.onlineInvoiceUrl).toBe("https://checkout.stripe.test/cs_a1");
  });

  it("recording a full manual bank payment flips the invoice to paid", async () => {
    const res = await request(app)
      .post(`/invoices/${invoiceId}/payments`)
      .set(rep)
      .send({ method: "bank_transfer", amount: 1200, reference: "wire-9931" });
    expect(res.status).toBe(201);
    expect(res.body.paid).toBe(true);

    const got = await request(app).get(`/invoices/${invoiceId}`).set(rep);
    expect(got.body.status).toBe("paid");
    expect(got.body.payments?.[0]?.method).toBe("bank_transfer");
  });

  it("a rep still cannot create a financing (easyfund) invoice — 403", async () => {
    await request(app).post(`/opportunities/${EF_OPP}/invoice`).set(rep).send({ invoiceType: "easyfund" }).expect(403);
  });
});

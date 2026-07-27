import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  process.env.MAKE_SCENARIO_A_URL = "https://hook.make.test/scenario-a";
  process.env.MAKE_OUTBOUND_SECRET = "itest-studio-out";
  process.env.MAKE_INBOUND_SECRET = "itest-studio-in";
  return { inbound: "itest-studio-in" };
});

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Phase X1b exit proof: Product catalog sync, studio line items (per-foot basis),
 * single- and multi-opportunity itemized invoices (same-bill-to aggregation +
 * mismatch guard), approval emitting ItemCode lines, and the callback writing
 * Xero-resolved per-line amounts back. Requires the local DB + `pnpm db:setup`.
 * Excluded from the unit suite.
 */
const app = createApp();

// Companies (two bill-to parties) + one contact each.
const CO = "itest_studio_co";
const CO2 = "itest_studio_co2";
const CT = "itest_studio_ct";
const CT2 = "itest_studio_ct2";
// Dedicated opps per case so invoiced-state never couples tests.
const OPP_SINGLE = "itest_studio_single"; // CO
const OPP_M1 = "itest_studio_m1"; // CO
const OPP_M2 = "itest_studio_m2"; // CO
const OPP_X1 = "itest_studio_x1"; // CO   (mismatch pair)
const OPP_X2 = "itest_studio_x2"; // CO2  (mismatch pair)

const rep = { "x-crm-role": "SALES_REP", "x-crm-user-id": "itest_studio_rep" };
let fetchMock: ReturnType<typeof vi.fn>;

const signInbound = (raw: string) => createHmac("sha256", H.inbound).update(raw, "utf8").digest("hex");

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

beforeAll(async () => {
  const role = await prisma.role.upsert({
    where: { key: "INTEGRATION" },
    update: { isActive: true },
    create: { key: "INTEGRATION", name: "Integration" },
  });
  for (const g of SYSTEM_ROLE_GRANTS.INTEGRATION) {
    await prisma.permissionGrant.upsert({
      where: { roleId_resourceClass: { roleId: role.id, resourceClass: g.resource } },
      update: { canRead: g.read, canWrite: g.write },
      create: { roleId: role.id, resourceClass: g.resource, canRead: g.read, canWrite: g.write },
    });
  }
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`INSERT INTO companies (id, name, company_email, created_at, updated_at)
      VALUES (${CO}, 'Sunseeker Dealer', 'ap@sunseeker.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO companies (id, name, company_email, created_at, updated_at)
      VALUES (${CO2}, 'Riva Dealer', 'ap@riva.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO contacts (id, company_id, first_name, last_name, email, created_at, updated_at)
      VALUES (${CT}, ${CO}, 'Ada', 'Byron', 'ada@sunseeker.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO contacts (id, company_id, first_name, last_name, email, created_at, updated_at)
      VALUES (${CT2}, ${CO2}, 'Beq', 'Rossi', 'beq@riva.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    const pairs: [string, string][] = [
      [OPP_SINGLE, CT], [OPP_M1, CT], [OPP_M2, CT], [OPP_X1, CT], [OPP_X2, CT2],
    ];
    for (const [id, ct] of pairs) {
      await tx.$executeRaw`INSERT INTO opportunities (id, name, contact_id, created_at, updated_at)
        VALUES (${id}, ${"Studio " + id}, ${ct}, now(), now()) ON CONFLICT (id) DO NOTHING`;
    }
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM audit_logs WHERE table_name = 'invoices' AND record_id IN (SELECT id FROM invoices WHERE opportunity_id IN (${OPP_SINGLE}, ${OPP_M1}, ${OPP_M2}, ${OPP_X1}, ${OPP_X2}))`;
    await tx.$executeRaw`DELETE FROM opportunity_line_items WHERE opportunity_id IN (${OPP_SINGLE}, ${OPP_M1}, ${OPP_M2}, ${OPP_X1}, ${OPP_X2})`;
    await tx.$executeRaw`DELETE FROM invoices WHERE opportunity_id IN (${OPP_SINGLE}, ${OPP_M1}, ${OPP_M2}, ${OPP_X1}, ${OPP_X2})`;
    await tx.$executeRaw`DELETE FROM messages WHERE message_type = 'invoice' AND company_id IN (${CO}, ${CO2})`;
    await tx.$executeRaw`DELETE FROM webhook_events WHERE provider = 'xero'`;
    await tx.$executeRaw`DELETE FROM products WHERE xero_item_id = 'XI-3D'`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id IN (${OPP_SINGLE}, ${OPP_M1}, ${OPP_M2}, ${OPP_X1}, ${OPP_X2})`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id IN (${CT}, ${CT2})`;
    await tx.$executeRaw`DELETE FROM companies WHERE id IN (${CO}, ${CO2})`;
  });
  await prisma.$disconnect();
});

describe("Studio itemized + multi-opp invoicing (HTTP)", () => {
  it("Product catalog sync upserts a product from a signed item event", async () => {
    const raw = JSON.stringify({ event_type: "item", xero_item_id: "XI-3D", code: "YW-MB-3D", name: "3D Tour - Member", unit_price: 25, account_code: "4000" });
    await request(app).post("/webhooks/xero").set("Content-Type", "application/json").set("x-make-signature", signInbound(raw)).send(raw).expect(200);
    const p = await withRole("ADMIN", (tx) => tx.product.findUnique({ where: { xeroItemId: "XI-3D" } }));
    expect(p?.quantityBasis).toBe("foot"); // YW-MB-3D is a per-foot code
  });

  it("adds a per-foot line item whose quantity = vessel length", async () => {
    const res = await request(app).post(`/opportunities/${OPP_SINGLE}/line-items`).set(rep).send({ productCode: "YW-MB-3D", vesselLengthFt: 40, unitPrice: 25 }).expect(201);
    expect(res.body.quantity).toBe(40);
  });

  it("creates a single-opp itemized studio draft (no emit)", async () => {
    const res = await request(app).post(`/opportunities/${OPP_SINGLE}/invoice`).set(rep).send({ invoiceType: "studio", currency: "USD" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("approval emits ItemCode lines; callback writes per-line amounts back", async () => {
    const inv = await withRole("ADMIN", (tx) => tx.invoice.findUnique({ where: { idempotencyKey: `studio:${OPP_SINGLE}` } }));
    const invoiceId = inv!.id;

    const appr = await request(app).post(`/invoices/${invoiceId}/approve`).set(rep).send({});
    expect(appr.status).toBe(200);
    const sentLines = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body).lines;
    expect(sentLines[0].item_code).toBe("YW-MB-3D");
    expect(sentLines[0].quantity).toBe(40);
    const crmLineId = sentLines[0].crm_line_id as string;

    const raw = JSON.stringify({ crm_invoice_id: invoiceId, status: "sent", xero_invoice_id: "XERO-STUDIO-1", lines: [{ crm_line_id: crmLineId, line_amount: 1000 }] });
    await request(app).post("/webhooks/xero").set("Content-Type", "application/json").set("x-make-signature", signInbound(raw)).send(raw).expect(200);

    const line = await withRole("ADMIN", (tx) => tx.opportunityLineItem.findUnique({ where: { id: crmLineId } }));
    expect(Number(line?.totalPrice)).toBe(1000);
  });

  it("aggregates multiple same-bill-to opps into one invoice", async () => {
    await request(app).post(`/opportunities/${OPP_M1}/line-items`).set(rep).send({ productCode: "YW-MB-SPOT", quantity: 1, unitPrice: 500 }).expect(201);
    await request(app).post(`/opportunities/${OPP_M2}/line-items`).set(rep).send({ productCode: "YW-MB-SPOT", quantity: 1, unitPrice: 500 }).expect(201);
    const res = await request(app).post(`/invoices`).set(rep).send({ opportunityIds: [OPP_M1, OPP_M2], currency: "USD" });
    expect(res.status).toBe(201);
    const lines = await withRole("ADMIN", (tx) => tx.opportunityLineItem.findMany({ where: { invoiceId: res.body.invoiceId } }));
    expect(lines.length).toBe(2);
  });

  it("rejects a multi-opp invoice whose opps have different bill-to companies", async () => {
    await request(app).post(`/opportunities/${OPP_X1}/line-items`).set(rep).send({ productCode: "YW-MB-SPOT", quantity: 1, unitPrice: 300 }).expect(201);
    await request(app).post(`/opportunities/${OPP_X2}/line-items`).set(rep).send({ productCode: "YW-MB-SPOT", quantity: 1, unitPrice: 300 }).expect(201);
    const res = await request(app).post(`/invoices`).set(rep).send({ opportunityIds: [OPP_X1, OPP_X2], currency: "USD" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("multi_opp_bill_to_mismatch");
  });
});

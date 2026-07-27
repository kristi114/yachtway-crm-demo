import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Configure Make BEFORE the app (env.ts) loads. vi.hoisted runs before imports.
const H = vi.hoisted(() => {
  process.env.MAKE_SCENARIO_A_URL = "https://hook.make.test/scenario-a";
  process.env.MAKE_OUTBOUND_SECRET = "itest-make-out";
  process.env.MAKE_INBOUND_SECRET = "itest-make-in";
  return { inbound: "itest-make-in" };
});

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Phase X1 exit proof over HTTP: a subscription invoice is drafted (never
 * auto-emitted), a human approval emits a signed payload to Make, the Make
 * callback marks it sent; a rep cannot create or even see a financing
 * (easyfund) invoice; creation is idempotent; and a Won subscription opp
 * auto-drafts. Requires the local DB + `pnpm db:setup` (pipelines seeded) +
 * the X0 migration/policies. Excluded from the unit suite.
 */
const app = createApp();

const CO = "itest_inv_company";
const CT = "itest_inv_contact";
const OPP = "itest_inv_opp"; // subscription (dealers pipeline)
const WON_OPP = "itest_inv_won_opp"; // for the auto-draft-on-won test
const LENDER = "itest_inv_lender";
const EF_OPP = "itest_inv_ef_opp"; // easyfund (financing)

const rep = { "x-crm-role": "SALES_REP", "x-crm-user-id": "itest_rep" };
const fin = { "x-crm-role": "FINTECH", "x-crm-user-id": "itest_fin" };

let dealers: { id: string; stages: { id: string; name: string; isClosed: boolean }[] };
let easyfund: { id: string; firstStageId: string };
let fetchMock: ReturnType<typeof vi.fn>;

function signInbound(jsonString: string): string {
  return createHmac("sha256", H.inbound).update(jsonString, "utf8").digest("hex");
}

beforeEach(() => {
  // Fresh fetch mock per test so call assertions are isolated. emitToMake uses it.
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

beforeAll(async () => {
  // Ensure INTEGRATION role + grants exist (roles/permission_grants aren't RLS'd).
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
    const d = await tx.pipeline.findUnique({
      where: { key: "dealers" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const ef = await tx.pipeline.findUnique({
      where: { key: "easyfund" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    if (!d || !ef) throw new Error("run `pnpm db:setup` before integration tests");
    dealers = { id: d.id, stages: d.stages.map((s) => ({ id: s.id, name: s.name, isClosed: s.isClosed })) };
    easyfund = { id: ef.id, firstStageId: ef.stages[0]!.id };

    // Dealer company (billed party for subscription) + primary contact.
    await tx.$executeRaw`INSERT INTO companies (id, name, company_email, billing_street, billing_city, created_at, updated_at)
      VALUES (${CO}, 'Azimut-Benetti Group', 'billing@azimut.test', '1 Dock Rd', 'Miami', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO contacts (id, company_id, first_name, last_name, email, created_at, updated_at)
      VALUES (${CT}, ${CO}, 'Paolo', 'Vitelli', 'paolo@azimut.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO opportunities (id, name, contact_id, pipeline_id, stage_id, opportunity_amount, created_at, updated_at)
      VALUES (${OPP}, 'Azimut subscription', ${CT}, ${dealers.id}, ${dealers.stages[0]!.id}, 1200.00, now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO opportunities (id, name, contact_id, pipeline_id, stage_id, opportunity_amount, created_at, updated_at)
      VALUES (${WON_OPP}, 'Azimut renewal', ${CT}, ${dealers.id}, ${dealers.stages[0]!.id}, 999.00, now(), now()) ON CONFLICT (id) DO NOTHING`;

    // Financing (easyfund) opp + lender company + satellite with amount_from_lender.
    await tx.$executeRaw`INSERT INTO companies (id, name, company_email, created_at, updated_at)
      VALUES (${LENDER}, 'Acme Marine Lending', 'ap@acme.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO opportunities (id, name, contact_id, pipeline_id, stage_id, created_at, updated_at)
      VALUES (${EF_OPP}, 'Loan referral', ${CT}, ${easyfund.id}, ${easyfund.firstStageId}, now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO easyfund_loans (id, opportunity_id, lender_id, amount_from_lender, created_at, updated_at)
      VALUES ('itest_inv_ef_loan', ${EF_OPP}, ${LENDER}, 500.00, now(), now()) ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE opportunity_id IN (${OPP}, ${WON_OPP}, ${EF_OPP}))`;
    await tx.$executeRaw`DELETE FROM invoices WHERE opportunity_id IN (${OPP}, ${WON_OPP}, ${EF_OPP})`;
    await tx.$executeRaw`DELETE FROM messages WHERE message_type = 'invoice' AND company_id IN (${CO}, ${LENDER})`;
    await tx.$executeRaw`DELETE FROM audit_logs WHERE table_name = 'invoices' AND record_id IN (SELECT id FROM invoices WHERE opportunity_id IN (${OPP}, ${WON_OPP}, ${EF_OPP}))`;
    await tx.$executeRaw`DELETE FROM webhook_events WHERE provider = 'xero'`;
    await tx.$executeRaw`DELETE FROM easyfund_loans WHERE opportunity_id = ${EF_OPP}`;
    await tx.$executeRaw`DELETE FROM opportunity_stage_history WHERE opportunity_id = ${WON_OPP}`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id IN (${OPP}, ${WON_OPP}, ${EF_OPP})`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CT}`;
    await tx.$executeRaw`DELETE FROM companies WHERE id IN (${CO}, ${LENDER})`;
  });
  await prisma.$disconnect();
});

describe("Invoices — draft, approval gate, Make emit + callback (HTTP)", () => {
  let invoiceId = "";

  it("rep creates a subscription draft — no emit happens", async () => {
    const res = await request(app).post(`/opportunities/${OPP}/invoice`).set(rep).send({ invoiceType: "subscription", currency: "USD" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
    expect(res.body.invoiceId).toBeTruthy();
    invoiceId = res.body.invoiceId;
    expect(fetchMock).not.toHaveBeenCalled(); // draft never touches Make
  });

  it("re-creating the same invoice is idempotent (reused)", async () => {
    const res = await request(app).post(`/opportunities/${OPP}/invoice`).set(rep).send({ invoiceType: "subscription", currency: "USD" });
    expect(res.status).toBe(200);
    expect(res.body.reused).toBe(true);
    expect(res.body.invoiceId).toBe(invoiceId);
  });

  it("approval emits a signed payload to Make and marks the invoice queued", async () => {
    const res = await request(app).post(`/invoices/${invoiceId}/approve`).set(rep).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("queued");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hook.make.test/scenario-a");
    expect((opts as { headers: Record<string, string> }).headers["x-make-signature"]).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse((opts as { body: string }).body).crm_invoice_id).toBe(invoiceId);

    // The approval is audited (SOC 2 change-authorization record).
    const audit = await withRole("ADMIN", (tx) =>
      tx.auditLog.findFirst({ where: { recordId: invoiceId, action: "approve" } }),
    );
    expect(audit?.actorRole).toBe("SALES_REP");
  });

  it("the Make callback marks the invoice sent and records Xero ids", async () => {
    const payload = {
      crm_invoice_id: invoiceId,
      status: "sent",
      xero_invoice_id: "XERO-INV-1",
      xero_invoice_number: "INV-0001",
      online_invoice_url: "https://in.xero.com/abc",
      amount_due: 1200,
      due_date: "2026-08-01",
    };
    const raw = JSON.stringify(payload);
    const res = await request(app)
      .post("/webhooks/xero")
      .set("Content-Type", "application/json")
      .set("x-make-signature", signInbound(raw))
      .send(raw);
    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);

    const got = await request(app).get(`/invoices/${invoiceId}`).set(rep);
    expect(got.body.status).toBe("sent");
    expect(got.body.xeroInvoiceId).toBe("XERO-INV-1");
  });

  it("callback with a bad signature is rejected (406)", async () => {
    const raw = JSON.stringify({ crm_invoice_id: invoiceId, status: "sent" });
    await request(app).post("/webhooks/xero").set("Content-Type", "application/json").set("x-make-signature", "bad").send(raw).expect(406);
  });

  it("a rep cannot create a financing (easyfund) invoice — 403", async () => {
    await request(app).post(`/opportunities/${EF_OPP}/invoice`).set(rep).send({ invoiceType: "easyfund" }).expect(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Fintech creates the easyfund invoice; a rep cannot see or approve it (404)", async () => {
    const created = await request(app).post(`/opportunities/${EF_OPP}/invoice`).set(fin).send({ invoiceType: "easyfund" });
    expect(created.status).toBe(201);
    const efId = created.body.invoiceId;

    await request(app).get(`/invoices/${efId}`).set(rep).expect(404); // RLS hides it
    await request(app).post(`/invoices/${efId}/approve`).set(rep).send({}).expect(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("winning an opp NEVER auto-creates an invoice (subscriptions are never auto-drafted)", async () => {
    const closing = dealers.stages.find((s) => s.isClosed) ?? dealers.stages[dealers.stages.length - 1]!;
    await request(app)
      .post(`/opportunities/${WON_OPP}/stage`)
      .set(rep)
      .send({ toStageId: closing.id, opportunityStatus: "Won" })
      .expect(200);

    const draft = await withRole("ADMIN", (tx) => tx.invoice.findUnique({ where: { idempotencyKey: `${WON_OPP}:subscription` } }));
    expect(draft).toBeNull(); // no auto-draft on Won
  });
});

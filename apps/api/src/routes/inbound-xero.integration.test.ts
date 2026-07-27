import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  process.env.MAKE_INBOUND_SECRET = "itest-inbound-in";
  return { inbound: "itest-inbound-in" };
});

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Phase X2 exit proof: inbound Xero events via Make Scenario B. A payment marks
 * the invoice paid + logs it; an easyfund (financing) payment materializes the
 * referring dealer's paid-referral rollup onto a rep-visible Company column while
 * the invoice itself stays hidden from the rep; a credit note rolls onto
 * totalAmountCredited; a void flips status; and redelivered events are idempotent.
 * Requires the local DB + the X0/X2 migrations + INTEGRATION grants (easyfund ro).
 */
const app = createApp();

const DEALER = "itest_x2_dealer";
const LENDER = "itest_x2_lender";
const CT = "itest_x2_ct";
const EF_OPP = "itest_x2_ef_opp";
const EF_INV = "itest_x2_ef_inv";
const SUB_INV = "itest_x2_sub_inv";
const XERO_EF = "XERO-EF-1";
const XERO_SUB = "XERO-SUB-1";
const XC_DEALER = "XC-DEALER-1";

const rep = { "x-crm-role": "SALES_REP", "x-crm-user-id": "itest_x2_rep" };
const sign = (raw: string) => createHmac("sha256", H.inbound).update(raw, "utf8").digest("hex");
const post = (payload: object) => {
  const raw = JSON.stringify(payload);
  return request(app).post("/webhooks/xero").set("Content-Type", "application/json").set("x-make-signature", sign(raw)).send(raw);
};

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
    await tx.$executeRaw`INSERT INTO companies (id, name, xero_contact_id, created_at, updated_at) VALUES (${DEALER}, 'Referring Dealer', ${XC_DEALER}, now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO companies (id, name, created_at, updated_at) VALUES (${LENDER}, 'Acme Lender', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO contacts (id, company_id, first_name, email, created_at, updated_at) VALUES (${CT}, ${DEALER}, 'Del', 'del@dealer.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO opportunities (id, name, contact_id, created_at, updated_at) VALUES (${EF_OPP}, 'Loan referral', ${CT}, now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO easyfund_loans (id, opportunity_id, dealer_id, amount_from_lender, created_at, updated_at) VALUES ('itest_x2_ef_loan', ${EF_OPP}, ${DEALER}, 500.00, now(), now()) ON CONFLICT (id) DO NOTHING`;
    // A sent easyfund invoice (billed to the lender) awaiting payment.
    await tx.$executeRaw`INSERT INTO invoices (id, opportunity_id, company_id, invoice_type, currency, amount, status, xero_invoice_id, sensitivity_class, created_at, updated_at)
      VALUES (${EF_INV}, ${EF_OPP}, ${LENDER}, 'easyfund', 'USD', 500.00, 'sent', ${XERO_EF}, 'financing', now(), now()) ON CONFLICT (id) DO NOTHING`;
    // A sent subscription invoice (billed to the dealer) for the void test.
    await tx.$executeRaw`INSERT INTO invoices (id, company_id, invoice_type, currency, amount, status, xero_invoice_id, sensitivity_class, created_at, updated_at)
      VALUES (${SUB_INV}, ${DEALER}, 'subscription', 'USD', 100.00, 'sent', ${XERO_SUB}, 'general', now(), now()) ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM audit_logs WHERE record_id IN (${EF_INV}, ${SUB_INV}, 'CN-1')`;
    await tx.$executeRaw`DELETE FROM payments WHERE invoice_id IN (${EF_INV}, ${SUB_INV})`;
    await tx.$executeRaw`DELETE FROM credit_notes WHERE xero_credit_note_id = 'CN-1'`;
    await tx.$executeRaw`DELETE FROM invoices WHERE id IN (${EF_INV}, ${SUB_INV})`;
    await tx.$executeRaw`DELETE FROM messages WHERE message_type = 'invoice' AND company_id IN (${DEALER}, ${LENDER})`;
    await tx.$executeRaw`DELETE FROM webhook_events WHERE provider = 'xero'`;
    await tx.$executeRaw`DELETE FROM easyfund_loans WHERE opportunity_id = ${EF_OPP}`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id = ${EF_OPP}`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CT}`;
    await tx.$executeRaw`DELETE FROM companies WHERE id IN (${DEALER}, ${LENDER})`;
  });
  await prisma.$disconnect();
});

describe("Inbound Xero — payments, credit notes, status (HTTP)", () => {
  it("a payment marks the invoice paid and materializes the dealer referral rollup", async () => {
    const res = await post({ event_type: "payment", xero_invoice_id: XERO_EF, xero_payment_id: "PAY-1", amount: 500, paid_at: "2026-07-25" });
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);

    const inv = await withRole("ADMIN", (tx) => tx.invoice.findUnique({ where: { id: EF_INV } }));
    expect(inv?.status).toBe("paid");
    const dealer = await withRole("ADMIN", (tx) => tx.company.findUnique({ where: { id: DEALER } }));
    expect(Number(dealer?.easyfundClosedReferralsAmount)).toBe(500);
  });

  it("a rep sees the dealer's rollup but NOT the financing invoice", async () => {
    const co = await request(app).get(`/companies/${DEALER}`).set(rep).expect(200);
    expect(Number(co.body.easyfundClosedReferralsAmount)).toBe(500);
    await request(app).get(`/invoices/${EF_INV}`).set(rep).expect(404); // RLS hides financing invoice
  });

  it("a redelivered payment is idempotent (no double rollup)", async () => {
    const res = await post({ event_type: "payment", xero_invoice_id: XERO_EF, xero_payment_id: "PAY-1", amount: 500 });
    expect(res.body.duplicate).toBe(true);
    const dealer = await withRole("ADMIN", (tx) => tx.company.findUnique({ where: { id: DEALER } }));
    expect(Number(dealer?.easyfundClosedReferralsAmount)).toBe(500); // unchanged
  });

  it("a credit note upserts and rolls onto totalAmountCredited", async () => {
    const res = await post({ event_type: "credit_note", xero_credit_note_id: "CN-1", xero_contact_id: XC_DEALER, amount: 200, currency: "USD" });
    expect(res.status).toBe(200);
    const cn = await withRole("ADMIN", (tx) => tx.creditNote.findUnique({ where: { xeroCreditNoteId: "CN-1" } }));
    expect(cn?.companyId).toBe(DEALER);
    const dealer = await withRole("ADMIN", (tx) => tx.company.findUnique({ where: { id: DEALER } }));
    expect(Number(dealer?.totalAmountCredited)).toBe(200);
  });

  it("an invoice-status VOIDED event flips the invoice status", async () => {
    const res = await post({ event_type: "invoice_status", xero_invoice_id: XERO_SUB, status: "VOIDED" });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe("voided");
    const inv = await withRole("ADMIN", (tx) => tx.invoice.findUnique({ where: { id: SUB_INV } }));
    expect(inv?.status).toBe("voided");
  });
});

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Accounting A2 exit proof: CRM-native dealer credit notes. Issuing a credit rolls
 * the dealer's credited + unallocated-credit totals; applying it against an invoice
 * reduces amountDue (marking it `paid` when it zeroes) + draws down the credit's
 * remaining balance and the dealer's unallocated credit. Requires local DB + db:setup.
 */
const app = createApp();

const DEALER = "itest_cn_dealer";
const INV = "itest_cn_inv";
const rep = { "x-crm-role": "SALES_REP", "x-crm-user-id": "itest_cn_rep" };

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`INSERT INTO companies (id, name, company_email, created_at, updated_at)
      VALUES (${DEALER}, 'Credit Dealer', 'ap@creditdealer.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO invoices (id, company_id, invoice_type, currency, amount, amount_due, status, sensitivity_class, created_at, updated_at)
      VALUES (${INV}, ${DEALER}, 'other', 'USD', 100.00, 100.00, 'sent', 'general', now(), now()) ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM audit_logs WHERE table_name = 'credit_notes' AND record_id IN (SELECT id FROM credit_notes WHERE company_id = ${DEALER})`;
    await tx.$executeRaw`DELETE FROM credit_notes WHERE company_id = ${DEALER}`;
    await tx.$executeRaw`DELETE FROM invoices WHERE id = ${INV}`;
    await tx.$executeRaw`DELETE FROM companies WHERE id = ${DEALER}`;
  });
  await prisma.$disconnect();
});

describe("Accounting A2 — dealer credit notes", () => {
  let credit1 = "";

  it("issuing a credit rolls the dealer's credited + unallocated totals", async () => {
    const res = await request(app).post(`/companies/${DEALER}/credit-notes`).set(rep).send({ amount: 40, reference: "goodwill" });
    expect(res.status).toBe(201);
    credit1 = res.body.creditNoteId;

    const cn = await withRole("ADMIN", (tx) => tx.creditNote.findUnique({ where: { id: credit1 } }));
    expect(cn?.status).toBe("open");
    expect(Number(cn?.remainingCredit)).toBe(40);
    const co = await withRole("ADMIN", (tx) => tx.company.findUnique({ where: { id: DEALER } }));
    expect(Number(co?.totalAmountCredited)).toBe(40);
    expect(Number(co?.totalUnallocatedCredit)).toBe(40);
  });

  it("applying the credit reduces the invoice's amountDue and draws it down", async () => {
    const res = await request(app).post(`/credit-notes/${credit1}/apply`).set(rep).send({ invoiceId: INV });
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(40);
    expect(res.body.invoicePaid).toBe(false);
    expect(res.body.remainingCredit).toBe(0);

    const inv = await withRole("ADMIN", (tx) => tx.invoice.findUnique({ where: { id: INV } }));
    expect(Number(inv?.amountDue)).toBe(60);
    const cn = await withRole("ADMIN", (tx) => tx.creditNote.findUnique({ where: { id: credit1 } }));
    expect(cn?.status).toBe("applied");
    const co = await withRole("ADMIN", (tx) => tx.company.findUnique({ where: { id: DEALER } }));
    expect(Number(co?.totalUnallocatedCredit)).toBe(0);
  });

  it("a credit that covers the remaining balance marks the invoice paid", async () => {
    const issued = await request(app).post(`/companies/${DEALER}/credit-notes`).set(rep).send({ amount: 60 });
    const credit2 = issued.body.creditNoteId;
    const res = await request(app).post(`/credit-notes/${credit2}/apply`).set(rep).send({ invoiceId: INV });
    expect(res.status).toBe(200);
    expect(res.body.invoicePaid).toBe(true);

    const inv = await withRole("ADMIN", (tx) => tx.invoice.findUnique({ where: { id: INV } }));
    expect(Number(inv?.amountDue)).toBe(0);
    expect(inv?.status).toBe("paid");
  });

  it("lists the dealer's credit notes", async () => {
    const res = await request(app).get(`/credit-notes?companyId=${DEALER}`).set(rep).expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";
import { accrueOnClose } from "../billing/financingLedger.js";
import { SYSTEM_ROLE_GRANTS } from "@yachtway/shared";

/**
 * Accounting A3 exit proof: closing a financing deal accrues the partner receivable
 * (lender owes us `amount_from_lender`), rolls the referring dealer's rep-visible
 * referral total, and auto-drafts a Payout to the dealer for `paid_to_referring_dealer`.
 * A monthly settlement clears the accrual; the payout is approved + marked paid; and
 * reps can't see receivables/payouts (financing RLS). Requires local DB + db:setup +
 * prisma:seed (FINTECH/INTEGRATION receivable/payout grants) + db:policies.
 */
const app = createApp();

const DEALER = "itest_fl_dealer";
const LENDER = "itest_fl_lender";
const CT = "itest_fl_ct";
const EF_OPP = "itest_fl_ef_opp";

const fin = { "x-crm-role": "FINTECH", "x-crm-user-id": "itest_fl_fin" };
const rep = { "x-crm-role": "SALES_REP", "x-crm-user-id": "itest_fl_rep" };

beforeAll(async () => {
  // INTEGRATION grants (self-seed from the shared matrix) + FINTECH's new financing grants.
  const integ = await prisma.role.upsert({ where: { key: "INTEGRATION" }, update: { isActive: true }, create: { key: "INTEGRATION", name: "Integration" } });
  for (const g of SYSTEM_ROLE_GRANTS.INTEGRATION) {
    await prisma.permissionGrant.upsert({
      where: { roleId_resourceClass: { roleId: integ.id, resourceClass: g.resource } },
      update: { canRead: g.read, canWrite: g.write },
      create: { roleId: integ.id, resourceClass: g.resource, canRead: g.read, canWrite: g.write },
    });
  }
  const fintech = await prisma.role.findUnique({ where: { key: "FINTECH" } });
  if (!fintech) throw new Error("run `pnpm db:setup` (FINTECH role missing)");
  for (const rc of ["receivable.financing", "payout.financing"]) {
    await prisma.permissionGrant.upsert({
      where: { roleId_resourceClass: { roleId: fintech.id, resourceClass: rc } },
      update: { canRead: true, canWrite: true },
      create: { roleId: fintech.id, resourceClass: rc, canRead: true, canWrite: true },
    });
  }

  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`INSERT INTO companies (id, name, created_at, updated_at) VALUES (${DEALER}, 'Referring Dealer', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO companies (id, name, created_at, updated_at) VALUES (${LENDER}, 'Acme Lender', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO contacts (id, company_id, first_name, email, created_at, updated_at) VALUES (${CT}, ${DEALER}, 'Del', 'del@dealer.test', now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO opportunities (id, name, contact_id, opportunity_amount, created_at, updated_at) VALUES (${EF_OPP}, 'Loan referral', ${CT}, 0, now(), now()) ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`INSERT INTO easyfund_loans (id, opportunity_id, lender_id, dealer_id, amount_from_lender, paid_to_referring_dealer, created_at, updated_at)
      VALUES ('itest_fl_ef_loan', ${EF_OPP}, ${LENDER}, ${DEALER}, 500.00, 50.00, now(), now()) ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM audit_logs WHERE table_name IN ('partner_receivables','payouts','payments') AND record_id IN (SELECT id FROM partner_receivables WHERE opportunity_id = ${EF_OPP}) OR record_id IN (SELECT id FROM payouts WHERE related_opportunity_id = ${EF_OPP})`;
    await tx.$executeRaw`DELETE FROM partner_receivables WHERE opportunity_id = ${EF_OPP}`;
    await tx.$executeRaw`DELETE FROM payouts WHERE company_id = ${DEALER}`;
    await tx.$executeRaw`DELETE FROM payments WHERE company_id = ${LENDER}`;
    await tx.$executeRaw`DELETE FROM easyfund_loans WHERE opportunity_id = ${EF_OPP}`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id = ${EF_OPP}`;
    await tx.$executeRaw`DELETE FROM contacts WHERE id = ${CT}`;
    await tx.$executeRaw`DELETE FROM companies WHERE id IN (${DEALER}, ${LENDER})`;
  });
  await prisma.$disconnect();
});

describe("Accounting A3 — partner receivables, settlement, dealer payouts", () => {
  let payoutId = "";

  it("closing accrues the partner receivable + rolls the dealer referral + auto-drafts the payout", async () => {
    const r = await withRole("INTEGRATION", (tx) => accrueOnClose(tx, EF_OPP, "easyfund"));
    expect(r.accrued).toBe(true);
    expect(r.payoutId).toBeTruthy();

    const rec = await withRole("ADMIN", (tx) => tx.partnerReceivable.findUnique({ where: { opportunityId: EF_OPP } }));
    expect(rec?.companyId).toBe(LENDER);
    expect(Number(rec?.amount)).toBe(500);
    expect(rec?.status).toBe("accrued");

    const dealer = await withRole("ADMIN", (tx) => tx.company.findUnique({ where: { id: DEALER } }));
    expect(Number(dealer?.easyfundClosedReferralsAmount)).toBe(500);
    expect(Number(dealer?.totalPayoutsPending)).toBe(50);
    const lender = await withRole("ADMIN", (tx) => tx.company.findUnique({ where: { id: LENDER } }));
    expect(Number(lender?.totalPartnerOwed)).toBe(500);
  });

  it("re-closing is idempotent (no second accrual/payout)", async () => {
    const r = await withRole("INTEGRATION", (tx) => accrueOnClose(tx, EF_OPP, "easyfund"));
    expect(r.accrued).toBe(false);
    const count = await withRole("ADMIN", (tx) => tx.payout.count({ where: { relatedOpportunityId: EF_OPP } }));
    expect(count).toBe(1);
  });

  it("a rep cannot see receivables or payouts (financing RLS) — 403", async () => {
    await request(app).get(`/receivables?companyId=${LENDER}`).set(rep).expect(403);
    await request(app).get(`/payouts?companyId=${DEALER}`).set(rep).expect(403);
  });

  it("Fintech records the monthly settlement, clearing the accrual", async () => {
    const res = await request(app)
      .post(`/companies/${LENDER}/partner-settlement`)
      .set(fin)
      .send({ amount: 500, method: "bank_transfer", paidAt: "2099-12-31", reference: "JAN-15" });
    expect(res.status).toBe(201);
    expect(res.body.expected).toBe(500);
    expect(res.body.received).toBe(500);
    expect(res.body.settledCount).toBe(1);

    const rec = await withRole("ADMIN", (tx) => tx.partnerReceivable.findUnique({ where: { opportunityId: EF_OPP } }));
    expect(rec?.status).toBe("settled");
    const lender = await withRole("ADMIN", (tx) => tx.company.findUnique({ where: { id: LENDER } }));
    expect(Number(lender?.totalPartnerSettled)).toBe(500);
    expect(Number(lender?.totalPartnerOwed)).toBe(0);
  });

  it("Fintech approves + marks the auto-drafted payout paid", async () => {
    const list = await request(app).get(`/payouts?companyId=${DEALER}`).set(fin).expect(200);
    payoutId = list.body.data[0].id;
    expect(list.body.data[0].amountSource).toBe("referral_field");

    await request(app).post(`/payouts/${payoutId}/approve`).set(fin).expect(200);
    const paid = await request(app).post(`/payouts/${payoutId}/mark-paid`).set(fin).send({ method: "bank_transfer", reference: "ACH-771" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("paid");

    const dealer = await withRole("ADMIN", (tx) => tx.company.findUnique({ where: { id: DEALER } }));
    expect(Number(dealer?.totalPayoutsPending)).toBe(0);
    expect(Number(dealer?.totalPayoutsPaid)).toBe(50);
  });
});

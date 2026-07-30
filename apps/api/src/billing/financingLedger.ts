import type { Prisma } from "@prisma/client";
import { writeAudit } from "../audit.js";

/**
 * Financing ledger (A3) — CRM-native, no Xero. Lenders (easyfund) and insurers
 * (mastercover) are NOT invoiced: when a deal closes we accrue what the partner
 * owes as a PartnerReceivable, and they settle a monthly lump on the 15th. The
 * same close, if the deal carries `paid_to_referring_dealer`, auto-drafts a Payout
 * to the referring dealer. All financing sensitivity (FINTECH/ADMIN via RLS); the
 * company-rollup writes need company.general, so callers run this under INTEGRATION.
 */

/** The next 15th on/after `from` — when the partner is expected to pay this accrual. */
export function nextFifteenth(from: Date): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  return from.getUTCDate() <= 15 ? new Date(Date.UTC(y, m, 15)) : new Date(Date.UTC(y, m + 1, 15));
}

export interface AccrueResult {
  accrued: boolean;
  receivableId?: string;
  payoutId?: string;
  amount?: number;
}

/**
 * Accrue a partner receivable (+ auto-draft the dealer payout) for a just-closed
 * financing opportunity. Idempotent per opportunity (unique). `kind` is derived
 * from the pipeline at the call site.
 */
export async function accrueOnClose(
  tx: Prisma.TransactionClient,
  opportunityId: string,
  kind: "easyfund" | "mastercover",
): Promise<AccrueResult> {
  // Already accrued? (idempotent — a re-close / repeated event is a no-op.)
  const existing = await tx.partnerReceivable.findUnique({ where: { opportunityId } });
  if (existing) return { accrued: false, receivableId: existing.id };

  const opp = await tx.opportunity.findUnique({
    where: { id: opportunityId },
    include: { easyFundLoan: true, masterCoverApplication: true },
  });
  if (!opp) return { accrued: false };

  let partnerCompanyId: string | null;
  let amount: number;
  let dealerId: string | null;
  let paidToReferringDealer: number | null;
  const currency = "USD";

  if (kind === "easyfund") {
    const ef = opp.easyFundLoan;
    if (!ef) return { accrued: false };
    partnerCompanyId = ef.lenderId;
    amount = Number(ef.amountFromLender ?? 0);
    dealerId = ef.dealerId;
    paidToReferringDealer = ef.paidToReferringDealer != null ? Number(ef.paidToReferringDealer) : null;
  } else {
    const mc = opp.masterCoverApplication;
    if (!mc) return { accrued: false };
    partnerCompanyId = mc.insurerId;
    amount = Number(opp.opportunityAmount ?? 0);
    dealerId = mc.referringDealerId;
    paidToReferringDealer = mc.paidToReferringDealer != null ? Number(mc.paidToReferringDealer) : null;
  }
  if (!partnerCompanyId || amount <= 0) return { accrued: false };

  const closedAt = new Date();
  const receivable = await tx.partnerReceivable.create({
    data: {
      companyId: partnerCompanyId,
      opportunityId,
      kind,
      amount,
      currency,
      closedAt,
      expectedSettlementDate: nextFifteenth(closedAt),
      status: "accrued",
      sensitivityClass: "financing",
    },
  });

  // Partner owes us this → roll the partner's owed total.
  await tx.$executeRaw`
    UPDATE companies SET total_partner_owed = COALESCE(total_partner_owed, 0) + ${amount} WHERE id = ${partnerCompanyId}`;

  // Rep-visible dealer referral rollup (the aggregate reps see instead of the hidden deal).
  if (dealerId) {
    if (kind === "easyfund") {
      await tx.$executeRaw`
        UPDATE companies SET easyfund_closed_referrals_amount = COALESCE(easyfund_closed_referrals_amount, 0) + ${amount} WHERE id = ${dealerId}`;
    } else {
      await tx.$executeRaw`
        UPDATE companies SET mastercover_closed_referrals_amount = COALESCE(mastercover_closed_referrals_amount, 0) + ${amount} WHERE id = ${dealerId}`;
    }
  }

  // Auto-draft the dealer payout when the deal carries a referral payout amount.
  let payoutId: string | undefined;
  if (dealerId && paidToReferringDealer != null && paidToReferringDealer > 0) {
    const payout = await tx.payout.create({
      data: {
        companyId: dealerId,
        amount: paidToReferringDealer,
        currency,
        status: "pending",
        amountSource: "referral_field",
        relatedOpportunityId: opportunityId,
        sensitivityClass: "financing",
      },
    });
    payoutId = payout.id;
    await tx.$executeRaw`
      UPDATE companies SET total_payouts_pending = COALESCE(total_payouts_pending, 0) + ${paidToReferringDealer} WHERE id = ${dealerId}`;
  }

  await writeAudit(tx, {
    actorRole: "INTEGRATION",
    action: "accrue",
    resourceClass: "receivable.financing",
    tableName: "partner_receivables",
    recordId: receivable.id,
    after: { kind, amount, partnerCompanyId, payoutId: payoutId ?? null },
  });

  return { accrued: true, receivableId: receivable.id, payoutId, amount };
}

export interface SettlementInput {
  companyId: string;
  amount: number;
  method: string;
  paidAt?: string | null;
  reference?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
}
export interface SettlementResult {
  status?: number;
  error?: string;
  expected?: number;
  received?: number;
  difference?: number;
  settledCount?: number;
}

/** Record a partner's monthly lump payment; clears its accrued receivables due
 *  on/before paidAt and reports expected-vs-received. */
export async function recordPartnerSettlement(
  tx: Prisma.TransactionClient,
  input: SettlementInput,
): Promise<SettlementResult> {
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

  const due = await tx.partnerReceivable.findMany({
    where: { companyId: input.companyId, status: "accrued", expectedSettlementDate: { lte: paidAt } },
  });
  if (due.length === 0) return { status: 409, error: "no_accrued_receivables_due" };

  const payment = await tx.payment.create({
    data: {
      companyId: input.companyId,
      amount: input.amount,
      method: input.method,
      billingProvider: "manual",
      paidAt,
      reference: input.reference ?? null,
      recordedById: input.actorUserId ?? null,
      sensitivityClass: "financing",
    },
  });

  const ids = due.map((r) => r.id);
  await tx.partnerReceivable.updateMany({
    where: { id: { in: ids } },
    data: { status: "settled", settlementPaymentId: payment.id },
  });

  const expected = due.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  await tx.$executeRaw`
    UPDATE companies
       SET total_partner_settled = COALESCE(total_partner_settled, 0) + ${input.amount},
           total_partner_owed    = GREATEST(COALESCE(total_partner_owed, 0) - ${expected}, 0)
     WHERE id = ${input.companyId}`;

  await writeAudit(tx, {
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? "INTEGRATION",
    action: "partner_settlement",
    resourceClass: "receivable.financing",
    tableName: "payments",
    recordId: payment.id,
    after: { companyId: input.companyId, received: input.amount, expected, settledCount: ids.length },
  });

  return { expected, received: input.amount, difference: Number((input.amount - expected).toFixed(2)), settledCount: ids.length };
}

// --- Payouts ---
export interface CreatePayoutInput {
  companyId: string;
  amount: number;
  currency: string;
  method?: string | null;
  reference?: string | null;
  relatedOpportunityId?: string | null;
  createdById?: string | null;
  actorRole?: string | null;
}

export async function createPayout(tx: Prisma.TransactionClient, input: CreatePayoutInput): Promise<{ id: string }> {
  const payout = await tx.payout.create({
    data: {
      companyId: input.companyId,
      amount: input.amount,
      currency: input.currency,
      status: "pending",
      method: input.method ?? null,
      amountSource: "manual",
      reference: input.reference ?? null,
      relatedOpportunityId: input.relatedOpportunityId ?? null,
      sensitivityClass: "financing",
      createdById: input.createdById ?? null,
    },
  });
  await tx.$executeRaw`
    UPDATE companies SET total_payouts_pending = COALESCE(total_payouts_pending, 0) + ${input.amount} WHERE id = ${input.companyId}`;
  await writeAudit(tx, {
    actorUserId: input.createdById ?? null,
    actorRole: input.actorRole ?? "ADMIN",
    action: "create",
    resourceClass: "payout.financing",
    tableName: "payouts",
    recordId: payout.id,
    after: { companyId: input.companyId, amount: input.amount, status: "pending", amountSource: "manual" },
  });
  return { id: payout.id };
}

export interface PayoutActionResult {
  status?: number;
  error?: string;
  payoutStatus?: string;
}

export async function approvePayout(
  tx: Prisma.TransactionClient,
  payoutId: string,
  actor: { userId?: string | null; role?: string | null },
): Promise<PayoutActionResult> {
  const p = await tx.payout.findUnique({ where: { id: payoutId } });
  if (!p) return { status: 404, error: "payout_not_found" };
  if (p.status !== "pending") return { status: 409, error: `not_approvable: status is ${p.status}` };
  await tx.payout.update({ where: { id: payoutId }, data: { status: "approved", approvedById: actor.userId ?? null } });
  await writeAudit(tx, {
    actorUserId: actor.userId ?? null,
    actorRole: actor.role ?? "ADMIN",
    action: "approve",
    resourceClass: "payout.financing",
    tableName: "payouts",
    recordId: payoutId,
    before: { status: p.status },
    after: { status: "approved" },
  });
  return { payoutStatus: "approved" };
}

export async function markPayoutPaid(
  tx: Prisma.TransactionClient,
  payoutId: string,
  input: { method: string; reference?: string | null; paidAt?: string | null },
  actor: { userId?: string | null; role?: string | null },
): Promise<PayoutActionResult> {
  const p = await tx.payout.findUnique({ where: { id: payoutId } });
  if (!p) return { status: 404, error: "payout_not_found" };
  if (p.status !== "approved" && p.status !== "pending") return { status: 409, error: `not_payable: status is ${p.status}` };

  await tx.payout.update({
    where: { id: payoutId },
    data: { status: "paid", method: input.method, reference: input.reference ?? p.reference, paidAt: input.paidAt ? new Date(input.paidAt) : new Date() },
  });
  const amt = Number(p.amount ?? 0);
  await tx.$executeRaw`
    UPDATE companies
       SET total_payouts_pending = GREATEST(COALESCE(total_payouts_pending, 0) - ${amt}, 0),
           total_payouts_paid    = COALESCE(total_payouts_paid, 0) + ${amt}
     WHERE id = ${p.companyId}`;
  await writeAudit(tx, {
    actorUserId: actor.userId ?? null,
    actorRole: actor.role ?? "ADMIN",
    action: "payout_paid",
    resourceClass: "payout.financing",
    tableName: "payouts",
    recordId: payoutId,
    before: { status: p.status },
    after: { status: "paid", method: input.method },
  });
  return { payoutStatus: "paid" };
}

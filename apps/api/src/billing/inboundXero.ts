import type { Prisma } from "@prisma/client";
import type { BillingSensitivity } from "@yachtway/shared";
import { writeAudit } from "../audit.js";
import { invoiceResourceClass, logInvoiceActivity } from "./invoiceService.js";

/**
 * Inbound Xero events via Make Scenario B (Phase X2): payments, credit notes, and
 * invoice-status changes. All run under withRole('INTEGRATION') from the webhook,
 * idempotent via the webhook_events ledger. Each returns a small result the route
 * echoes; a `status` field means "respond with this HTTP status" (bad input).
 *
 * Rep-visible financing projection: reps never see easyfund/mastercover invoices,
 * but when such an invoice is paid the referring dealer's paid-referral rollup is
 * materialized onto the dealer's Company (a general-readable column). Credit notes
 * roll onto the credited dealer's totalAmountCredited. INTEGRATION can read the
 * financing satellites (read-only) purely to resolve the dealer.
 */

export interface InboundXeroBody {
  event_type?: string;
  xero_invoice_id?: string;
  xero_payment_id?: string;
  xero_credit_note_id?: string;
  xero_contact_id?: string;
  amount?: number;
  remaining_credit?: number;
  paid_at?: string;
  reference?: string;
  currency?: string;
  status?: string;
}

export interface InboundResult {
  status?: number;
  error?: string;
  duplicate?: boolean;
  matched?: boolean;
  paid?: boolean;
  applied?: string;
}

async function claimEvent(
  tx: Prisma.TransactionClient,
  externalId: string,
  eventType: string,
): Promise<boolean> {
  const dup = await tx.webhookEvent.findUnique({
    where: { provider_externalId: { provider: "xero", externalId } },
  });
  if (dup) return false;
  await tx.webhookEvent.create({ data: { provider: "xero", externalId, eventType } });
  return true;
}

/** Payment received → upsert Payment, roll invoice amountPaid/Due/status, log the
 *  paid activity, and roll the billing + referral rollups. */
export async function handlePayment(tx: Prisma.TransactionClient, body: InboundXeroBody): Promise<InboundResult> {
  const paymentId = body.xero_payment_id;
  if (!paymentId) return { status: 400, error: "missing_xero_payment_id" };
  if (!(await claimEvent(tx, paymentId, "payment"))) return { duplicate: true };

  const invoice = body.xero_invoice_id
    ? await tx.invoice.findUnique({ where: { xeroInvoiceId: body.xero_invoice_id } })
    : null;
  if (!invoice) return { matched: false };

  await tx.payment.upsert({
    where: { xeroPaymentId: paymentId },
    create: {
      invoiceId: invoice.id,
      xeroPaymentId: paymentId,
      amount: body.amount ?? null,
      paidAt: body.paid_at ? new Date(body.paid_at) : null,
      reference: body.reference ?? null,
      sensitivityClass: invoice.sensitivityClass,
    },
    update: { amount: body.amount ?? null },
  });

  const agg = await tx.payment.aggregate({ _sum: { amount: true }, where: { invoiceId: invoice.id } });
  const paid = Number(agg._sum.amount ?? 0);
  const total = Number(invoice.amount ?? 0);
  const due = Math.max(total - paid, 0);
  const nowPaid = total > 0 && paid >= total;

  await tx.invoice.update({
    where: { id: invoice.id },
    data: { amountPaid: paid, amountDue: due, ...(nowPaid ? { status: "paid" } : {}) },
  });

  if (nowPaid) {
    await logInvoiceActivity(tx, {
      event: "paid",
      invoiceId: invoice.id,
      companyId: invoice.companyId,
      contactId: invoice.contactId,
      sensitivityClass: invoice.sensitivityClass,
    }).catch(() => undefined);
  }
  await writeAudit(tx, {
    actorRole: "INTEGRATION",
    action: "payment",
    resourceClass: invoiceResourceClass(invoice.sensitivityClass as BillingSensitivity),
    tableName: "invoices",
    recordId: invoice.id,
    after: { amountPaid: paid, amountDue: due, status: nowPaid ? "paid" : invoice.status },
  });

  // General billing rollup on the billed company (rep-visible; COALESCE seeds NULL).
  if (invoice.companyId && body.amount != null) {
    await tx.$executeRaw`
      UPDATE companies
         SET total_amount_paid = COALESCE(total_amount_paid, 0) + ${body.amount},
             total_amount_due  = GREATEST(COALESCE(total_amount_due, 0) - ${body.amount}, 0)
       WHERE id = ${invoice.companyId}`;
  }

  // Financing paid → materialize the dealer's paid-referral rollup.
  if (nowPaid && invoice.opportunityId) {
    await rollUpDealerReferral(tx, invoice.invoiceType, invoice.opportunityId, total).catch(() => undefined);
  }

  return { matched: true, paid: nowPaid };
}

/** Roll a paid financing referral onto the referring dealer's Company. easyfund
 *  resolves the dealer via easyfund_loans.dealer_id. mastercover has no dealer
 *  link on its satellite yet — TODO confirm the field, skipped for now. */
async function rollUpDealerReferral(
  tx: Prisma.TransactionClient,
  invoiceType: string,
  opportunityId: string,
  amount: number,
): Promise<void> {
  if (invoiceType === "easyfund") {
    const ef = await tx.easyFundLoan.findUnique({ where: { opportunityId } });
    if (ef?.dealerId) {
      await tx.$executeRaw`
        UPDATE companies
           SET easyfund_closed_referrals_amount = COALESCE(easyfund_closed_referrals_amount, 0) + ${amount}
         WHERE id = ${ef.dealerId}`;
    }
  } else if (invoiceType === "mastercover") {
    const mc = await tx.masterCoverApplication.findUnique({ where: { opportunityId } });
    if (mc?.referringDealerId) {
      await tx.$executeRaw`
        UPDATE companies
           SET mastercover_closed_referrals_amount = COALESCE(mastercover_closed_referrals_amount, 0) + ${amount}
         WHERE id = ${mc.referringDealerId}`;
    }
  }
}

/** Dealer credit note (Xero ACCRECCREDIT) → upsert CreditNote + roll the credited
 *  dealer's totalAmountCredited (rep-visible). Dealer resolved by Xero contact id. */
export async function handleCreditNote(tx: Prisma.TransactionClient, body: InboundXeroBody): Promise<InboundResult> {
  const creditNoteId = body.xero_credit_note_id;
  if (!creditNoteId) return { status: 400, error: "missing_xero_credit_note_id" };
  if (!(await claimEvent(tx, creditNoteId, "credit_note"))) return { duplicate: true };

  const company = body.xero_contact_id
    ? await tx.company.findFirst({ where: { xeroContactId: body.xero_contact_id } })
    : null;

  await tx.creditNote.upsert({
    where: { xeroCreditNoteId: creditNoteId },
    create: {
      companyId: company?.id ?? null,
      xeroCreditNoteId: creditNoteId,
      amount: body.amount ?? null,
      remainingCredit: body.remaining_credit ?? null,
      status: body.status ?? null,
      currency: body.currency ?? "USD",
      reference: body.reference ?? null,
      sensitivityClass: "general",
    },
    update: {
      amount: body.amount ?? null,
      remainingCredit: body.remaining_credit ?? null,
      status: body.status ?? null,
    },
  });

  if (company?.id && body.amount != null) {
    await tx.$executeRaw`
      UPDATE companies
         SET total_amount_credited = COALESCE(total_amount_credited, 0) + ${body.amount}
       WHERE id = ${company.id}`;
  }

  await writeAudit(tx, {
    actorRole: "INTEGRATION",
    action: "credit_note",
    resourceClass: "invoice.general",
    tableName: "credit_notes",
    recordId: creditNoteId,
    after: { companyId: company?.id ?? null, amount: body.amount ?? null },
  });

  return { matched: Boolean(company), applied: "credit_note" };
}

/** Invoice status change from Xero (void / overdue / paid). */
export async function handleInvoiceStatus(tx: Prisma.TransactionClient, body: InboundXeroBody): Promise<InboundResult> {
  if (!body.xero_invoice_id) return { status: 400, error: "missing_xero_invoice_id" };
  const externalId = `${body.xero_invoice_id}:status:${body.status ?? "unknown"}`;
  if (!(await claimEvent(tx, externalId, "invoice_status"))) return { duplicate: true };

  const invoice = await tx.invoice.findUnique({ where: { xeroInvoiceId: body.xero_invoice_id } });
  if (!invoice) return { matched: false };

  const map: Record<string, string> = { VOIDED: "voided", PAID: "paid", OVERDUE: "overdue" };
  const newStatus = map[(body.status ?? "").toUpperCase()];
  if (!newStatus) return { matched: true, applied: "ignored" };

  await tx.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });
  await writeAudit(tx, {
    actorRole: "INTEGRATION",
    action: "update",
    resourceClass: invoiceResourceClass(invoice.sensitivityClass as BillingSensitivity),
    tableName: "invoices",
    recordId: invoice.id,
    before: { status: invoice.status },
    after: { status: newStatus },
  });
  return { matched: true, applied: newStatus };
}

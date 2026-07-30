import type { Prisma } from "@prisma/client";
import type { BillingSensitivity } from "@yachtway/shared";
import { writeAudit } from "../audit.js";
import { invoiceResourceClass, logInvoiceActivity } from "./invoiceService.js";

/**
 * Record a payment received against an invoice — the CRM-native replacement for
 * the old Xero payment webhook. Used by the manual record-payment endpoint (bank/
 * check/wire) and by the Stripe webhook (method='stripe'). Creates the Payment,
 * recomputes the invoice's amountPaid/amountDue/status, rolls the billed company's
 * billing totals, logs a `paid` activity, and audits. Runs inside a withRole tx.
 */
export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  method: string; // stripe | bank_transfer | check | wire | manual
  billingProvider?: string; // defaults from method
  paidAt?: string | null;
  reference?: string | null;
  stripePaymentId?: string | null;
  recordedById?: string | null;
  actorRole?: string | null;
}

export interface RecordPaymentResult {
  status?: number;
  error?: string;
  paid?: boolean;
  amountPaid?: number;
  amountDue?: number;
}

export async function recordPayment(
  tx: Prisma.TransactionClient,
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) return { status: 404, error: "invoice_not_found" };

  await tx.payment.create({
    data: {
      invoiceId: invoice.id,
      companyId: invoice.companyId,
      amount: input.amount,
      method: input.method,
      billingProvider: input.billingProvider ?? (input.method === "stripe" ? "stripe" : "manual"),
      stripePaymentId: input.stripePaymentId ?? null,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      reference: input.reference ?? null,
      recordedById: input.recordedById ?? null,
      sensitivityClass: invoice.sensitivityClass,
    },
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

  // Billed-company rollups (rep-visible; COALESCE seeds NULL).
  if (invoice.companyId) {
    await tx.$executeRaw`
      UPDATE companies
         SET total_amount_paid = COALESCE(total_amount_paid, 0) + ${input.amount},
             total_amount_due  = GREATEST(COALESCE(total_amount_due, 0) - ${input.amount}, 0)
       WHERE id = ${invoice.companyId}`;
  }

  await writeAudit(tx, {
    actorUserId: input.recordedById ?? null,
    actorRole: input.actorRole ?? "INTEGRATION",
    action: "payment",
    resourceClass: invoiceResourceClass(invoice.sensitivityClass as BillingSensitivity),
    tableName: "invoices",
    recordId: invoice.id,
    after: { amountPaid: paid, amountDue: due, status: nowPaid ? "paid" : invoice.status },
  });

  return { paid: nowPaid, amountPaid: paid, amountDue: due };
}

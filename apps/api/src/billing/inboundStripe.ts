import type { Prisma } from "@prisma/client";
import { writeAudit } from "../audit.js";
import { logInvoiceActivity } from "./invoiceService.js";

/**
 * Inbound Stripe webhook events (Phase X-Stripe). Runs under withRole('INTEGRATION')
 * from /webhooks/stripe, idempotent per Stripe event id via the webhook_events
 * ledger. Mirrors the money onto the same CRM tables as the Xero flow, tagging
 * billing_provider='stripe' so the ADMIN Accounting view shows the source.
 *
 * Handled: checkout.session.completed (one-off invoice paid + subscription start),
 * invoice.paid/payment_succeeded (recurring charge), customer.subscription.*
 * (lifecycle), invoice.payment_failed (dunning → past_due).
 */

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface InboundResult {
  status?: number;
  error?: string;
  duplicate?: boolean;
  applied?: string;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

async function claim(tx: Prisma.TransactionClient, eventId: string, type: string): Promise<boolean> {
  const dup = await tx.webhookEvent.findUnique({
    where: { provider_externalId: { provider: "stripe", externalId: eventId } },
  });
  if (dup) return false;
  await tx.webhookEvent.create({ data: { provider: "stripe", externalId: eventId, eventType: type } });
  return true;
}

async function companyForCustomer(tx: Prisma.TransactionClient, customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const c = await tx.company.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
  return c?.id ?? null;
}

/** Roll a received payment onto the billed company's general billing rollup. */
async function rollCollected(tx: Prisma.TransactionClient, companyId: string | null, amount: number | null): Promise<void> {
  if (!companyId || amount == null) return;
  await tx.$executeRaw`
    UPDATE companies
       SET total_amount_paid = COALESCE(total_amount_paid, 0) + ${amount},
           total_amount_due  = GREATEST(COALESCE(total_amount_due, 0) - ${amount}, 0)
     WHERE id = ${companyId}`;
}

export async function handleStripeEvent(tx: Prisma.TransactionClient, event: StripeEvent): Promise<InboundResult> {
  if (!event?.id || !event?.type) return { status: 400, error: "malformed_event" };
  if (!(await claim(tx, event.id, event.type))) return { duplicate: true };
  const obj = event.data?.object ?? {};

  switch (event.type) {
    case "checkout.session.completed": {
      const mode = str(obj.mode);
      const crmInvoiceId = (obj.metadata as Record<string, string> | undefined)?.crm_invoice_id ?? str(obj.client_reference_id);
      if (mode === "payment" && str(obj.payment_status) === "paid" && crmInvoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: crmInvoiceId } });
        if (!inv) return { applied: "invoice_not_found" };
        const amount = num(obj.amount_total) != null ? num(obj.amount_total)! / 100 : Number(inv.amount ?? 0);
        await tx.payment.create({
          data: {
            invoiceId: inv.id,
            companyId: inv.companyId,
            stripePaymentId: str(obj.payment_intent) ?? str(obj.id),
            billingProvider: "stripe",
            amount,
            paidAt: new Date(),
            sensitivityClass: inv.sensitivityClass,
          },
        });
        await tx.invoice.update({ where: { id: inv.id }, data: { status: "paid", amountPaid: amount, amountDue: 0 } });
        await logInvoiceActivity(tx, {
          event: "paid",
          invoiceId: inv.id,
          companyId: inv.companyId,
          contactId: inv.contactId,
          sensitivityClass: inv.sensitivityClass,
        }).catch(() => undefined);
        await rollCollected(tx, inv.companyId, amount);
        await writeAudit(tx, { actorRole: "INTEGRATION", action: "payment", resourceClass: "invoice.general", tableName: "invoices", recordId: inv.id, after: { status: "paid", source: "stripe" } });
        return { applied: "invoice_paid" };
      }
      // subscription-mode checkout: the subscription lifecycle events carry detail.
      return { applied: "checkout_ack" };
    }

    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const subId = str(obj.subscription);
      if (!subId) return { applied: "ignored_non_subscription" };
      const sub = await tx.subscription.findUnique({ where: { stripeSubscriptionId: subId } });
      const companyId = sub?.companyId ?? (await companyForCustomer(tx, str(obj.customer)));
      const amount = num(obj.amount_paid) != null ? num(obj.amount_paid)! / 100 : null;
      await tx.payment.create({
        data: {
          subscriptionId: sub?.id ?? null,
          companyId,
          stripePaymentId: str(obj.payment_intent) ?? str(obj.id),
          billingProvider: "stripe",
          amount,
          paidAt: new Date(),
          sensitivityClass: "general",
        },
      });
      await rollCollected(tx, companyId, amount);
      return { applied: "subscription_payment" };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subId = str(obj.id);
      if (!subId) return { applied: "no_subscription_id" };
      const customerId = str(obj.customer);
      const companyId = await companyForCustomer(tx, customerId);
      const item = ((obj.items as { data?: Record<string, unknown>[] } | undefined)?.data ?? [])[0] ?? {};
      const price = (item.price as Record<string, unknown> | undefined) ?? {};
      const qty = num(item.quantity) ?? 1;
      const unit = num(price.unit_amount);
      const periodEnd = num(obj.current_period_end);
      await tx.subscription.upsert({
        where: { stripeSubscriptionId: subId },
        create: {
          stripeSubscriptionId: subId,
          stripeCustomerId: customerId,
          companyId,
          stripePriceId: str(price.id),
          productName: str(price.nickname),
          status: str(obj.status),
          seats: qty,
          mrr: unit != null ? (unit * qty) / 100 : null,
          currency: (str(obj.currency) ?? "usd").toUpperCase(),
          currentPeriodEnd: periodEnd != null ? new Date(periodEnd * 1000) : null,
        },
        update: {
          companyId: companyId ?? undefined,
          stripePriceId: str(price.id),
          status: str(obj.status),
          seats: qty,
          currentPeriodEnd: periodEnd != null ? new Date(periodEnd * 1000) : null,
        },
      });
      return { applied: "subscription_upserted" };
    }

    case "customer.subscription.deleted": {
      const subId = str(obj.id);
      if (subId) await tx.subscription.updateMany({ where: { stripeSubscriptionId: subId }, data: { status: "canceled" } });
      return { applied: "subscription_canceled" };
    }

    case "invoice.payment_failed": {
      const subId = str(obj.subscription);
      if (subId) await tx.subscription.updateMany({ where: { stripeSubscriptionId: subId }, data: { status: "past_due" } });
      return { applied: "past_due" };
    }

    default:
      return { applied: "ignored" };
  }
}

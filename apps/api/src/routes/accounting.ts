import { Router } from "express";
import { AccountingTabSchema, type AccountingRow, SubscriptionCreateSchema } from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorizeAny } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { createCheckoutSession, StripeConfigError } from "../integrations/stripe.js";

/**
 * Accounting (ADMIN) + Stripe subscription checkout.
 *
 * The Accounting object is the ADMIN-only combined books across both rails — each
 * row carries a `source` (xero|stripe). Four tabs: Collected (payments), Accounts
 * Receivable (open invoices), Accounts Payable (bills), Dealer Credits (credit
 * notes). It runs under withRole('ADMIN') so RLS surfaces every row.
 */
const router: Router = Router();
router.use(authContext);

function requireAdmin(role: string): boolean {
  return role === "ADMIN";
}

// ---------------------------------------------------------------------------
// Start a Stripe subscription for a dealer — returns a Checkout URL to send.
// ---------------------------------------------------------------------------
router.post("/companies/:id/stripe/subscription", authorizeAny(["invoice.general"], "write"), async (req, res) => {
  const input = SubscriptionCreateSchema.parse(req.body);
  const companyId = String(req.params.id);

  const company = await withRole(req.auth!.role, (tx) =>
    tx.company.findUnique({ where: { id: companyId }, select: { id: true, stripeCustomerId: true } }),
  );
  if (!company) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }

  try {
    const session = await createCheckoutSession({
      mode: "subscription",
      customerId: company.stripeCustomerId ?? undefined,
      priceId: input.priceId,
      quantity: input.seats ?? 1,
      clientReferenceId: companyId,
      metadata: { crm_company_id: companyId },
    });
    res.status(200).json({ checkoutUrl: session.url });
  } catch (err) {
    if (err instanceof StripeConfigError) {
      res.status(503).json({ error: "stripe_not_configured" });
      return;
    }
    res.status(502).json({ error: "stripe_checkout_failed", detail: (err as Error).message.slice(0, 300) });
  }
});

// ---------------------------------------------------------------------------
// Accounting — ADMIN only. Combined books across Xero + Stripe.
// ---------------------------------------------------------------------------
router.get("/accounting/:tab", authorizeAny(["invoice.general", "invoice.financing"], "read"), async (req, res) => {
  if (!requireAdmin(req.auth!.role)) {
    res.status(403).json({ error: "forbidden: Accounting is ADMIN only" });
    return;
  }
  const parsed = AccountingTabSchema.safeParse(req.params.tab);
  if (!parsed.success) {
    res.status(400).json({ error: "unknown_tab" });
    return;
  }
  const tab = parsed.data;
  const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
  const dec = (d: unknown): number | null => (d == null ? null : Number(d));

  const rows: AccountingRow[] = await withRole("ADMIN", async (tx) => {
    if (tab === "collected") {
      const payments = await tx.payment.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
      return payments.map((p) => ({
        id: p.id,
        source: p.billingProvider,
        kind: "payment",
        date: iso(p.paidAt ?? p.createdAt),
        companyId: p.companyId ?? null,
        contactId: null,
        reference: p.reference ?? null,
        amount: dec(p.amount),
        amountDue: null,
        status: "paid",
        currency: null,
      }));
    }
    if (tab === "receivable") {
      const invoices = await tx.invoice.findMany({
        where: { status: { in: ["sent", "overdue", "queued"] } },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return invoices.map((i) => ({
        id: i.id,
        source: i.billingProvider,
        kind: "invoice",
        date: iso(i.dueDate ?? i.createdAt),
        companyId: i.companyId ?? null,
        contactId: i.contactId ?? null,
        reference: i.reference ?? i.xeroInvoiceNumber ?? null,
        amount: dec(i.amount),
        amountDue: dec(i.amountDue ?? i.amount),
        status: i.status,
        currency: i.currency,
      }));
    }
    if (tab === "payable") {
      const bills = await tx.bill.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
      return bills.map((b) => ({
        id: b.id,
        source: b.billingProvider,
        kind: "bill",
        date: iso(b.dueDate ?? b.createdAt),
        companyId: b.companyId ?? null,
        contactId: b.contactId ?? null,
        reference: b.billType ?? null,
        amount: dec(b.amount),
        amountDue: dec(b.amount != null && b.amountPaid != null ? Number(b.amount) - Number(b.amountPaid) : b.amount),
        status: b.status,
        currency: b.currency,
      }));
    }
    // dealer-credits
    const credits = await tx.creditNote.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    return credits.map((c) => ({
      id: c.id,
      source: c.billingProvider,
      kind: "credit_note",
      date: iso(c.createdAt),
      companyId: c.companyId ?? null,
      contactId: c.contactId ?? null,
      reference: c.reference ?? null,
      amount: dec(c.amount),
      amountDue: dec(c.remainingCredit),
      status: c.status ?? null,
      currency: c.currency,
    }));
  });

  res.json({ tab, data: rows, nextCursor: null });
});

export default router;

import { Router } from "express";
import {
  AccountingTabSchema,
  type AccountingRow,
  PaginationQuerySchema,
  PartnerSettlementSchema,
  PayoutCreateSchema,
  PayoutMarkPaidSchema,
  SubscriptionCreateSchema,
} from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize, authorizeAny } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { createCheckoutSession, StripeConfigError } from "../integrations/stripe.js";
import {
  approvePayout,
  createPayout,
  markPayoutPaid,
  recordPartnerSettlement,
} from "../billing/financingLedger.js";

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
        reference: i.reference ?? null,
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
    if (tab === "partner-owed") {
      const recs = await tx.partnerReceivable.findMany({ where: { status: "accrued" }, orderBy: { expectedSettlementDate: "asc" }, take: 500 });
      return recs.map((r) => ({
        id: r.id,
        source: "accrual",
        kind: r.kind, // easyfund | mastercover
        date: iso(r.expectedSettlementDate),
        companyId: r.companyId,
        contactId: null,
        reference: null,
        amount: dec(r.amount),
        amountDue: dec(r.amount),
        status: r.status,
        currency: r.currency,
      }));
    }
    if (tab === "payouts") {
      const payouts = await tx.payout.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
      return payouts.map((p) => ({
        id: p.id,
        source: p.method ?? p.amountSource,
        kind: "payout",
        date: iso(p.paidAt ?? p.createdAt),
        companyId: p.companyId,
        contactId: null,
        reference: p.reference ?? null,
        amount: dec(p.amount),
        amountDue: p.status === "paid" ? 0 : dec(p.amount),
        status: p.status,
        currency: p.currency,
      }));
    }
    if (tab === "shoot-credits") {
      const credits = await tx.studioShootCredit.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
      return credits.map((s) => ({
        id: s.id,
        source: "shoot_credit",
        kind: s.delta > 0 ? "credit_granted" : "credit_consumed",
        date: iso(s.createdAt),
        companyId: s.companyId,
        contactId: null,
        reference: s.reason ?? null,
        amount: s.delta, // non-monetary: number of shoots
        amountDue: null,
        status: null,
        currency: null,
      }));
    }
    // dealer-credits
    const credits = await tx.creditNote.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    return credits.map((c) => ({
      id: c.id,
      source: "manual",
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

// ---------------------------------------------------------------------------
// Partner receivables (lenders/insurers) — FINTECH/ADMIN. Accrual is automatic on
// the opportunity close trigger; here we list them + record the monthly settlement.
// ---------------------------------------------------------------------------
router.get("/receivables", authorize("receivable.financing", "read"), async (req, res) => {
  const { cursor, limit } = PaginationQuerySchema.parse(req.query);
  const q = req.query as { companyId?: string; status?: string; kind?: string };
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.partnerReceivable.findMany({
      where: {
        ...(q.companyId ? { companyId: String(q.companyId) } : {}),
        ...(q.status ? { status: String(q.status) } : {}),
        ...(q.kind ? { kind: String(q.kind) } : {}),
      },
      take: limit + 1,
      orderBy: { expectedSettlementDate: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  res.json({ data, nextCursor: hasMore ? data[data.length - 1]!.id : null });
});

router.post("/companies/:id/partner-settlement", authorize("receivable.financing", "write"), async (req, res) => {
  const input = PartnerSettlementSchema.parse(req.body);
  const result = await withRole("INTEGRATION", (tx) =>
    recordPartnerSettlement(tx, {
      companyId: String(req.params.id),
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt ?? null,
      reference: input.reference ?? null,
      actorUserId: req.auth!.userId,
      actorRole: req.auth!.role,
    }),
  );
  if (result.status) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

// ---------------------------------------------------------------------------
// Dealer payouts — FINTECH/ADMIN. Auto-drafted on close from paid_to_referring_dealer;
// finance can also add ad-hoc payouts, then approve + mark paid.
// ---------------------------------------------------------------------------
router.get("/payouts", authorize("payout.financing", "read"), async (req, res) => {
  const { cursor, limit } = PaginationQuerySchema.parse(req.query);
  const q = req.query as { companyId?: string; status?: string };
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.payout.findMany({
      where: {
        ...(q.companyId ? { companyId: String(q.companyId) } : {}),
        ...(q.status ? { status: String(q.status) } : {}),
      },
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  res.json({ data, nextCursor: hasMore ? data[data.length - 1]!.id : null });
});

router.post("/companies/:id/payouts", authorize("payout.financing", "write"), async (req, res) => {
  const input = PayoutCreateSchema.parse(req.body);
  const result = await withRole("INTEGRATION", async (tx) => {
    const company = await tx.company.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
    if (!company) return { status: 404 as const, error: "company_not_found" };
    return createPayout(tx, {
      companyId: String(req.params.id),
      amount: input.amount,
      currency: input.currency,
      method: input.method ?? null,
      reference: input.reference ?? null,
      relatedOpportunityId: input.relatedOpportunityId ?? null,
      createdById: req.auth!.userId,
      actorRole: req.auth!.role,
    });
  });
  if ("status" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json({ payoutId: result.id });
});

router.post("/payouts/:id/approve", authorize("payout.financing", "write"), async (req, res) => {
  const result = await withRole("INTEGRATION", (tx) =>
    approvePayout(tx, String(req.params.id), { userId: req.auth!.userId, role: req.auth!.role }),
  );
  if (result.status) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(200).json({ payoutId: req.params.id, status: result.payoutStatus });
});

router.post("/payouts/:id/mark-paid", authorize("payout.financing", "write"), async (req, res) => {
  const input = PayoutMarkPaidSchema.parse(req.body);
  const result = await withRole("INTEGRATION", (tx) =>
    markPayoutPaid(tx, String(req.params.id), { method: input.method, reference: input.reference ?? null, paidAt: input.paidAt ?? null }, { userId: req.auth!.userId, role: req.auth!.role }),
  );
  if (result.status) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(200).json({ payoutId: req.params.id, status: result.payoutStatus });
});

export default router;

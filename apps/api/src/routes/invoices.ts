import type { Prisma } from "@prisma/client";
import { Router } from "express";
import {
  type BillingSensitivity,
  can,
  INVOICE_TYPE_CONFIG,
  InvoiceApproveSchema,
  InvoiceCreateSchema,
  invoiceResourceClass,
  type InvoiceType,
  LineItemCreateSchema,
  MultiInvoiceCreateSchema,
  PaginationQuerySchema,
} from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize, authorizeAny } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { loadEffectivePermissions } from "../permissions/service.js";
import {
  addLineItem,
  buildEmitPayload,
  buildItemizedEmitLines,
  buildPartyForInvoice,
  createInvoiceDraft,
  createStudioInvoiceDraft,
  logInvoiceActivity,
} from "../billing/invoiceService.js";
import { emitToMake, MakeConfigError } from "../integrations/make.js";
import { createCheckoutSession, StripeConfigError } from "../integrations/stripe.js";
import { emitQueueEnabled, enqueueInvoiceEmit } from "../queue/emitQueue.js";
import { writeAudit } from "../audit.js";

/**
 * Invoices (Phase X1). Draft-first + human-approval-gated: creating an invoice
 * (auto on Won or here) only ever produces a local DRAFT; nothing reaches Xero
 * until POST /invoices/:id/approve, which emits the signed payload to Make.
 *
 * Every route requires SOME invoice write/read grant (authorizeAny), then
 * enforces the specific class (general vs financing) per invoice — so a rep can
 * touch subscription/studio/other but never easyfund/mastercover. Postgres RLS
 * is the backstop (invoices.sensitivity_class → invoice.general|financing).
 */
const router: Router = Router();
router.use(authContext);

const INVOICE_CLASSES = ["invoice.general", "invoice.financing"] as const;

// ---------------------------------------------------------------------------
// Create a single-opportunity invoice draft (rep-initiated).
// ---------------------------------------------------------------------------
router.post(
  "/opportunities/:id/invoice",
  authorizeAny([...INVOICE_CLASSES], "write"),
  async (req, res) => {
    const input = InvoiceCreateSchema.parse(req.body);
    const cls = invoiceResourceClass(input.invoiceType);
    const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
    if (!can(perms, cls, "write")) {
      res.status(403).json({ error: `forbidden: ${req.auth!.role} cannot create ${input.invoiceType} invoices` });
      return;
    }

    const result = await withRole(req.auth!.role, (tx) =>
      input.invoiceType === "studio"
        ? createStudioInvoiceDraft(tx, {
            opportunityIds: [String(req.params.id)],
            currency: input.currency,
            actorId: req.auth!.userId,
            actorRole: req.auth!.role,
          })
        : createInvoiceDraft(tx, {
            opportunityId: String(req.params.id),
            invoiceType: input.invoiceType,
            currency: input.currency,
            actorId: req.auth!.userId,
            actorRole: req.auth!.role,
            billingProvider: input.billingProvider,
            overrides: { billToCompanyId: input.billToCompanyId, billToContactId: input.billToContactId, amount: input.amount },
          }),
    );

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(result.value.reused ? 200 : 201).json({
      invoiceId: result.value.invoiceId,
      reused: result.value.reused,
      status: "draft",
    });
  },
);

// ---------------------------------------------------------------------------
// Multi-opportunity studio invoice — aggregate line items from several open
// studio opps that share one bill-to onto a single draft.
// ---------------------------------------------------------------------------
router.post("/invoices", authorizeAny([...INVOICE_CLASSES], "write"), async (req, res) => {
  const input = MultiInvoiceCreateSchema.parse(req.body);
  if (input.invoiceType !== "studio") {
    res.status(400).json({ error: "multi_opp_only_supports_studio" });
    return;
  }
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  if (!can(perms, "invoice.general", "write")) {
    res.status(403).json({ error: "forbidden: cannot create studio invoices" });
    return;
  }
  const result = await withRole(req.auth!.role, (tx) =>
    createStudioInvoiceDraft(tx, {
      opportunityIds: input.opportunityIds,
      currency: input.currency,
      actorId: req.auth!.userId,
      actorRole: req.auth!.role,
    }),
  );
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(result.value.reused ? 200 : 201).json({
    invoiceId: result.value.invoiceId,
    reused: result.value.reused,
    status: "draft",
  });
});

// ---------------------------------------------------------------------------
// Studio line items on an opportunity (opportunity.general RLS).
// ---------------------------------------------------------------------------
router.post("/opportunities/:id/line-items", authorize("opportunity.general", "write"), async (req, res) => {
  const input = LineItemCreateSchema.parse(req.body);
  const result = await withRole(req.auth!.role, (tx) =>
    addLineItem(tx, {
      opportunityId: String(req.params.id),
      productCode: input.productCode,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      description: input.description,
      vesselLengthFt: input.vesselLengthFt,
      actorId: req.auth!.userId,
    }),
  );
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(result.value);
});

router.get("/opportunities/:id/line-items", authorize("opportunity.general", "read"), async (req, res) => {
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.opportunityLineItem.findMany({
      where: { opportunityId: String(req.params.id) },
      orderBy: { createdAt: "asc" },
    }),
  );
  res.json({ data: rows, nextCursor: null });
});

router.delete("/line-items/:id", authorize("opportunity.general", "write"), async (req, res) => {
  const result = await withRole(req.auth!.role, async (tx) => {
    const li = await tx.opportunityLineItem.findUnique({ where: { id: String(req.params.id) } });
    if (!li) return { ok: false as const, status: 404, error: "line_item_not_found" };
    if (li.invoiceId) return { ok: false as const, status: 409, error: "line_item_already_invoiced" };
    await tx.opportunityLineItem.delete({ where: { id: li.id } });
    return { ok: true as const };
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Approve — the human gate. Transitions draft → queued and emits to Make.
// A rep may approve their own general invoice; financing needs FINTECH/ADMIN
// (enforced by the class write-check + RLS).
// ---------------------------------------------------------------------------
router.post("/invoices/:id/approve", authorizeAny([...INVOICE_CLASSES], "write"), async (req, res) => {
  const input = InvoiceApproveSchema.parse(req.body ?? {});
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const id = String(req.params.id);

  // Phase 1 (in a tx): validate + mark queued. RLS 404s a financing invoice for
  // a rep (existence not leaked). Emit happens AFTER commit (I/O outside the tx).
  const prep = await withRole(req.auth!.role, async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) return { ok: false as const, status: 404, error: "invoice_not_found" };
    const cls = invoiceResourceClass(inv.sensitivityClass as BillingSensitivity);
    if (!can(perms, cls, "write")) {
      return { ok: false as const, status: 403, error: "forbidden: cannot approve this invoice" };
    }
    if (inv.status !== "draft" && inv.status !== "pending_approval") {
      return { ok: false as const, status: 409, error: `not_approvable: status is ${inv.status}` };
    }
    const party = await buildPartyForInvoice(tx, inv);
    if (!party) return { ok: false as const, status: 400, error: "bill_to_party_unavailable" };
    if (inv.amount == null) return { ok: false as const, status: 400, error: "invoice_has_no_amount" };

    await tx.invoice.update({
      where: { id: inv.id },
      data: { status: "queued", approvedById: req.auth!.userId, approvedAt: new Date(), syncError: null },
    });

    // Audit the approval — this is the human-authorization record for SOC 2.
    await writeAudit(tx, {
      actorUserId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: "approve",
      resourceClass: cls,
      tableName: "invoices",
      recordId: inv.id,
      before: { status: inv.status },
      after: { status: "queued" },
      ipAddress: req.ip ?? null,
    });

    // Itemized studio invoices send ItemCode lines (Xero resolves price); lump-sum
    // types send a single amount line.
    let itemizedLines;
    if (inv.itemized) {
      itemizedLines = await buildItemizedEmitLines(tx, inv.id);
      if (itemizedLines.length === 0) {
        return { ok: false as const, status: 400, error: "no_itemized_lines" };
      }
    }

    const action = input.invoiceAction ?? INVOICE_TYPE_CONFIG[inv.invoiceType as InvoiceType].defaultAction;
    const payload = buildEmitPayload({
      invoiceId: inv.id,
      invoiceType: inv.invoiceType as InvoiceType,
      orgKey: inv.orgKey,
      action,
      currency: inv.currency,
      reference: inv.reference ?? `Invoice ${inv.id}`,
      description: inv.reference ?? `Invoice ${inv.id}`,
      amount: Number(inv.amount ?? 0),
      party,
      idempotencyKey: inv.idempotencyKey,
      itemizedLines,
    });
    return {
      ok: true as const,
      invoiceId: inv.id,
      sensitivityClass: inv.sensitivityClass,
      billingProvider: inv.billingProvider,
      amount: Number(inv.amount ?? 0),
      currency: inv.currency,
      companyId: inv.companyId,
      reference: inv.reference ?? `Invoice ${inv.id}`,
      payload,
    };
  });

  if (!prep.ok) {
    res.status(prep.status).json({ error: prep.error });
    return;
  }

  // Stripe rail: open a hosted Checkout link instead of emitting to Make. The
  // crm_invoice_id rides in metadata so /webhooks/stripe can settle it on payment.
  if (prep.billingProvider === "stripe") {
    try {
      const company = prep.companyId
        ? await withRole(req.auth!.role, (tx) =>
            tx.company.findUnique({ where: { id: prep.companyId! }, select: { stripeCustomerId: true } }),
          )
        : null;
      const session = await createCheckoutSession({
        mode: "payment",
        customerId: company?.stripeCustomerId ?? undefined,
        amountMinor: Math.round(prep.amount * 100),
        currency: prep.currency,
        description: prep.reference,
        clientReferenceId: prep.invoiceId,
        metadata: { crm_invoice_id: prep.invoiceId },
      });
      await withRole(req.auth!.role, (tx) =>
        tx.invoice.update({
          where: { id: prep.invoiceId },
          data: { status: "sent", stripeInvoiceId: session.id, onlineInvoiceUrl: session.url, syncError: null },
        }),
      );
      res.status(200).json({ invoiceId: prep.invoiceId, status: "sent", checkoutUrl: session.url });
      return;
    } catch (err) {
      if (err instanceof StripeConfigError) {
        await withRole(req.auth!.role, (tx) => tx.invoice.update({ where: { id: prep.invoiceId }, data: { status: "draft" } }));
        res.status(503).json({ error: "stripe_not_configured", invoiceId: prep.invoiceId });
        return;
      }
      await withRole(req.auth!.role, (tx) =>
        tx.invoice.update({ where: { id: prep.invoiceId }, data: { status: "failed", syncError: (err as Error).message.slice(0, 500) } }),
      ).catch(() => undefined);
      res.status(502).json({ error: "stripe_checkout_failed", invoiceId: prep.invoiceId });
      return;
    }
  }

  // Phase 2: emit to Make. When the durable queue is enabled, hand off and return
  // immediately (the worker delivers with retries + settles status); the callback
  // still flips queued → sent. Otherwise emit inline and surface the exact result.
  if (emitQueueEnabled()) {
    try {
      await enqueueInvoiceEmit(prep.invoiceId, prep.payload);
    } catch (err) {
      await withRole(req.auth!.role, (tx) =>
        tx.invoice.update({ where: { id: prep.invoiceId }, data: { status: "failed", syncError: (err as Error).message.slice(0, 500) } }),
      ).catch(() => undefined);
      res.status(502).json({ error: "enqueue_failed", invoiceId: prep.invoiceId });
      return;
    }
    res.status(202).json({ invoiceId: prep.invoiceId, status: "queued", queued: true });
    return;
  }

  try {
    await emitToMake(prep.payload);
  } catch (err) {
    if (err instanceof MakeConfigError) {
      await withRole(req.auth!.role, (tx) =>
        tx.invoice.update({ where: { id: prep.invoiceId }, data: { status: "draft" } }),
      );
      res.status(503).json({ error: "make_not_configured", invoiceId: prep.invoiceId });
      return;
    }
    await withRole(req.auth!.role, (tx) =>
      tx.invoice.update({
        where: { id: prep.invoiceId },
        data: { status: "failed", syncError: (err as Error).message.slice(0, 500) },
      }),
    );
    res.status(502).json({ error: "make_emit_failed", invoiceId: prep.invoiceId });
    return;
  }

  res.status(200).json({ invoiceId: prep.invoiceId, status: "queued" });
});

// ---------------------------------------------------------------------------
// Reads — RLS filters financing invoices out for reps automatically.
// ---------------------------------------------------------------------------
router.get("/invoices", authorizeAny([...INVOICE_CLASSES], "read"), async (req, res) => {
  const { cursor, limit } = PaginationQuerySchema.parse(req.query);
  const q = req.query as { status?: string; companyId?: string; invoiceType?: string };
  const where: Prisma.InvoiceWhereInput = {
    ...(q.status ? { status: String(q.status) } : {}),
    ...(q.companyId ? { companyId: String(q.companyId) } : {}),
    ...(q.invoiceType ? { invoiceType: String(q.invoiceType) } : {}),
  };
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.invoice.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  res.json({ data, nextCursor: hasMore ? data[data.length - 1]!.id : null });
});

router.get("/invoices/:id", authorizeAny([...INVOICE_CLASSES], "read"), async (req, res) => {
  const row = await withRole(req.auth!.role, (tx) =>
    tx.invoice.findUnique({
      where: { id: String(req.params.id) },
      include: { payments: true },
    }),
  );
  if (!row) {
    res.status(404).json({ error: "invoice_not_found" });
    return;
  }
  res.json(row);
});

export default router;
export { logInvoiceActivity };

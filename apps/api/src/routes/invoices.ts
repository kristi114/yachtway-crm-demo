import type { Prisma } from "@prisma/client";
import { Router } from "express";
import {
  type BillingSensitivity,
  can,
  InvoiceApproveSchema,
  CreditNoteApplySchema,
  CreditNoteIssueSchema,
  InvoiceCreateSchema,
  invoiceResourceClass,
  LineItemCreateSchema,
  MultiInvoiceCreateSchema,
  PaginationQuerySchema,
  PaymentRecordSchema,
  ShootCreditAdjustSchema,
} from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize, authorizeAny } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { loadEffectivePermissions } from "../permissions/service.js";
import {
  addLineItem,
  buildItemizedEmitLines,
  buildPartyForInvoice,
  createInvoiceDraft,
  createStudioInvoiceDraft,
  logInvoiceActivity,
} from "../billing/invoiceService.js";
import { StripeConfigError } from "../integrations/stripe.js";
import { sendInvoiceEmail } from "../billing/invoiceSend.js";
import { recordPayment } from "../billing/recordPayment.js";
import { applyCreditNote, issueCreditNote } from "../billing/creditNotes.js";
import { adjustShootCredit } from "../billing/shootCredits.js";
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
  InvoiceApproveSchema.parse(req.body ?? {}); // validate shape (no fields needed post-Xero)
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

    // Itemized studio invoices must have at least one line before approval.
    if (inv.itemized) {
      const itemizedLines = await buildItemizedEmitLines(tx, inv.id);
      if (itemizedLines.length === 0) {
        return { ok: false as const, status: 400, error: "no_itemized_lines" };
      }
    }

    return {
      ok: true as const,
      invoiceId: inv.id,
      sensitivityClass: inv.sensitivityClass,
      billingProvider: inv.billingProvider,
      amount: Number(inv.amount ?? 0),
      currency: inv.currency,
      companyId: inv.companyId,
      contactId: inv.contactId,
      reference: inv.reference ?? `Invoice ${inv.id}`,
    };
  });

  if (!prep.ok) {
    res.status(prep.status).json({ error: prep.error });
    return;
  }

  // Approval is CRM-native for every rail: it just finalizes the invoice as
  // `approved` (ready to send). The pay link (Stripe) + email happen in
  // POST /invoices/:id/send. No external accounting system is involved.
  await withRole(req.auth!.role, (tx) =>
    tx.invoice.update({ where: { id: prep.invoiceId }, data: { status: "approved", syncError: null } }),
  );
  res.status(200).json({ invoiceId: prep.invoiceId, status: "approved" });
});

// ---------------------------------------------------------------------------
// Send an invoice — generate the PDF/HTML + email it to the payer with a Stripe
// pay link (billingProvider='stripe') or bank-transfer instructions ('manual').
// Marks the invoice `sent`. Approve first (status must be draft/approved).
// ---------------------------------------------------------------------------
router.post("/invoices/:id/send", authorizeAny([...INVOICE_CLASSES], "write"), async (req, res) => {
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const id = String(req.params.id);

  const prep = await withRole(req.auth!.role, async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) return { ok: false as const, status: 404, error: "invoice_not_found" };
    const cls = invoiceResourceClass(inv.sensitivityClass as BillingSensitivity);
    if (!can(perms, cls, "write")) return { ok: false as const, status: 403, error: "forbidden" };
    if (inv.status !== "draft" && inv.status !== "approved") {
      return { ok: false as const, status: 409, error: `not_sendable: status is ${inv.status}` };
    }
    const party = await buildPartyForInvoice(tx, inv);
    if (!party) return { ok: false as const, status: 400, error: "bill_to_party_unavailable" };
    if (!party.email) return { ok: false as const, status: 400, error: "bill_to_has_no_email" };
    const lineItems = inv.itemized ? await tx.opportunityLineItem.findMany({ where: { invoiceId: inv.id } }) : [];
    const company = inv.companyId
      ? await tx.company.findUnique({ where: { id: inv.companyId }, select: { stripeCustomerId: true } })
      : null;
    return { ok: true as const, inv, party, lineItems, stripeCustomerId: company?.stripeCustomerId ?? null };
  });
  if (!prep.ok) {
    res.status(prep.status).json({ error: prep.error });
    return;
  }

  try {
    const result = await sendInvoiceEmail({
      invoice: prep.inv,
      party: prep.party,
      lineItems: prep.lineItems,
      stripeCustomerId: prep.stripeCustomerId,
    });
    await withRole("INTEGRATION", async (tx) => {
      await tx.invoice.update({
        where: { id: prep.inv.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          syncError: null,
          ...(result.payLinkUrl ? { onlineInvoiceUrl: result.payLinkUrl } : {}),
        },
      });
      await logInvoiceActivity(tx, {
        event: "sent",
        invoiceId: prep.inv.id,
        companyId: prep.inv.companyId,
        contactId: prep.inv.contactId,
        sensitivityClass: prep.inv.sensitivityClass,
        detail: result.emailed ? "emailed" : "no email sent",
      }).catch(() => undefined);
      await writeAudit(tx, {
        actorUserId: req.auth!.userId,
        actorRole: req.auth!.role,
        action: "send",
        resourceClass: invoiceResourceClass(prep.inv.sensitivityClass as BillingSensitivity),
        tableName: "invoices",
        recordId: prep.inv.id,
        after: { status: "sent", emailed: result.emailed },
      }).catch(() => undefined);
    });
    res.status(200).json({ invoiceId: prep.inv.id, status: "sent", payLinkUrl: result.payLinkUrl, emailed: result.emailed });
    return;
  } catch (err) {
    if (err instanceof StripeConfigError) {
      res.status(503).json({ error: "stripe_not_configured", invoiceId: prep.inv.id });
      return;
    }
    res.status(502).json({ error: "invoice_send_failed", detail: (err as Error).message.slice(0, 300), invoiceId: prep.inv.id });
    return;
  }
});

// ---------------------------------------------------------------------------
// Record a payment received against an invoice (bank/check/wire/manual — Stripe
// payments arrive via the webhook). Recomputes amountPaid/Due/status + rollups.
// ---------------------------------------------------------------------------
router.post("/invoices/:id/payments", authorizeAny([...INVOICE_CLASSES], "write"), async (req, res) => {
  const input = PaymentRecordSchema.parse(req.body);
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const id = String(req.params.id);

  const result = await withRole(req.auth!.role, async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) return { status: 404, error: "invoice_not_found" };
    const cls = invoiceResourceClass(inv.sensitivityClass as BillingSensitivity);
    if (!can(perms, cls, "write")) return { status: 403, error: "forbidden" };
    return recordPayment(tx, {
      invoiceId: id,
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt ?? null,
      reference: input.reference ?? null,
      recordedById: req.auth!.userId,
      actorRole: req.auth!.role,
    });
  });
  if (result.status) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json({ invoiceId: id, paid: result.paid, amountPaid: result.amountPaid, amountDue: result.amountDue });
});

// ---------------------------------------------------------------------------
// Dealer credit notes (CRM-native). Issue a credit, apply it against an invoice,
// list them. General sensitivity (rep-visible). RLS gates the rows.
// ---------------------------------------------------------------------------
router.post("/companies/:id/credit-notes", authorize("invoice.general", "write"), async (req, res) => {
  const input = CreditNoteIssueSchema.parse(req.body);
  const companyId = String(req.params.id);
  const result = await withRole(req.auth!.role, async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return { status: 404 as const, error: "company_not_found" };
    return issueCreditNote(tx, {
      companyId,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference ?? null,
      contactId: input.contactId ?? null,
      issuedById: req.auth!.userId,
      actorRole: req.auth!.role,
    });
  });
  if ("status" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json({ creditNoteId: result.id });
});

router.post("/credit-notes/:id/apply", authorize("invoice.general", "write"), async (req, res) => {
  const input = CreditNoteApplySchema.parse(req.body);
  const creditNoteId = String(req.params.id);
  const result = await withRole(req.auth!.role, (tx) =>
    applyCreditNote(tx, {
      creditNoteId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      actorUserId: req.auth!.userId,
      actorRole: req.auth!.role,
    }),
  );
  if (result.status) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(200).json({ creditNoteId, applied: result.applied, invoicePaid: result.invoicePaid, remainingCredit: result.remainingCredit });
});

router.get("/credit-notes", authorize("invoice.general", "read"), async (req, res) => {
  const { cursor, limit } = PaginationQuerySchema.parse(req.query);
  const q = req.query as { companyId?: string; status?: string };
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.creditNote.findMany({
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

// ---------------------------------------------------------------------------
// Studio listing-shoot credits — balance + ledger; grant/consume. company.general.
// ---------------------------------------------------------------------------
router.get("/companies/:id/shoot-credits", authorize("company.general", "read"), async (req, res) => {
  const companyId = String(req.params.id);
  const result = await withRole(req.auth!.role, async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { freeListingShootsEarned: true, freeListingShootsRemaining: true },
    });
    if (!company) return null;
    const ledger = await tx.studioShootCredit.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 200 });
    return {
      balance: {
        earned: Number(company.freeListingShootsEarned ?? 0),
        remaining: Number(company.freeListingShootsRemaining ?? 0),
      },
      ledger,
    };
  });
  if (!result) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }
  res.json(result);
});

router.post("/companies/:id/shoot-credits", authorize("company.general", "write"), async (req, res) => {
  const input = ShootCreditAdjustSchema.parse(req.body);
  const result = await withRole(req.auth!.role, (tx) =>
    adjustShootCredit(tx, {
      companyId: String(req.params.id),
      delta: input.delta,
      reason: input.reason,
      relatedOpportunityId: input.relatedOpportunityId ?? null,
      note: input.note ?? null,
      actorUserId: req.auth!.userId,
      actorRole: req.auth!.role,
    }),
  );
  if (result.status) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json({ companyId: req.params.id, remaining: result.remaining });
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

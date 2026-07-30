import type { Prisma } from "@prisma/client";
import { writeAudit } from "../audit.js";

/**
 * CRM-native dealer credit notes (A2). Issuing a credit increases the dealer's
 * credited + unallocated-credit rollups; applying it against an invoice reduces
 * the invoice's amountDue (marking it `paid` when it hits zero) and draws down the
 * credit's remaining balance + the dealer's unallocated credit. Both run inside a
 * withRole tx. Credit notes are `general` sensitivity (rep-visible).
 */

export interface IssueCreditInput {
  companyId: string;
  amount: number;
  currency: string;
  reference?: string | null;
  contactId?: string | null;
  issuedById?: string | null;
  actorRole?: string | null;
}

export async function issueCreditNote(
  tx: Prisma.TransactionClient,
  input: IssueCreditInput,
): Promise<{ id: string }> {
  const cn = await tx.creditNote.create({
    data: {
      companyId: input.companyId,
      contactId: input.contactId ?? null,
      amount: input.amount,
      remainingCredit: input.amount,
      status: "open",
      currency: input.currency,
      reference: input.reference ?? null,
      sensitivityClass: "general",
      issuedById: input.issuedById ?? null,
    },
  });

  await tx.$executeRaw`
    UPDATE companies
       SET total_amount_credited   = COALESCE(total_amount_credited, 0) + ${input.amount},
           total_unallocated_credit = COALESCE(total_unallocated_credit, 0) + ${input.amount}
     WHERE id = ${input.companyId}`;

  await writeAudit(tx, {
    actorUserId: input.issuedById ?? null,
    actorRole: input.actorRole ?? "ADMIN",
    action: "create",
    resourceClass: "invoice.general",
    tableName: "credit_notes",
    recordId: cn.id,
    after: { companyId: input.companyId, amount: input.amount, status: "open" },
  });

  return { id: cn.id };
}

export interface ApplyCreditInput {
  creditNoteId: string;
  invoiceId: string;
  amount?: number;
  actorUserId?: string | null;
  actorRole?: string | null;
}

export interface ApplyCreditResult {
  status?: number;
  error?: string;
  applied?: number;
  invoicePaid?: boolean;
  remainingCredit?: number;
}

export async function applyCreditNote(
  tx: Prisma.TransactionClient,
  input: ApplyCreditInput,
): Promise<ApplyCreditResult> {
  const cn = await tx.creditNote.findUnique({ where: { id: input.creditNoteId } });
  if (!cn) return { status: 404, error: "credit_note_not_found" };
  if (cn.status === "void") return { status: 409, error: "credit_note_void" };
  const remaining = Number(cn.remainingCredit ?? 0);
  if (remaining <= 0) return { status: 409, error: "credit_note_exhausted" };

  const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice) return { status: 404, error: "invoice_not_found" };
  if (cn.companyId && invoice.companyId && cn.companyId !== invoice.companyId) {
    return { status: 400, error: "credit_company_mismatch" };
  }

  const due = Number(invoice.amountDue ?? invoice.amount ?? 0);
  const applied = Math.min(input.amount ?? remaining, remaining, due);
  if (applied <= 0) return { status: 409, error: "nothing_to_apply" };

  const newDue = Math.max(due - applied, 0);
  const newRemaining = remaining - applied;
  const invoicePaid = newDue <= 0;

  await tx.invoice.update({
    where: { id: invoice.id },
    data: { amountDue: newDue, ...(invoicePaid ? { status: "paid" } : {}) },
  });
  await tx.creditNote.update({
    where: { id: cn.id },
    data: {
      remainingCredit: newRemaining,
      appliedToInvoiceId: invoice.id,
      status: newRemaining <= 0 ? "applied" : "open",
    },
  });
  if (cn.companyId) {
    await tx.$executeRaw`
      UPDATE companies
         SET total_unallocated_credit = GREATEST(COALESCE(total_unallocated_credit, 0) - ${applied}, 0)
       WHERE id = ${cn.companyId}`;
  }

  await writeAudit(tx, {
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? "ADMIN",
    action: "credit_applied",
    resourceClass: "invoice.general",
    tableName: "credit_notes",
    recordId: cn.id,
    after: { invoiceId: invoice.id, applied, remainingCredit: newRemaining, invoicePaid },
  });

  return { applied, invoicePaid, remainingCredit: newRemaining };
}

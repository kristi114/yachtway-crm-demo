import type { Prisma } from "@prisma/client";
import { writeAudit } from "../audit.js";

/**
 * Studio listing-shoot credits (A4) — a non-monetary per-shoot ledger. Granting a
 * credit (+n) or consuming one (-1 per shoot) appends a StudioShootCredit row and
 * rolls the dealer's Company balance (free_listing_shoots_earned only accumulates on
 * grants; remaining moves both ways, floored at 0). company.general sensitivity.
 */
export interface AdjustShootCreditInput {
  companyId: string;
  delta: number;
  reason: string;
  relatedOpportunityId?: string | null;
  note?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
}

export interface AdjustShootCreditResult {
  status?: number;
  error?: string;
  remaining?: number;
}

export async function adjustShootCredit(
  tx: Prisma.TransactionClient,
  input: AdjustShootCreditInput,
): Promise<AdjustShootCreditResult> {
  const company = await tx.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, freeListingShootsRemaining: true },
  });
  if (!company) return { status: 404, error: "company_not_found" };

  const current = Number(company.freeListingShootsRemaining ?? 0);
  if (input.delta < 0 && current + input.delta < 0) {
    return { status: 409, error: "insufficient_shoot_credits" };
  }

  await tx.studioShootCredit.create({
    data: {
      companyId: input.companyId,
      delta: input.delta,
      reason: input.reason,
      relatedOpportunityId: input.relatedOpportunityId ?? null,
      note: input.note ?? null,
      createdById: input.actorUserId ?? null,
    },
  });

  if (input.delta > 0) {
    await tx.$executeRaw`
      UPDATE companies
         SET free_listing_shoots_earned    = COALESCE(free_listing_shoots_earned, 0) + ${input.delta},
             free_listing_shoots_remaining = COALESCE(free_listing_shoots_remaining, 0) + ${input.delta}
       WHERE id = ${input.companyId}`;
  } else {
    await tx.$executeRaw`
      UPDATE companies
         SET free_listing_shoots_remaining = GREATEST(COALESCE(free_listing_shoots_remaining, 0) + ${input.delta}, 0)
       WHERE id = ${input.companyId}`;
  }
  const remaining = Math.max(current + input.delta, 0);

  await writeAudit(tx, {
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? "ADMIN",
    action: input.delta > 0 ? "shoot_credit_grant" : "shoot_credit_consume",
    resourceClass: "company.general",
    tableName: "studio_shoot_credits",
    recordId: input.companyId,
    after: { delta: input.delta, remaining, reason: input.reason },
  });

  return { remaining };
}

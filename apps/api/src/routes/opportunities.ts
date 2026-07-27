import type { Prisma } from "@prisma/client";
import { Router } from "express";
import {
  can,
  CLOSED_STATUSES,
  type EffectivePermissions,
  OpportunityCreateSchema,
  OpportunityUpdateSchema,
  PaginationQuerySchema,
  type ResourceClass,
  StageChangeSchema,
} from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { loadEffectivePermissions } from "../permissions/service.js";

/**
 * Opportunities + pipelines (Phase 3).
 *
 * The opportunities table intentionally has no row-RLS (sensitive financials
 * live in the RLS-protected EasyFundLoan / MasterCoverApplication satellites).
 * Financing *pipelines* (sensitivityClass easyfund/mastercover) are instead
 * hidden at this API layer: a caller without the matching grant never sees those
 * opportunity rows, cannot open them (404, not 403 — existence isn't leaked),
 * and cannot create/advance into them. Every route still gates on
 * `opportunity.general` and runs inside withRole so RLS backs the stage-history
 * and reference tables.
 */
const router: Router = Router();
router.use(authContext);

/** Handler outcome from inside a withRole transaction — an explicit discriminant
 *  keeps the error status a definite number regardless of Prisma row inference. */
type Outcome<T> = { ok: true; row: T } | { ok: false; status: number; body: { error: string } };
const fail = (status: number, error: string): Outcome<never> => ({ ok: false, status, body: { error } });

const SENSITIVE_CLASSES = ["easyfund", "mastercover"] as const;

/** Sensitivity classes the caller may NOT read (used to filter opportunity rows). */
function blockedSensitivities(perms: EffectivePermissions): string[] {
  return SENSITIVE_CLASSES.filter((c) => !can(perms, c as ResourceClass, "read"));
}

/** where-fragment that drops opportunities in financing pipelines the caller can't see. */
function sensitivityWhere(blocked: string[]): Prisma.OpportunityWhereInput {
  if (blocked.length === 0) return {};
  return {
    OR: [
      { pipelineId: null },
      { pipeline: { is: { sensitivityClass: null } } },
      { pipeline: { is: { sensitivityClass: { notIn: blocked } } } },
    ],
  };
}

const pipelineInclude = {
  pipeline: { select: { id: true, key: true, name: true, sensitivityClass: true } },
  stageRecord: { select: { id: true, key: true, name: true, position: true, isClosed: true, isWon: true } },
} satisfies Prisma.OpportunityInclude;

// ---------------------------------------------------------------------------
// Pipelines (reference) — financing pipelines hidden from callers without grant
// ---------------------------------------------------------------------------
router.get("/pipelines", authorize("opportunity.general", "read"), async (req, res) => {
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const blocked = blockedSensitivities(perms);
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.pipeline.findMany({
      where: {
        isActive: true,
        ...(blocked.length ? { OR: [{ sensitivityClass: null }, { sensitivityClass: { notIn: blocked } }] } : {}),
      },
      orderBy: { displayOrder: "asc" },
      include: { stages: { orderBy: { position: "asc" } } },
    }),
  );
  res.json({ data: rows, nextCursor: null });
});

// ---------------------------------------------------------------------------
// Opportunities CRUD
// ---------------------------------------------------------------------------
router.get("/opportunities", authorize("opportunity.general", "read"), async (req, res) => {
  const { cursor, limit } = PaginationQuerySchema.parse(req.query);
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const where = sensitivityWhere(blockedSensitivities(perms));
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.opportunity.findMany({
      where,
      take: limit + 1,
      orderBy: { id: "desc" },
      include: pipelineInclude,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  res.json({ data, nextCursor: hasMore ? data[data.length - 1]!.id : null });
});

router.get("/opportunities/:id", authorize("opportunity.general", "read"), async (req, res) => {
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const blocked = blockedSensitivities(perms);
  const row = await withRole(req.auth!.role, (tx) =>
    tx.opportunity.findUnique({ where: { id: String(req.params.id) }, include: pipelineInclude }),
  );
  // 404 (not 403) when the row is in a blocked financing pipeline — don't leak existence.
  if (!row || (row.pipeline?.sensitivityClass && blocked.includes(row.pipeline.sensitivityClass))) {
    res.status(404).json({ error: "opportunity_not_found" });
    return;
  }
  res.json(row);
});

router.post("/opportunities", authorize("opportunity.general", "write"), async (req, res) => {
  const data = OpportunityCreateSchema.parse(req.body) satisfies Prisma.OpportunityUncheckedCreateInput;
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);

  const result = await withRole(req.auth!.role, async (tx) => {
    let pipeline = null;
    if (data.pipelineId) {
      pipeline = await tx.pipeline.findUnique({ where: { id: data.pipelineId } });
      if (!pipeline) return fail(400, "pipeline_not_found");
      if (pipeline.sensitivityClass && !can(perms, pipeline.sensitivityClass as ResourceClass, "write")) {
        return fail(403, `forbidden: cannot create in ${pipeline.key}`);
      }
    }
    // EasyFund/MasterCover opportunities are auto-owned by the FINTECH role.
    if (pipeline?.sensitivityClass === "easyfund" || pipeline?.sensitivityClass === "mastercover") {
      data.ownerRole = "FINTECH";
      data.ownerId = null;
    }
    const row = await tx.opportunity.create({ data, include: pipelineInclude });
    return { ok: true as const, row };
  });

  if (!result.ok) {
    res.status(result.status).json(result.body);
    return;
  }
  res.status(201).json(result.row);
});

router.patch("/opportunities/:id", authorize("opportunity.general", "write"), async (req, res) => {
  const data = OpportunityUpdateSchema.parse(req.body) satisfies Prisma.OpportunityUncheckedUpdateInput;
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const blocked = blockedSensitivities(perms);

  const result = await withRole(req.auth!.role, async (tx) => {
    const existing = await tx.opportunity.findUnique({
      where: { id: String(req.params.id) },
      include: { pipeline: { select: { sensitivityClass: true } } },
    });
    if (!existing || (existing.pipeline?.sensitivityClass && blocked.includes(existing.pipeline.sensitivityClass))) {
      return fail(404, "opportunity_not_found");
    }
    const row = await tx.opportunity.update({
      where: { id: String(req.params.id) },
      data,
      include: pipelineInclude,
    });
    return { ok: true as const, row };
  });

  if (!result.ok) {
    res.status(result.status).json(result.body);
    return;
  }
  res.json(result.row);
});

// ---------------------------------------------------------------------------
// Stage move — the source of the velocity/conversion signal. Atomic: validates
// the target stage against the pipeline, updates the opportunity, and appends a
// history row, all in one transaction under the caller's role.
// ---------------------------------------------------------------------------
router.post("/opportunities/:id/stage", authorize("opportunity.general", "write"), async (req, res) => {
  const input = StageChangeSchema.parse(req.body);
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const blocked = blockedSensitivities(perms);

  const result = await withRole(req.auth!.role, async (tx) => {
    const opp = await tx.opportunity.findUnique({
      where: { id: String(req.params.id) },
      include: { pipeline: { select: { sensitivityClass: true } }, stageRecord: true },
    });
    if (!opp || (opp.pipeline?.sensitivityClass && blocked.includes(opp.pipeline.sensitivityClass))) {
      return fail(404, "opportunity_not_found");
    }

    const target = await tx.pipelineStage.findUnique({
      where: { id: input.toStageId },
      include: { pipeline: { select: { id: true, key: true, sensitivityClass: true } } },
    });
    if (!target) return fail(400, "stage_not_found");

    // Stage must belong to the opportunity's pipeline (or set it on first move).
    if (opp.pipelineId && opp.pipelineId !== target.pipelineId) {
      return fail(400, "stage_not_in_pipeline");
    }
    // Moving into a financing pipeline requires that pipeline's write grant.
    if (target.pipeline.sensitivityClass && !can(perms, target.pipeline.sensitivityClass as ResourceClass, "write")) {
      return fail(403, `forbidden: cannot advance ${target.pipeline.key}`);
    }

    // Reaching the terminal (Closed) stage forces a closed status. Outcome lives
    // on status, not the stage — so a close is invalid without Won/Lost/Abandoned.
    if (target.isClosed && !(CLOSED_STATUSES as readonly string[]).includes(input.opportunityStatus ?? "")) {
      return fail(400, "status_required_on_close: opportunityStatus must be Won, Lost, or Abandoned");
    }

    const now = new Date();
    const row = await tx.opportunity.update({
      where: { id: opp.id },
      data: {
        pipelineId: target.pipelineId,
        stageId: target.id,
        stage: target.name,
        lastStageChangeDate: now,
        ...(input.lostReason !== undefined ? { lostReason: input.lostReason } : {}),
        ...(input.opportunityStatus !== undefined ? { opportunityStatus: input.opportunityStatus } : {}),
      },
      include: pipelineInclude,
    });

    await tx.opportunityStageHistory.create({
      data: {
        opportunityId: opp.id,
        pipelineId: target.pipelineId,
        fromStageId: opp.stageId ?? null,
        toStageId: target.id,
        fromStage: opp.stageRecord?.name ?? opp.stage ?? null,
        toStage: target.name,
        changedById: req.auth!.userId,
        changedByRole: req.auth!.role,
        note: input.note ?? null,
        changedAt: now,
      },
    });

    return { ok: true as const, row };
  });

  if (!result.ok) {
    res.status(result.status).json(result.body);
    return;
  }
  res.json(result.row);
});

router.get("/opportunities/:id/history", authorize("opportunity.general", "read"), async (req, res) => {
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const blocked = blockedSensitivities(perms);
  const rows = await withRole(req.auth!.role, async (tx) => {
    const opp = await tx.opportunity.findUnique({
      where: { id: String(req.params.id) },
      include: { pipeline: { select: { sensitivityClass: true } } },
    });
    if (!opp || (opp.pipeline?.sensitivityClass && blocked.includes(opp.pipeline.sensitivityClass))) {
      return null;
    }
    return tx.opportunityStageHistory.findMany({
      where: { opportunityId: opp.id },
      orderBy: { changedAt: "desc" },
    });
  });
  if (rows === null) {
    res.status(404).json({ error: "opportunity_not_found" });
    return;
  }
  res.json({ data: rows, nextCursor: null });
});

export default router;

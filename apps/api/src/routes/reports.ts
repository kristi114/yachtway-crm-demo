import type { Prisma } from "@prisma/client";
import { Router } from "express";
import {
  type AttributionRow,
  can,
  type DealerEngagement,
  type DealerRollups,
  type EasyFundFunnel,
  type EasyFundFunnelStage,
  type EffectivePermissions,
  type PipelineMetric,
  PipelineReportQuerySchema,
  type ResourceClass,
  type StageMetric,
  type StudioReport,
  type StudioStage,
} from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { loadEffectivePermissions } from "../permissions/service.js";

/**
 * Reporting (Phase 5). Permission-aware aggregates: gated on `opportunity.general`
 * and, like the opportunities routes, EasyFund/MasterCover pipelines are excluded
 * for callers without the matching grant — so a rep's pipeline report never
 * includes financing totals. Metrics are computed live from the Phase-3
 * opportunity + pipeline-stage data (no materialized view yet).
 */
const router: Router = Router();
router.use(authContext);

const SENSITIVE_CLASSES = ["easyfund", "mastercover"] as const;

function blockedSensitivities(perms: EffectivePermissions): string[] {
  return SENSITIVE_CLASSES.filter((c) => !can(perms, c as ResourceClass, "read"));
}

/** where-fragment dropping opportunities in financing pipelines the caller can't see. */
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

const num = (d: Prisma.Decimal | null | undefined): number => Number(d ?? 0);

type Outcome = "won" | "lost" | "open";
/**
 * Opportunity.status → outcome bucket (case-insensitive; null/unknown = open).
 * Abandoned is counted as Lost per business rule.
 */
function classifyStatus(status: string | null | undefined): Outcome {
  switch ((status ?? "").trim().toLowerCase()) {
    case "won":
      return "won";
    case "lost":
    case "abandoned":
      return "lost";
    default:
      return "open";
  }
}

router.get("/reports/pipelines", authorize("opportunity.general", "read"), async (req, res) => {
  const q = PipelineReportQuerySchema.parse(req.query);
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const blocked = blockedSensitivities(perms);

  const report = await withRole(req.auth!.role, async (tx) => {
    // Pipelines the caller may see (financing pipelines filtered by grant).
    const pipelines = await tx.pipeline.findMany({
      where: {
        isActive: true,
        ...(q.pipelineId ? { id: q.pipelineId } : {}),
        ...(blocked.length
          ? { OR: [{ sensitivityClass: null }, { sensitivityClass: { notIn: blocked } }] }
          : {}),
      },
      orderBy: { displayOrder: "asc" },
      include: { stages: { orderBy: { position: "asc" } } },
    });

    // Count all active pipelines to report how many sensitive ones were hidden.
    const totalActive = await tx.pipeline.count({ where: { isActive: true } });
    const hiddenSensitivePipelines = blocked.length ? totalActive - pipelines.length : 0;

    if (pipelines.length === 0) {
      return { data: [], hiddenSensitivePipelines };
    }

    // One grouped pass over opportunities: count + summed amount per (pipeline, stage).
    const createdFilter =
      q.createdFrom || q.createdTo
        ? {
            createdDate: {
              ...(q.createdFrom ? { gte: new Date(q.createdFrom) } : {}),
              ...(q.createdTo ? { lte: new Date(q.createdTo) } : {}),
            },
          }
        : {};
    const where: Prisma.OpportunityWhereInput = {
      pipelineId: { in: pipelines.map((p) => p.id) },
      ...(q.ownerId ? { ownerId: q.ownerId } : {}),
      ...createdFilter,
    };

    // Funnel volume per (pipeline, stage) — describes WHERE deals sit.
    const stageGrouped = await tx.opportunity.groupBy({
      by: ["pipelineId", "stageId"],
      where,
      _count: { _all: true },
      _sum: { opportunityAmount: true },
    });
    // Outcome per (pipeline, status) — describes the RESULT (won/lost/abandoned).
    const statusGrouped = await tx.opportunity.groupBy({
      by: ["pipelineId", "opportunityStatus"],
      where,
      _count: { _all: true },
      _sum: { opportunityAmount: true },
    });

    const byStage = new Map<string, { count: number; value: number }>();
    for (const g of stageGrouped) {
      if (!g.stageId) continue;
      byStage.set(g.stageId, { count: g._count._all, value: num(g._sum.opportunityAmount) });
    }

    // pipelineId -> outcome bucket -> {count, value} (abandoned folds into lost)
    const emptyBuckets = (): Record<Outcome, { count: number; value: number }> => ({
      won: { count: 0, value: 0 },
      lost: { count: 0, value: 0 },
      open: { count: 0, value: 0 },
    });
    const byPipelineOutcome = new Map<string, Record<Outcome, { count: number; value: number }>>();
    for (const g of statusGrouped) {
      if (!g.pipelineId) continue;
      const bucket = byPipelineOutcome.get(g.pipelineId) ?? emptyBuckets();
      const o = classifyStatus(g.opportunityStatus);
      bucket[o].count += g._count._all;
      bucket[o].value += num(g._sum.opportunityAmount);
      byPipelineOutcome.set(g.pipelineId, bucket);
    }

    const data: PipelineMetric[] = pipelines.map((p) => {
      const stages: StageMetric[] = p.stages.map((s) => {
        const agg = byStage.get(s.id) ?? { count: 0, value: 0 };
        return {
          stageId: s.id,
          key: s.key,
          name: s.name,
          position: s.position,
          isClosed: s.isClosed,
          count: agg.count,
          value: agg.value,
        };
      });

      const b = byPipelineOutcome.get(p.id) ?? emptyBuckets();
      const decided = b.won.count + b.lost.count; // lost already includes abandoned

      return {
        pipelineId: p.id,
        key: p.key,
        name: p.name,
        sensitivityClass: p.sensitivityClass ?? null,
        openCount: b.open.count,
        openValue: b.open.value,
        wonCount: b.won.count,
        wonValue: b.won.value,
        lostCount: b.lost.count,
        conversionRate: decided > 0 ? b.won.count / decided : null,
        stages,
      };
    });

    return { data, hiddenSensitivePipelines };
  });

  res.json(report);
});

/**
 * Dealer roll-ups — the "Derived / computed" Company fields calculated live from
 * the dealer's listings (see DEALER_ROLLUP_DEFS for the formula of each). Gated on
 * company.general read; companies RLS is the backstop, so a role that can't read
 * the company can't read its roll-ups either. Read-only: this does not overwrite
 * the stored Company columns (materializing them back is a separate decision).
 */
router.get("/reports/dealers/:companyId/rollups", authorize("company.general", "read"), async (req, res) => {
  const companyId = String(req.params.companyId);

  const result = await withRole(req.auth!.role, async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return null;

    const [agg, soldListings, listingsW3dTour] = await Promise.all([
      tx.listing.aggregate({
        where: { companyId },
        _count: { _all: true },
        _sum: {
          viewsTotal: true,
          views30d: true,
          inquiriesTotal: true,
          numberOfLiveStreams: true,
          socialReach: true,
        },
        _avg: { photoCount: true },
      }),
      // sold-status match is case-insensitive + substring so it survives values
      // like "Sold", "SOLD", "Sold - pending paperwork".
      tx.listing.count({ where: { companyId, salesStatus: { contains: "sold", mode: "insensitive" } } }),
      tx.listing.count({ where: { companyId, has3dTour: true } }),
    ]);

    const listingsAllTime = agg._count._all;

    const rollups: DealerRollups = {
      companyId,
      listingsAllTime,
      soldListings,
      activeListings: Math.max(listingsAllTime - soldListings, 0),
      listingsW3dTour,
      listingViewsAllTime: num(agg._sum.viewsTotal),
      listingViews30d: num(agg._sum.views30d),
      inquiriesAllTime: num(agg._sum.inquiriesTotal),
      liveStreamsDone: num(agg._sum.numberOfLiveStreams),
      socialReachToDate: num(agg._sum.socialReach),
      avgListingPhotoCount: listingsAllTime > 0 ? num(agg._avg.photoCount) : null,
    };
    return rollups;
  });

  if (!result) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }
  res.json(result);
});

/**
 * UTM source attribution — opportunities grouped by (utm_source, utm_medium)
 * with pipeline value and won value. Sensitivity-filtered: a rep's attribution
 * never includes EasyFund/MasterCover deals.
 */
router.get("/reports/attribution", authorize("opportunity.general", "read"), async (req, res) => {
  const perms = await loadEffectivePermissions(req.auth!.userId, req.auth!.role);
  const base = sensitivityWhere(blockedSensitivities(perms));

  const rows = await withRole(req.auth!.role, async (tx) => {
    const [totals, won] = await Promise.all([
      tx.opportunity.groupBy({
        by: ["utmSource", "utmMedium"],
        where: base,
        _count: { _all: true },
        _sum: { opportunityAmount: true },
      }),
      tx.opportunity.groupBy({
        by: ["utmSource", "utmMedium"],
        where: { AND: [base, { opportunityStatus: { equals: "Won", mode: "insensitive" } }] },
        _count: { _all: true },
        _sum: { opportunityAmount: true },
      }),
    ]);

    const wonKey = new Map<string, { count: number; value: number }>();
    for (const w of won) {
      wonKey.set(`${w.utmSource ?? ""}|${w.utmMedium ?? ""}`, {
        count: w._count._all,
        value: num(w._sum.opportunityAmount),
      });
    }

    const data: AttributionRow[] = totals.map((t) => {
      const w = wonKey.get(`${t.utmSource ?? ""}|${t.utmMedium ?? ""}`);
      return {
        source: t.utmSource ?? "(unattributed)",
        medium: t.utmMedium ?? "(none)",
        count: t._count._all,
        value: num(t._sum.opportunityAmount),
        wonCount: w?.count ?? 0,
        wonValue: w?.value ?? 0,
      };
    });
    // biggest contributors first
    data.sort((a, b) => b.value - a.value || b.count - a.count);
    return data;
  });

  res.json({ data: rows });
});

/**
 * EasyFund referral funnel — FINTECH/ADMIN only (gated on the `easyfund` grant).
 * Per-stage counts of EasyFund opportunities plus the financing amounts from the
 * RLS-protected EasyFundLoan satellite (loan amount, amount from lender), which
 * the general pipeline report deliberately never exposes.
 */
router.get("/reports/easyfund-funnel", authorize("easyfund", "read"), async (req, res) => {
  const funnel = await withRole(req.auth!.role, async (tx) => {
    const pipeline = await tx.pipeline.findUnique({
      where: { key: "easyfund" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    if (!pipeline) {
      return {
        pipelineId: null,
        totalReferrals: 0,
        closedReferrals: 0,
        closedAmount: 0,
        dealerReferralBonusTotal: 0,
        conversionRate: null,
        stages: [],
      } satisfies EasyFundFunnel;
    }

    const opps = await tx.opportunity.findMany({
      where: { pipelineId: pipeline.id },
      select: {
        stageId: true,
        opportunityStatus: true,
        easyFundLoan: {
          select: { loanAmount: true, amountFromLender: true, dealerReferralBonus: true },
        },
      },
    });

    const byStage = new Map<string, { count: number; loanAmount: number; amountFromLender: number }>();
    let dealerReferralBonusTotal = 0;
    let closedReferrals = 0; // status = Won
    let closedAmount = 0; // amount_from_lender on Won referrals
    let decided = 0; // Won + Lost + Abandoned
    for (const o of opps) {
      dealerReferralBonusTotal += num(o.easyFundLoan?.dealerReferralBonus);
      const outcome = classifyStatus(o.opportunityStatus);
      if (outcome === "won") {
        closedReferrals += 1;
        closedAmount += num(o.easyFundLoan?.amountFromLender);
      }
      if (outcome !== "open") decided += 1;
      if (!o.stageId) continue;
      const cur = byStage.get(o.stageId) ?? { count: 0, loanAmount: 0, amountFromLender: 0 };
      cur.count += 1;
      cur.loanAmount += num(o.easyFundLoan?.loanAmount);
      cur.amountFromLender += num(o.easyFundLoan?.amountFromLender);
      byStage.set(o.stageId, cur);
    }

    const stages: EasyFundFunnelStage[] = pipeline.stages.map((s) => {
      const agg = byStage.get(s.id) ?? { count: 0, loanAmount: 0, amountFromLender: 0 };
      return {
        stageId: s.id,
        key: s.key,
        name: s.name,
        position: s.position,
        isClosed: s.isClosed,
        count: agg.count,
        loanAmount: agg.loanAmount,
        amountFromLender: agg.amountFromLender,
      };
    });

    return {
      pipelineId: pipeline.id,
      totalReferrals: opps.length,
      closedReferrals,
      closedAmount,
      dealerReferralBonusTotal,
      conversionRate: decided > 0 ? closedReferrals / decided : null,
      stages,
    } satisfies EasyFundFunnel;
  });

  res.json(funnel);
});

/**
 * Studio bookings + revenue — bookings funnel across the Studio pipeline plus the
 * service revenue collected (sum of studio_details.amount_paid). Studio is a
 * general (non-financing) pipeline, so gated on opportunity.general.
 */
router.get("/reports/studio", authorize("opportunity.general", "read"), async (req, res) => {
  const report = await withRole(req.auth!.role, async (tx) => {
    const pipeline = await tx.pipeline.findUnique({
      where: { key: "studio" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    if (!pipeline) {
      return {
        pipelineId: null,
        bookings: 0,
        revenueCollected: 0,
        avgAmountPaid: null,
        atBoatShowCount: 0,
        stages: [],
      } satisfies StudioReport;
    }

    const opps = await tx.opportunity.findMany({
      where: { pipelineId: pipeline.id },
      select: { stageId: true, studioDetail: { select: { amountPaid: true, atBoatShow: true } } },
    });

    const byStage = new Map<string, number>();
    let revenueCollected = 0;
    let paidCount = 0;
    let atBoatShowCount = 0;
    for (const o of opps) {
      if (o.stageId) byStage.set(o.stageId, (byStage.get(o.stageId) ?? 0) + 1);
      const paid = o.studioDetail?.amountPaid;
      if (paid != null) {
        revenueCollected += num(paid);
        paidCount += 1;
      }
      if (o.studioDetail?.atBoatShow) atBoatShowCount += 1;
    }

    const stages: StudioStage[] = pipeline.stages.map((s) => ({
      stageId: s.id,
      key: s.key,
      name: s.name,
      position: s.position,
      isClosed: s.isClosed,
      count: byStage.get(s.id) ?? 0,
    }));

    return {
      pipelineId: pipeline.id,
      bookings: opps.length,
      revenueCollected,
      avgAmountPaid: paidCount > 0 ? revenueCollected / paidCount : null,
      atBoatShowCount,
      stages,
    } satisfies StudioReport;
  });

  res.json(report);
});

/**
 * Dealer engagement — rolled up from the dealer's contacts (brokers). Gated on
 * contact.general; contacts RLS backs it.
 */
router.get("/reports/dealers/:companyId/engagement", authorize("contact.general", "read"), async (req, res) => {
  const companyId = String(req.params.companyId);

  const result = await withRole(req.auth!.role, async (tx) => {
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) return null;

    const [agg, activeContacts30d] = await Promise.all([
      tx.contact.aggregate({
        where: { companyId },
        _count: { _all: true },
        _sum: { sessions30d: true, totalLogins: true },
        _avg: { buyerIntentScore: true },
      }),
      tx.contact.count({ where: { companyId, logins30d: { gt: 0 } } }),
    ]);

    const engagement: DealerEngagement = {
      companyId,
      contactCount: agg._count._all,
      activeContacts30d,
      totalSessions30d: num(agg._sum.sessions30d),
      totalLogins: num(agg._sum.totalLogins),
      avgBuyerIntentScore: agg._avg.buyerIntentScore != null ? num(agg._avg.buyerIntentScore) : null,
    };
    return engagement;
  });

  if (!result) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }
  res.json(result);
});

export default router;

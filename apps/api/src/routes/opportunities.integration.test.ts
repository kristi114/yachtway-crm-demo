import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Phase 3 exit proof over HTTP:
 *   - a rep works a general deal end-to-end and stage history accrues;
 *   - an EasyFund (financing) pipeline is invisible to a rep — filtered from the
 *     list, 404 on direct fetch — while Fintech/Admin see and advance it.
 * Full stack: dev auth -> authorize(opportunity.general) -> withRole -> RLS +
 * API-layer sensitivity filter. Requires the local DB and `pnpm db:setup` (so
 * the 13 pipelines are seeded). Excluded from the default unit suite.
 */
const app = createApp();

const GEN_OPP = "itest_opp_general";
const EF_OPP = "itest_opp_easyfund";

let dealerStages: { id: string; key: string }[] = [];
let easycloseFirstStageId = "";
let easyfundStages: { id: string; key: string }[] = [];

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    const dealer = await tx.pipeline.findUnique({
      where: { key: "dealers" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const easyclose = await tx.pipeline.findUnique({
      where: { key: "easyclose" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const easyfund = await tx.pipeline.findUnique({
      where: { key: "easyfund" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    if (!dealer || !easyclose || !easyfund) {
      throw new Error("pipelines not seeded — run `pnpm db:setup` before integration tests");
    }
    dealerStages = dealer.stages.map((s) => ({ id: s.id, key: s.key }));
    easycloseFirstStageId = easyclose.stages[0]!.id;
    easyfundStages = easyfund.stages.map((s) => ({ id: s.id, key: s.key }));

    await tx.$executeRaw`
      INSERT INTO opportunities (id, name, pipeline_id, stage_id, stage, created_at, updated_at)
      VALUES (${GEN_OPP}, 'Dealer deal', ${dealer.id}, ${dealerStages[0]!.id}, ${dealer.stages[0]!.name}, now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO opportunities (id, name, pipeline_id, stage_id, stage, created_at, updated_at)
      VALUES (${EF_OPP}, 'Loan deal', ${easyfund.id}, ${easyfundStages[0]!.id}, ${easyfund.stages[0]!.name}, now(), now())
      ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM opportunity_stage_history WHERE opportunity_id IN (${GEN_OPP}, ${EF_OPP})`;
    await tx.$executeRaw`DELETE FROM opportunities WHERE id IN (${GEN_OPP}, ${EF_OPP})`;
  });
  await prisma.$disconnect();
});

describe("Opportunities + pipelines (HTTP)", () => {
  it("unauthenticated gets 401", async () => {
    await request(app).get("/opportunities").expect(401);
  });

  it("SALES_REP list excludes EasyFund (financing) opportunities", async () => {
    const res = await request(app).get("/opportunities").set("x-crm-role", "SALES_REP").expect(200);
    const ids = res.body.data.map((o: { id: string }) => o.id);
    expect(ids).toContain(GEN_OPP);
    expect(ids).not.toContain(EF_OPP);
  });

  it("SALES_REP gets 404 (not 403) opening an EasyFund opportunity — existence not leaked", async () => {
    await request(app).get(`/opportunities/${EF_OPP}`).set("x-crm-role", "SALES_REP").expect(404);
  });

  it("FINTECH can open the EasyFund opportunity", async () => {
    const res = await request(app).get(`/opportunities/${EF_OPP}`).set("x-crm-role", "FINTECH").expect(200);
    expect(res.body.id).toBe(EF_OPP);
    expect(res.body.pipeline.sensitivityClass).toBe("easyfund");
  });

  it("GET /pipelines hides financing pipelines from SALES_REP but shows them to ADMIN", async () => {
    const rep = await request(app).get("/pipelines").set("x-crm-role", "SALES_REP").expect(200);
    const repKeys = rep.body.data.map((p: { key: string }) => p.key);
    expect(repKeys).toContain("dealers");
    expect(repKeys).not.toContain("easyfund");
    expect(repKeys).not.toContain("mastercover");

    const admin = await request(app).get("/pipelines").set("x-crm-role", "ADMIN").expect(200);
    const adminKeys = admin.body.data.map((p: { key: string }) => p.key);
    expect(adminKeys).toContain("easyfund");
    expect(adminKeys.length).toBeGreaterThanOrEqual(12);
  });

  it("SALES_REP advances a general deal and stage history accrues", async () => {
    // move to stage[1], then stage[2]
    const first = await request(app)
      .post(`/opportunities/${GEN_OPP}/stage`)
      .set("x-crm-role", "SALES_REP")
      .send({ toStageId: dealerStages[1]!.id, note: "made contact" })
      .expect(200);
    expect(first.body.stageId).toBe(dealerStages[1]!.id);

    await request(app)
      .post(`/opportunities/${GEN_OPP}/stage`)
      .set("x-crm-role", "SALES_REP")
      .send({ toStageId: dealerStages[2]!.id })
      .expect(200);

    const hist = await request(app)
      .get(`/opportunities/${GEN_OPP}/history`)
      .set("x-crm-role", "SALES_REP")
      .expect(200);
    expect(hist.body.data).toHaveLength(2);
    // most-recent first
    expect(hist.body.data[0].toStageId).toBe(dealerStages[2]!.id);
    expect(hist.body.data[0].fromStageId).toBe(dealerStages[1]!.id);
    expect(hist.body.data[1].changedByRole).toBe("SALES_REP");
    expect(hist.body.data[1].note).toBe("made contact");
  });

  it("rejects a stage from a different pipeline (400)", async () => {
    const res = await request(app)
      .post(`/opportunities/${GEN_OPP}/stage`)
      .set("x-crm-role", "SALES_REP")
      .send({ toStageId: easycloseFirstStageId })
      .expect(400);
    expect(res.body.error).toBe("stage_not_in_pipeline");
  });

  it("SALES_REP cannot advance an EasyFund opportunity (404 — invisible)", async () => {
    await request(app)
      .post(`/opportunities/${EF_OPP}/stage`)
      .set("x-crm-role", "SALES_REP")
      .send({ toStageId: easyfundStages[1]!.id })
      .expect(404);
  });

  it("FINTECH advances the EasyFund opportunity and history records the role", async () => {
    await request(app)
      .post(`/opportunities/${EF_OPP}/stage`)
      .set("x-crm-role", "FINTECH")
      .send({ toStageId: easyfundStages[1]!.id, note: "no reply" })
      .expect(200);
    const hist = await request(app)
      .get(`/opportunities/${EF_OPP}/history`)
      .set("x-crm-role", "FINTECH")
      .expect(200);
    expect(hist.body.data).toHaveLength(1);
    expect(hist.body.data[0].changedByRole).toBe("FINTECH");
  });

  it("moving to the Closed stage without a status is rejected (400)", async () => {
    const closed = dealerStages.find((s) => s.key === "closed")!;
    const res = await request(app)
      .post(`/opportunities/${GEN_OPP}/stage`)
      .set("x-crm-role", "SALES_REP")
      .send({ toStageId: closed.id })
      .expect(400);
    expect(res.body.error).toContain("status_required_on_close");
  });

  it("closing with a Won/Lost/Abandoned status succeeds and sets the status", async () => {
    const closed = dealerStages.find((s) => s.key === "closed")!;
    const res = await request(app)
      .post(`/opportunities/${GEN_OPP}/stage`)
      .set("x-crm-role", "SALES_REP")
      .send({ toStageId: closed.id, opportunityStatus: "Won" })
      .expect(200);
    expect(res.body.stageId).toBe(closed.id);
    expect(res.body.opportunityStatus).toBe("Won");
  });
});

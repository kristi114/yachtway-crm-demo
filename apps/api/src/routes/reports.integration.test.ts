import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../db.js";
import { withRole } from "../permissions/rls.js";

/**
 * Phase 5 pipeline reporting over HTTP: aggregates are permission-aware. A rep's
 * report excludes EasyFund/MasterCover pipelines (and their value), while
 * Fintech/Admin see them. Requires the local DB + `pnpm db:setup` (13 pipelines
 * seeded). Excluded from the default unit suite.
 */
const app = createApp();

const GEN_OPP_A = "itest_rep_gen_a";
const GEN_OPP_B = "itest_rep_gen_b";
const EF_OPP = "itest_rep_ef";

beforeAll(async () => {
  await withRole("ADMIN", async (tx) => {
    const dealer = await tx.pipeline.findUnique({
      where: { key: "dealers" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const easyfund = await tx.pipeline.findUnique({
      where: { key: "easyfund" },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    if (!dealer || !easyfund) throw new Error("pipelines not seeded — run `pnpm db:setup`");

    const dStage = dealer.stages[0]!;
    const efStage = easyfund.stages[0]!;

    await tx.$executeRaw`
      INSERT INTO opportunities (id, name, pipeline_id, stage_id, stage, opportunity_amount, created_at, updated_at)
      VALUES
        (${GEN_OPP_A}, 'Rep deal A', ${dealer.id}, ${dStage.id}, ${dStage.name}, 1000.00, now(), now()),
        (${GEN_OPP_B}, 'Rep deal B', ${dealer.id}, ${dStage.id}, ${dStage.name}, 2500.00, now(), now())
      ON CONFLICT (id) DO NOTHING`;
    await tx.$executeRaw`
      INSERT INTO opportunities (id, name, pipeline_id, stage_id, stage, opportunity_amount, created_at, updated_at)
      VALUES (${EF_OPP}, 'Loan deal', ${easyfund.id}, ${efStage.id}, ${efStage.name}, 999999.00, now(), now())
      ON CONFLICT (id) DO NOTHING`;
  });
});

afterAll(async () => {
  await withRole("ADMIN", async (tx) => {
    await tx.$executeRaw`DELETE FROM opportunities WHERE id IN (${GEN_OPP_A}, ${GEN_OPP_B}, ${EF_OPP})`;
  });
  await prisma.$disconnect();
});

describe("Pipeline reporting (HTTP)", () => {
  it("unauthenticated gets 401", async () => {
    await request(app).get("/reports/pipelines").expect(401);
  });

  it("SALES_REP report includes the Dealers pipeline value but excludes EasyFund", async () => {
    const res = await request(app).get("/reports/pipelines").set("x-crm-role", "SALES_REP").expect(200);
    const keys = res.body.data.map((p: { key: string }) => p.key);
    expect(keys).toContain("dealers");
    expect(keys).not.toContain("easyfund");
    expect(res.body.hiddenSensitivePipelines).toBeGreaterThanOrEqual(2); // easyfund + mastercover

    const dealers = res.body.data.find((p: { key: string }) => p.key === "dealers");
    // our two seeded open deals contribute 3500 (plus any pre-existing rows)
    expect(dealers.openValue).toBeGreaterThanOrEqual(3500);
    expect(dealers.openCount).toBeGreaterThanOrEqual(2);
  });

  it("FINTECH report includes EasyFund with its value", async () => {
    const res = await request(app).get("/reports/pipelines").set("x-crm-role", "FINTECH").expect(200);
    const easyfund = res.body.data.find((p: { key: string }) => p.key === "easyfund");
    expect(easyfund).toBeTruthy();
    expect(easyfund.sensitivityClass).toBe("easyfund");
    expect(easyfund.openValue).toBeGreaterThanOrEqual(999999);
    expect(res.body.hiddenSensitivePipelines).toBe(0);
  });

  it("filtering by pipelineId scopes the report", async () => {
    const list = await request(app).get("/reports/pipelines").set("x-crm-role", "ADMIN").expect(200);
    const dealers = list.body.data.find((p: { key: string }) => p.key === "dealers");
    const res = await request(app)
      .get(`/reports/pipelines?pipelineId=${dealers.pipelineId}`)
      .set("x-crm-role", "ADMIN")
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].key).toBe("dealers");
  });
});

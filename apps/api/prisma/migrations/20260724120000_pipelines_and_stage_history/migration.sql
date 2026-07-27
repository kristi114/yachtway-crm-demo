-- Phase 3 — pipelines, pipeline stages, opportunity stage history.
--   * pipelines / pipeline_stages: reference/config (seeded from PIPELINE_SEED).
--   * opportunity_stage_history: append-only stage-move log (written from day one).
--   * opportunities gains structured pipeline_id / stage_id FKs; the free-string
--     `stage` / `opportunity_pipeline` columns are retained for GHL dual-write.
-- RLS for the two reference tables is applied by prisma/policies/rls.sql
-- (companion `pnpm db:policies` step).

-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "sensitivity_class" TEXT,
    "lost_reasons" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_stages" (
    "id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "is_won" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_stage_history" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "pipeline_id" TEXT,
    "from_stage_id" TEXT,
    "to_stage_id" TEXT,
    "from_stage" TEXT,
    "to_stage" TEXT,
    "changed_by_id" TEXT,
    "changed_by_role" TEXT,
    "note" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_stage_history_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN "pipeline_id" TEXT,
ADD COLUMN "stage_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_key_key" ON "pipelines"("key");

-- CreateIndex
CREATE INDEX "pipeline_stages_pipeline_id_idx" ON "pipeline_stages"("pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipeline_id_key_key" ON "pipeline_stages"("pipeline_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_stages_pipeline_id_position_key" ON "pipeline_stages"("pipeline_id", "position");

-- CreateIndex
CREATE INDEX "opportunity_stage_history_opportunity_id_idx" ON "opportunity_stage_history"("opportunity_id");

-- CreateIndex
CREATE INDEX "opportunity_stage_history_to_stage_id_idx" ON "opportunity_stage_history"("to_stage_id");

-- CreateIndex
CREATE INDEX "opportunity_stage_history_changed_at_idx" ON "opportunity_stage_history"("changed_at");

-- CreateIndex
CREATE INDEX "opportunities_pipeline_id_idx" ON "opportunities"("pipeline_id");

-- CreateIndex
CREATE INDEX "opportunities_stage_id_idx" ON "opportunities"("stage_id");

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

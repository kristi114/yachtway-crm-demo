-- Brands reference table → usable picklist (build-plan item 5).
-- The `brands` table + join tables already exist (init_crm). This makes it a
-- proper managed lookup: a normalized dedupe key (mirroring tags) and a sort
-- order for picklist display. Additive — no drops. Table is currently empty.

ALTER TABLE "brands" ADD COLUMN "name_key" TEXT;
ALTER TABLE "brands" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Backfill the dedupe key from existing names (none today, but safe/idempotent).
UPDATE "brands" SET "name_key" = lower(btrim("name")) WHERE "name_key" IS NULL;

ALTER TABLE "brands" ALTER COLUMN "name_key" SET NOT NULL;
CREATE UNIQUE INDEX "brands_name_key_key" ON "brands"("name_key");
CREATE INDEX "brands_sort_order_idx" ON "brands"("sort_order");

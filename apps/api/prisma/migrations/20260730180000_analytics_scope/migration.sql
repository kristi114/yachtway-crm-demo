-- Analytics scope: platform metrics must never be stored or shown at the
-- dealer/listing level (Kristi, 2026-07-30).
--
-- `analytics_profiles.scope` says what a profile measures — a dealer's own
-- channel account, a single listing, or YachtWay's house accounts — and a CHECK
-- constraint ties the scope to the id columns so the combination cannot be
-- ambiguous:
--
--   dealer   => company_id NOT NULL, listing_id NULL
--   listing  => listing_id NOT NULL, company_id NULL
--   platform => BOTH NULL
--
-- A dealer-scoped read (`WHERE scope='dealer' AND company_id = :id`) therefore
-- cannot pick up house-level rows, and a platform row has no dealer to leak onto.

ALTER TABLE "analytics_profiles" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'dealer';
ALTER TABLE "analytics_profiles" ADD COLUMN "listing_id" TEXT;

-- Existing rows: a profile with no company was already "house-level" per the old
-- comment, so it becomes platform scope. Everything else stays dealer.
UPDATE "analytics_profiles" SET "scope" = 'platform' WHERE "company_id" IS NULL;

ALTER TABLE "analytics_profiles" ADD CONSTRAINT "analytics_profiles_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "analytics_profiles_listing_id_idx" ON "analytics_profiles"("listing_id");
CREATE INDEX "analytics_profiles_scope_idx" ON "analytics_profiles"("scope");

ALTER TABLE "analytics_profiles" ADD CONSTRAINT "analytics_profiles_scope_ids_check" CHECK (
  ("scope" = 'dealer'   AND "company_id" IS NOT NULL AND "listing_id" IS NULL) OR
  ("scope" = 'listing'  AND "listing_id" IS NOT NULL AND "company_id" IS NULL) OR
  ("scope" = 'platform' AND "company_id" IS NULL     AND "listing_id" IS NULL)
);

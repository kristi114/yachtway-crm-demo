-- MasterCover "Referring Dealer" — links the referring dealer to a MasterCover
-- opportunity (parity with EasyFund's dealer_id), enabling the rep-visible
-- paid-referral rollup for mastercover.
ALTER TABLE "mastercover_applications" ADD COLUMN "referring_dealer_id" TEXT;
CREATE INDEX "mastercover_applications_referring_dealer_id_idx"
  ON "mastercover_applications"("referring_dealer_id");
ALTER TABLE "mastercover_applications" ADD CONSTRAINT "mastercover_applications_referring_dealer_id_fkey"
  FOREIGN KEY ("referring_dealer_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Opportunity owner may be a User (owner_id) OR a Role (owner_role, a RoleSchema
-- key). EasyFund/MasterCover opps auto-own to FINTECH. No FK (role keys are in
-- the `roles` table but owner_role stores the key string, like changed_by_role).
ALTER TABLE "opportunities" ADD COLUMN "owner_role" TEXT;

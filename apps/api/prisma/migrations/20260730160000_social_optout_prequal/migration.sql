-- Catalog fields the standalone build defines that the schema was missing:
-- company social profiles, account-wide email opt-out, contact opt-OUT consent,
-- and the EasyFund prequalification outcome.
--
-- Consent model change: the CRM now models email/SMS consent as OPT-OUT
-- (default = may contact) to match the audience-suppression rules. The old
-- contacts.email_opt_in / sms_opt_in columns are BACKFILLED-INVERTED into the new
-- columns and then LEFT IN PLACE, deprecated: the GHL dual-write's generated
-- field catalog still writes them. Drop them in a follow-up migration once
-- yachtway-to-crm-sync has been regenerated against the opt-out columns.

-- 1. Company: social profiles + account-wide suppression.
ALTER TABLE "companies" ADD COLUMN "account_wide_email_opt_out" BOOLEAN;
ALTER TABLE "companies" ADD COLUMN "facebook_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "instagram_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "whatsapp_number" TEXT;
ALTER TABLE "companies" ADD COLUMN "youtube_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "tiktok_url" TEXT;
ALTER TABLE "companies" ADD COLUMN "linkedin_url" TEXT;

-- 2. Contact: opt-OUT consent columns.
ALTER TABLE "contacts" ADD COLUMN "email_opt_out" BOOLEAN;
ALTER TABLE "contacts" ADD COLUMN "sms_opt_out" BOOLEAN;

-- Backfill by inversion. NULL opt-in stays NULL opt-out (unknown consent is not
-- an opt-out — audience building treats only an explicit true as suppression).
UPDATE "contacts" SET "email_opt_out" = NOT "email_opt_in" WHERE "email_opt_in" IS NOT NULL;
UPDATE "contacts" SET "sms_opt_out"   = NOT "sms_opt_in"   WHERE "sms_opt_in"   IS NOT NULL;

-- 3. EasyFund: prequalification outcome ("Pre-Qualified" | "Not Qualified"),
--    distinct from status (lifecycle) and current_step (funnel position).
ALTER TABLE "easyfund_loans" ADD COLUMN "prequal_status" TEXT;

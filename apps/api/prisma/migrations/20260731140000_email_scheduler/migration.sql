-- Email scheduler bookkeeping.
--
-- The runner (emails/scheduler.ts) polls for work rather than holding timers in
-- memory, so a restart loses nothing:
--   next_run_at   when to look at this send again (next batch window, next RSS check)
--   locked_at     claim lease — an atomic conditional UPDATE on this column is what
--                 stops two API instances dispatching the same batch twice
--   last_rss_item_id / last_checked_at   RSS de-duplication
--   follow_up_sent_at                    ensures the non-opener re-send fires once
--   email_recipients.scheduled_for       smart-send spreads recipients across a window

ALTER TABLE "email_sends" ADD COLUMN "next_run_at" TIMESTAMP(3);
ALTER TABLE "email_sends" ADD COLUMN "locked_at" TIMESTAMP(3);
ALTER TABLE "email_sends" ADD COLUMN "last_rss_item_id" TEXT;
ALTER TABLE "email_sends" ADD COLUMN "last_checked_at" TIMESTAMP(3);
ALTER TABLE "email_sends" ADD COLUMN "follow_up_sent_at" TIMESTAMP(3);

CREATE INDEX "email_sends_next_run_at_idx" ON "email_sends"("next_run_at");

ALTER TABLE "email_recipients" ADD COLUMN "scheduled_for" TIMESTAMP(3);

-- Existing scheduled sends should be picked up at their original time.
UPDATE "email_sends" SET "next_run_at" = "scheduled_for" WHERE "status" = 'scheduled';

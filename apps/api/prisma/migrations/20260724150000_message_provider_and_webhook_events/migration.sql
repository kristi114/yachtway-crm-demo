-- Phase 4 (increment ii-b) — Mailgun provider plumbing.
--
-- messages: transport provider + provider message id, so tracking events
-- (delivered/opened/clicked/…) can be correlated back to the sent row.
-- webhook_events: idempotency ledger so a redelivered provider event is
-- processed exactly once (Mailgun retries webhooks at-least-once).

ALTER TABLE "messages" ADD COLUMN "provider" TEXT;
ALTER TABLE "messages" ADD COLUMN "provider_message_id" TEXT;
CREATE INDEX "messages_provider_message_id_idx" ON "messages"("provider_message_id");

CREATE TABLE "webhook_events" (
  "id"          TEXT NOT NULL,
  "provider"    TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "event_type"  TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_events_provider_external_id_key"
  ON "webhook_events"("provider", "external_id");

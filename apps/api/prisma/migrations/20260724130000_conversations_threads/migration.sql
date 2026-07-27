-- Phase 4 (increment i) — Conversations as threads.
--
-- The existing `conversations` table is actually message-level (one row per
-- email/SMS/call/chat, with body/direction/delivery_status/thread pointers). It
-- is renamed to `messages`. A new `conversations` table becomes the THREAD
-- container that groups messages, and `conversation_read_state` tracks per-user
-- unread state. The CRM `conversations` table is not dual-written yet, so this
-- rename carries no production data.
--
-- Constraint/index names are renamed to the new convention so `prisma migrate`
-- detects no drift.

-- ---------------------------------------------------------------------------
-- 1. Rename the message-level table conversations -> messages
-- ---------------------------------------------------------------------------
ALTER TABLE "conversations" RENAME TO "messages";

-- Rename the primary key + foreign key constraints to the messages_* convention.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_pkey') THEN
    ALTER TABLE "messages" RENAME CONSTRAINT "conversations_pkey" TO "messages_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_contact_id_fkey') THEN
    ALTER TABLE "messages" RENAME CONSTRAINT "conversations_contact_id_fkey" TO "messages_contact_id_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_company_id_fkey') THEN
    ALTER TABLE "messages" RENAME CONSTRAINT "conversations_company_id_fkey" TO "messages_company_id_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_related_listing_id_fkey') THEN
    ALTER TABLE "messages" RENAME CONSTRAINT "conversations_related_listing_id_fkey" TO "messages_related_listing_id_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_owner_id_fkey') THEN
    ALTER TABLE "messages" RENAME CONSTRAINT "conversations_owner_id_fkey" TO "messages_owner_id_fkey";
  END IF;
END $$;

-- Rename the carried-over indexes to the messages_* convention.
ALTER INDEX IF EXISTS "conversations_contact_id_idx"        RENAME TO "messages_contact_id_idx";
ALTER INDEX IF EXISTS "conversations_company_id_idx"        RENAME TO "messages_company_id_idx";
ALTER INDEX IF EXISTS "conversations_related_listing_id_idx" RENAME TO "messages_related_listing_id_idx";
ALTER INDEX IF EXISTS "conversations_owner_id_idx"          RENAME TO "messages_owner_id_idx";
ALTER INDEX IF EXISTS "conversations_created_by_id_idx"     RENAME TO "messages_created_by_id_idx";
ALTER INDEX IF EXISTS "conversations_activity_timestamp_idx" RENAME TO "messages_activity_timestamp_idx";
ALTER INDEX IF EXISTS "conversations_channel_idx"           RENAME TO "messages_channel_idx";

-- New FK column linking a message to its thread.
ALTER TABLE "messages" ADD COLUMN "conversation_id" TEXT;
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- ---------------------------------------------------------------------------
-- 2. New thread container: conversations
-- ---------------------------------------------------------------------------
CREATE TABLE "conversations" (
  "id"                   TEXT NOT NULL,
  "contact_id"           TEXT,
  "company_id"           TEXT,
  "related_listing_id"   TEXT,
  "channel"              TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'open',
  "subject"              TEXT,
  "assigned_to_id"       TEXT,
  "sensitivity_class"    TEXT NOT NULL DEFAULT 'general',
  "external_thread_id"   TEXT,
  "last_message_at"      TIMESTAMP(3),
  "last_message_preview" TEXT,
  "message_count"        INTEGER NOT NULL DEFAULT 0,
  "custom_fields"        JSONB,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversations_contact_id_idx"         ON "conversations"("contact_id");
CREATE INDEX "conversations_company_id_idx"         ON "conversations"("company_id");
CREATE INDEX "conversations_related_listing_id_idx" ON "conversations"("related_listing_id");
CREATE INDEX "conversations_assigned_to_id_idx"     ON "conversations"("assigned_to_id");
CREATE INDEX "conversations_status_idx"             ON "conversations"("status");
CREATE INDEX "conversations_channel_idx"            ON "conversations"("channel");
CREATE INDEX "conversations_last_message_at_idx"    ON "conversations"("last_message_at");
CREATE INDEX "conversations_external_thread_id_idx" ON "conversations"("external_thread_id");

-- ---------------------------------------------------------------------------
-- 3. Per-user read state
-- ---------------------------------------------------------------------------
CREATE TABLE "conversation_read_state" (
  "id"                TEXT NOT NULL,
  "conversation_id"   TEXT NOT NULL,
  "user_id"           TEXT NOT NULL,
  "last_read_at"      TIMESTAMP(3) NOT NULL,
  "sensitivity_class" TEXT NOT NULL DEFAULT 'general',
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_read_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_read_state_conversation_id_user_id_key"
  ON "conversation_read_state"("conversation_id", "user_id");
CREATE INDEX "conversation_read_state_user_id_idx" ON "conversation_read_state"("user_id");

-- ---------------------------------------------------------------------------
-- 4. Foreign keys
-- ---------------------------------------------------------------------------
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_related_listing_id_fkey"
  FOREIGN KEY ("related_listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_id_fkey"
  FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- NB: no FK on conversation_read_state.user_id — the auth subject (WorkOS sub /
-- dev shim) is not necessarily a CRM users row.

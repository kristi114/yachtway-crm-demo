-- Amplitude destination (product analytics → CRM).
--
-- The CRM is registered as an Amplitude "Webhook" destination for Events, User
-- Properties and Cohorts (routes/amplitude.ts). The join key is Amplitude's
-- `user_id`, which the frontend sets to the YachtWay DB ID
-- (contacts.yachtway_db_id). Rows keep the raw Amplitude ids so events that
-- arrive before their contact exists can be reconciled by a later backfill,
-- hence contact_id is nullable on both tables.
--
-- RLS for these tables lives in prisma/policies/rls.sql (read follows
-- contact.general; writes are ADMIN/INTEGRATION only) — run `pnpm db:policies`
-- after applying this migration.

-- 1. Contact: latest raw user-properties snapshot from the User Properties destination.
ALTER TABLE "contacts" ADD COLUMN "amplitude_user_properties" JSONB;

-- 2. Events. external_id (Amplitude insert_id / event id) is the idempotency key:
--    a redelivered event collides on the unique index and is dropped.
CREATE TABLE "amplitude_events" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT,
    "amp_user_id" TEXT,
    "device_id" TEXT,
    "amplitude_id" TEXT,
    "external_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_time" TIMESTAMP(3),
    "session_id" TEXT,
    "event_properties" JSONB,
    "user_properties" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amplitude_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "amplitude_events_external_id_key" ON "amplitude_events"("external_id");
CREATE INDEX "amplitude_events_contact_id_idx" ON "amplitude_events"("contact_id");
CREATE INDEX "amplitude_events_amp_user_id_idx" ON "amplitude_events"("amp_user_id");
CREATE INDEX "amplitude_events_event_type_idx" ON "amplitude_events"("event_type");
CREATE INDEX "amplitude_events_event_time_idx" ON "amplitude_events"("event_time");

ALTER TABLE "amplitude_events" ADD CONSTRAINT "amplitude_events_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Cohorts + membership snapshots. Each cohort sync replaces its membership
--    rows, so removals are reflected; the cascade keeps that cheap.
CREATE TABLE "amplitude_cohorts" (
    "id" TEXT NOT NULL,
    "amplitude_cohort_id" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "member_count" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amplitude_cohorts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "amplitude_cohorts_amplitude_cohort_id_key" ON "amplitude_cohorts"("amplitude_cohort_id");

CREATE TABLE "amplitude_cohort_memberships" (
    "id" TEXT NOT NULL,
    "cohort_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "amp_user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amplitude_cohort_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "amplitude_cohort_memberships_cohort_id_amp_user_id_key"
    ON "amplitude_cohort_memberships"("cohort_id", "amp_user_id");
CREATE INDEX "amplitude_cohort_memberships_contact_id_idx" ON "amplitude_cohort_memberships"("contact_id");
CREATE INDEX "amplitude_cohort_memberships_amp_user_id_idx" ON "amplitude_cohort_memberships"("amp_user_id");

ALTER TABLE "amplitude_cohort_memberships" ADD CONSTRAINT "amplitude_cohort_memberships_cohort_id_fkey"
    FOREIGN KEY ("cohort_id") REFERENCES "amplitude_cohorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "amplitude_cohort_memberships" ADD CONSTRAINT "amplitude_cohort_memberships_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

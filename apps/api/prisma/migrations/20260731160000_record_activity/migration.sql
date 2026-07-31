-- Record activity: tasks, notes, appointments, personal calendar entries.
--
-- Ported from the standalone build's mock stores (tasks-log.ts, notes.ts,
-- note-access.ts, personal-calendar.ts).
--
-- Two design points worth stating:
--
-- 1. POLYMORPHIC PARENT, DONE PROPERLY. The UI models the parent as
--    relatedType + relatedId. Here it is four nullable FKs with a CHECK that
--    exactly one is set. That keeps referential integrity (no activity pointing
--    at a deleted record), lets RLS join, and makes ON DELETE CASCADE do the
--    cleanup that a string pair could never do.
--
-- 2. NOTE VISIBILITY IS ENFORCED IN POSTGRES. `private` (author only) and
--    `secure` (author + admins) are per-AUTHOR rules that no role check can
--    express, so the policy compares author_id against the new session variable
--    `app.current_user_id` (set by withRole). See prisma/policies/rls.sql —
--    run `pnpm db:policies` after this migration, and `prisma:seed` to pick up
--    the task.general / note.general / appointment.general grants.

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignee" TEXT,
    "assigned_to_id" TEXT,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Open',
    "priority" TEXT NOT NULL DEFAULT 'Med',
    "notes" TEXT,
    "completed_at" TIMESTAMP(3),
    "contact_id" TEXT,
    "company_id" TEXT,
    "listing_id" TEXT,
    "opportunity_id" TEXT,
    "created_by_id" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tasks_contact_id_idx" ON "tasks"("contact_id");
CREATE INDEX "tasks_company_id_idx" ON "tasks"("company_id");
CREATE INDEX "tasks_listing_id_idx" ON "tasks"("listing_id");
CREATE INDEX "tasks_opportunity_id_idx" ON "tasks"("opportunity_id");
CREATE INDEX "tasks_assigned_to_id_idx" ON "tasks"("assigned_to_id");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_one_parent_check" CHECK (
  (("contact_id" IS NOT NULL)::int + ("company_id" IS NOT NULL)::int
   + ("listing_id" IS NOT NULL)::int + ("opportunity_id" IS NOT NULL)::int) = 1
);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author" TEXT,
    -- Auth subject, deliberately NOT a users FK: WorkOS subs / dev shim ids are
    -- not rows in `users` (same convention as messages.created_by_id).
    "author_id" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'team',
    "contact_id" TEXT,
    "company_id" TEXT,
    "listing_id" TEXT,
    "opportunity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notes_contact_id_idx" ON "notes"("contact_id");
CREATE INDEX "notes_company_id_idx" ON "notes"("company_id");
CREATE INDEX "notes_listing_id_idx" ON "notes"("listing_id");
CREATE INDEX "notes_opportunity_id_idx" ON "notes"("opportunity_id");
CREATE INDEX "notes_author_id_idx" ON "notes"("author_id");
CREATE INDEX "notes_visibility_idx" ON "notes"("visibility");

ALTER TABLE "notes" ADD CONSTRAINT "notes_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes" ADD CONSTRAINT "notes_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notes" ADD CONSTRAINT "notes_one_parent_check" CHECK (
  (("contact_id" IS NOT NULL)::int + ("company_id" IS NOT NULL)::int
   + ("listing_id" IS NOT NULL)::int + ("opportunity_id" IS NOT NULL)::int) = 1
);
ALTER TABLE "notes" ADD CONSTRAINT "notes_visibility_check" CHECK (
  "visibility" IN ('private', 'team', 'public', 'secure')
);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "notes" TEXT,
    "attendees" TEXT[],
    "timezone" TEXT,
    "external_event_id" TEXT,
    "contact_id" TEXT,
    "company_id" TEXT,
    "listing_id" TEXT,
    "opportunity_id" TEXT,
    "owner_id" TEXT,
    "created_by_id" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appointments_contact_id_idx" ON "appointments"("contact_id");
CREATE INDEX "appointments_company_id_idx" ON "appointments"("company_id");
CREATE INDEX "appointments_listing_id_idx" ON "appointments"("listing_id");
CREATE INDEX "appointments_opportunity_id_idx" ON "appointments"("opportunity_id");
CREATE INDEX "appointments_start_at_idx" ON "appointments"("start_at");
CREATE INDEX "appointments_external_event_id_idx" ON "appointments"("external_event_id");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_opportunity_id_fkey"
    FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_one_parent_check" CHECK (
  (("contact_id" IS NOT NULL)::int + ("company_id" IS NOT NULL)::int
   + ("listing_id" IS NOT NULL)::int + ("opportunity_id" IS NOT NULL)::int) = 1
);

-- ---------------------------------------------------------------------------
-- Personal calendar — one user's own entries, never anyone else's
-- ---------------------------------------------------------------------------
CREATE TABLE "personal_calendar_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_calendar_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "personal_calendar_entries_user_id_idx" ON "personal_calendar_entries"("user_id");
CREATE INDEX "personal_calendar_entries_start_at_idx" ON "personal_calendar_entries"("start_at");

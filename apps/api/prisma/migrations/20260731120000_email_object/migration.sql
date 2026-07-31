-- Email object: templates, campaigns (+ ordered steps), saved audiences, sends
-- and per-recipient results.
--
-- Ported from the standalone build's mock stores (src/lib/email-*.ts,
-- audiences.ts), which are the product spec. Routing is fixed by email class
-- (system→SES, transactional→Gmail, marketing→Mailgun) with a per-send override
-- allowed only within the class.
--
-- Consent design: suppressed recipients are PERSISTED with their reason rather
-- than filtered out silently, so the record shows who was deliberately excluded
-- (opted out / do-not-contact / no address / duplicate) and not merely who was
-- mailed. RLS for these tables is in prisma/policies/rls.sql — run
-- `pnpm db:policies` after applying this migration, and `prisma:seed` to pick up
-- the new email.general / email.marketing grants.

-- 1. Templates
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "title" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'marketing',
    "provider" TEXT,
    "mode" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "design" JSONB,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_templates_kind_idx" ON "email_templates"("kind");
CREATE INDEX "email_templates_name_idx" ON "email_templates"("name");

-- 2. Campaigns + ordered steps
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_campaigns_status_idx" ON "email_campaigns"("status");

CREATE TABLE "email_campaign_steps" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "delay_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_campaign_steps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_campaign_steps_campaign_id_step_key" ON "email_campaign_steps"("campaign_id", "step");
CREATE INDEX "email_campaign_steps_template_id_idx" ON "email_campaign_steps"("template_id");

ALTER TABLE "email_campaign_steps" ADD CONSTRAINT "email_campaign_steps_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_campaign_steps" ADD CONSTRAINT "email_campaign_steps_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Saved audiences
CREATE TABLE "email_audiences" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_clauses" JSONB,
    "contact_tags" TEXT[],
    "company_tags" TEXT[],
    "manual_emails" TEXT[],
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_audiences_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_audiences_name_idx" ON "email_audiences"("name");

-- 4. Sends
CREATE TABLE "email_sends" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "preheader" TEXT,
    "title" TEXT,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_overridden" BOOLEAN NOT NULL DEFAULT false,
    "sender_name" TEXT,
    "sender_email" TEXT,
    "reply_to" TEXT,
    "template_id" TEXT,
    "template_name" TEXT,
    "campaign_id" TEXT,
    "audience_id" TEXT,
    "audience_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "schedule_mode" TEXT NOT NULL DEFAULT 'now',
    "schedule_timezone" TEXT,
    "schedule_config" JSONB,
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "options" JSONB,
    "ab_test" JSONB,
    "follow_up" JSONB,
    "attachments" TEXT[],
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_count" INTEGER NOT NULL DEFAULT 0,
    "bounced_count" INTEGER NOT NULL DEFAULT 0,
    "suppressed_count" INTEGER NOT NULL DEFAULT 0,
    "parent_send_id" TEXT,
    "sync_error" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sends_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_sends_status_idx" ON "email_sends"("status");
CREATE INDEX "email_sends_kind_idx" ON "email_sends"("kind");
CREATE INDEX "email_sends_campaign_id_idx" ON "email_sends"("campaign_id");
CREATE INDEX "email_sends_template_id_idx" ON "email_sends"("template_id");
CREATE INDEX "email_sends_scheduled_for_idx" ON "email_sends"("scheduled_for");

ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_audience_id_fkey"
    FOREIGN KEY ("audience_id") REFERENCES "email_audiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_parent_send_id_fkey"
    FOREIGN KEY ("parent_send_id") REFERENCES "email_sends"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Per-recipient rows. tracking_token backs the open pixel, click redirect and
--    unsubscribe link, so it must be unguessable and unique.
CREATE TABLE "email_recipients" (
    "id" TEXT NOT NULL,
    "send_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "variant" TEXT,
    -- Denormalized from the parent send so RLS can gate by a direct column check
    -- (a subquery into email_sends returns NULL for a hidden send and would
    -- fall through to the general class).
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "suppression_reason" TEXT,
    "provider_message_id" TEXT,
    "tracking_token" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "bounced_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_recipients_tracking_token_key" ON "email_recipients"("tracking_token");
CREATE UNIQUE INDEX "email_recipients_send_id_email_key" ON "email_recipients"("send_id", "email");
CREATE INDEX "email_recipients_contact_id_idx" ON "email_recipients"("contact_id");
CREATE INDEX "email_recipients_status_idx" ON "email_recipients"("status");
CREATE INDEX "email_recipients_provider_message_id_idx" ON "email_recipients"("provider_message_id");

ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_send_id_fkey"
    FOREIGN KEY ("send_id") REFERENCES "email_sends"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

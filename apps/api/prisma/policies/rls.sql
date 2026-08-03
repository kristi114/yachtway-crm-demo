-- ============================================================================
-- YachtWay CRM — Row-Level Security policies (permission engine enforcement)
--
-- Apply AFTER `prisma migrate` has created the tables (Prisma manages tables;
-- it does not manage RLS, so this runs as a companion step — see
-- `pnpm db:policies`). Idempotent: safe to re-run after every migration.
--
-- Model: the DB is the source of truth. Policies consult `permission_grants`
-- for the role bound to the per-request session variable `app.current_role`
-- (set by the API inside each transaction via set_config). An unauthenticated
-- connection leaves the variable NULL and matches nothing → default-deny.
-- Run as the OWNER/superuser (crm), not crm_app.
-- ============================================================================

-- Least-privilege app role the API connects as (RLS applies to it; it is not
-- the table owner and is not a superuser, so it cannot bypass policies).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN PASSWORD 'devpass';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;

-- ----------------------------------------------------------------------------
-- Grant lookup: does the current role hold (resource, action)?
-- STABLE + invoker rights; crm_app has SELECT on roles/permission_grants.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_role_can(p_resource text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM permission_grants g
    JOIN roles r ON r.id = g.role_id
    WHERE r.key = current_setting('app.current_role', true)
      AND r.is_active
      AND g.resource_class = p_resource
      AND ( (p_action = 'read'  AND g.can_read)
         OR (p_action = 'write' AND g.can_write) )
  );
$$;

GRANT EXECUTE ON FUNCTION current_role_can(text, text) TO crm_app;

-- Financing-class conversations map to conversations.financing; everything else
-- to conversations.general.
CREATE OR REPLACE FUNCTION conversation_resource(p_class text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_class IN ('financing', 'easyfund', 'mastercover') THEN 'conversations.financing'
    ELSE 'conversations.general'
  END;
$$;
GRANT EXECUTE ON FUNCTION conversation_resource(text) TO crm_app;

-- ----------------------------------------------------------------------------
-- Helper: enable + FORCE RLS and install read/write policies for a table whose
-- rows all belong to one resource class. Written inline per-table below.
-- ----------------------------------------------------------------------------

-- company.general -> companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_read  ON companies;
DROP POLICY IF EXISTS companies_write ON companies;
CREATE POLICY companies_read  ON companies FOR SELECT USING (current_role_can('company.general', 'read'));
CREATE POLICY companies_write ON companies FOR ALL
  USING (current_role_can('company.general', 'write'))
  WITH CHECK (current_role_can('company.general', 'write'));

-- contact.general -> contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contacts_read  ON contacts;
DROP POLICY IF EXISTS contacts_write ON contacts;
CREATE POLICY contacts_read  ON contacts FOR SELECT USING (current_role_can('contact.general', 'read'));
CREATE POLICY contacts_write ON contacts FOR ALL
  USING (current_role_can('contact.general', 'write'))
  WITH CHECK (current_role_can('contact.general', 'write'));

-- easyfund -> easyfund_loans (income, credit, down payment — Fintech/Admin only)
ALTER TABLE easyfund_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE easyfund_loans FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS easyfund_read  ON easyfund_loans;
DROP POLICY IF EXISTS easyfund_write ON easyfund_loans;
CREATE POLICY easyfund_read  ON easyfund_loans FOR SELECT USING (current_role_can('easyfund', 'read'));
CREATE POLICY easyfund_write ON easyfund_loans FOR ALL
  USING (current_role_can('easyfund', 'write'))
  WITH CHECK (current_role_can('easyfund', 'write'));

-- mastercover -> mastercover_applications
ALTER TABLE mastercover_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastercover_applications FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mastercover_read  ON mastercover_applications;
DROP POLICY IF EXISTS mastercover_write ON mastercover_applications;
CREATE POLICY mastercover_read  ON mastercover_applications FOR SELECT USING (current_role_can('mastercover', 'read'));
CREATE POLICY mastercover_write ON mastercover_applications FOR ALL
  USING (current_role_can('mastercover', 'write'))
  WITH CHECK (current_role_can('mastercover', 'write'));

-- conversations.* is enforced per-row by sensitivity_class on THREE tables that
-- share the class: the thread container (conversations), its messages (messages),
-- and per-user read state (conversation_read_state). A financing thread and all
-- of its messages are invisible to a rep who lacks conversations.financing.

-- conversations (thread container) -> per-row by sensitivity_class
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_read  ON conversations;
DROP POLICY IF EXISTS conversations_write ON conversations;
CREATE POLICY conversations_read ON conversations FOR SELECT
  USING (current_role_can(conversation_resource(sensitivity_class), 'read'));
CREATE POLICY conversations_write ON conversations FOR ALL
  USING (current_role_can(conversation_resource(sensitivity_class), 'write'))
  WITH CHECK (current_role_can(conversation_resource(sensitivity_class), 'write'));

-- messages (individual activities) -> per-row by sensitivity_class
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_read  ON messages;
DROP POLICY IF EXISTS messages_write ON messages;
CREATE POLICY messages_read ON messages FOR SELECT
  USING (current_role_can(conversation_resource(sensitivity_class), 'read'));
CREATE POLICY messages_write ON messages FOR ALL
  USING (current_role_can(conversation_resource(sensitivity_class), 'write'))
  WITH CHECK (current_role_can(conversation_resource(sensitivity_class), 'write'));

-- conversation_read_state (per-user unread bookkeeping). sensitivity_class is
-- denormalized from the parent thread so the gate is a direct column check (no
-- subquery into conversations, which under RLS would return NULL for a hidden
-- financing thread and fall through to 'general'). Marking-as-read is a read-side
-- action, so WRITE is gated on the parent class's READ grant, not write.
ALTER TABLE conversation_read_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_read_state FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_read_state_read  ON conversation_read_state;
DROP POLICY IF EXISTS conversation_read_state_write ON conversation_read_state;
CREATE POLICY conversation_read_state_read ON conversation_read_state FOR SELECT
  USING (current_role_can(conversation_resource(sensitivity_class), 'read'));
CREATE POLICY conversation_read_state_write ON conversation_read_state FOR ALL
  USING (current_role_can(conversation_resource(sensitivity_class), 'read'))
  WITH CHECK (current_role_can(conversation_resource(sensitivity_class), 'read'));

-- webhook_events: idempotency ledger for provider webhooks. Written only by the
-- INTEGRATION system actor (and ADMIN); readable by ADMIN. Reps/Fintech/Marketing
-- can never touch it even via raw SQL.
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhook_events_read  ON webhook_events;
DROP POLICY IF EXISTS webhook_events_write ON webhook_events;
CREATE POLICY webhook_events_read ON webhook_events FOR SELECT
  USING (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'));
CREATE POLICY webhook_events_write ON webhook_events FOR ALL
  USING (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'))
  WITH CHECK (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'));

-- analytics -> analytics_profiles + analytics_snapshots
ALTER TABLE analytics_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_profiles FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_profiles_read  ON analytics_profiles;
DROP POLICY IF EXISTS analytics_profiles_write ON analytics_profiles;
CREATE POLICY analytics_profiles_read  ON analytics_profiles FOR SELECT USING (current_role_can('analytics', 'read'));
CREATE POLICY analytics_profiles_write ON analytics_profiles FOR ALL
  USING (current_role_can('analytics', 'write'))
  WITH CHECK (current_role_can('analytics', 'write'));

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analytics_snapshots_read  ON analytics_snapshots;
DROP POLICY IF EXISTS analytics_snapshots_write ON analytics_snapshots;
CREATE POLICY analytics_snapshots_read  ON analytics_snapshots FOR SELECT USING (current_role_can('analytics', 'read'));
CREATE POLICY analytics_snapshots_write ON analytics_snapshots FOR ALL
  USING (current_role_can('analytics', 'write'))
  WITH CHECK (current_role_can('analytics', 'write'));

-- contact_identities: the identifier ledger behind matching and dedupe. Same
-- class as the contact it belongs to, so anyone who can see a contact can see
-- which platform accounts and addresses resolve to it. Note the contacts trigger
-- writes this table as the INVOKING role, so this policy must permit any role
-- that writes contacts — contact.general write covers exactly that set.
ALTER TABLE contact_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_identities FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_identities_read  ON contact_identities;
DROP POLICY IF EXISTS contact_identities_write ON contact_identities;
CREATE POLICY contact_identities_read ON contact_identities FOR SELECT
  USING (current_role_can('contact.general', 'read'));
CREATE POLICY contact_identities_write ON contact_identities FOR ALL
  USING (current_role_can('contact.general', 'write'))
  WITH CHECK (current_role_can('contact.general', 'write'));

-- ============================================================================
-- Record activity — tasks, notes, appointments, personal calendar.
--
-- Notes are the interesting one. `private` and `secure` are per-AUTHOR rules, so
-- a role check alone cannot express them: the policy compares author_id against
-- the session variable `app.current_user_id`, which withRole() binds alongside
-- app.current_role. An unset variable is the empty string, which never equals a
-- real author id, so the default is deny.
-- ============================================================================
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$;
GRANT EXECUTE ON FUNCTION current_user_id() TO crm_app;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_read  ON tasks;
DROP POLICY IF EXISTS tasks_write ON tasks;
CREATE POLICY tasks_read ON tasks FOR SELECT
  USING (current_role_can('task.general', 'read'));
CREATE POLICY tasks_write ON tasks FOR ALL
  USING (current_role_can('task.general', 'write'))
  WITH CHECK (current_role_can('task.general', 'write'));

-- notes: the grant gates the table; visibility gates the ROW.
--   public / team → anyone holding the grant
--   private       → the author only
--   secure        → the author, or ADMIN
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notes_read  ON notes;
DROP POLICY IF EXISTS notes_write ON notes;
CREATE POLICY notes_read ON notes FOR SELECT
  USING (
    current_role_can('note.general', 'read')
    AND (
      visibility IN ('public', 'team')
      OR (visibility = 'private' AND author_id IS NOT DISTINCT FROM current_user_id())
      OR (visibility = 'secure'  AND (
            author_id IS NOT DISTINCT FROM current_user_id()
            OR current_setting('app.current_role', true) = 'ADMIN'))
    )
  );
CREATE POLICY notes_write ON notes FOR ALL
  USING (
    current_role_can('note.general', 'write')
    AND (
      visibility IN ('public', 'team')
      OR (visibility = 'private' AND author_id IS NOT DISTINCT FROM current_user_id())
      OR (visibility = 'secure'  AND (
            author_id IS NOT DISTINCT FROM current_user_id()
            OR current_setting('app.current_role', true) = 'ADMIN'))
    )
  )
  -- A caller may not file a private or secure note under someone else's name:
  -- the author of a restricted note must be the caller (ADMIN excepted, since it
  -- can already read them).
  WITH CHECK (
    current_role_can('note.general', 'write')
    AND (
      visibility IN ('public', 'team')
      OR author_id IS NOT DISTINCT FROM current_user_id()
      OR current_setting('app.current_role', true) = 'ADMIN'
    )
  );

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointments_read  ON appointments;
DROP POLICY IF EXISTS appointments_write ON appointments;
CREATE POLICY appointments_read ON appointments FOR SELECT
  USING (current_role_can('appointment.general', 'read'));
CREATE POLICY appointments_write ON appointments FOR ALL
  USING (current_role_can('appointment.general', 'write'))
  WITH CHECK (current_role_can('appointment.general', 'write'));

-- personal_calendar_entries: private by construction. Every row is scoped to its
-- owner, so one rep can never see another's 1:1s, travel or blocked time — not
-- even an ADMIN, since this is personal rather than business data.
ALTER TABLE personal_calendar_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_calendar_entries FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_calendar_read  ON personal_calendar_entries;
DROP POLICY IF EXISTS personal_calendar_write ON personal_calendar_entries;
CREATE POLICY personal_calendar_read ON personal_calendar_entries FOR SELECT
  USING (
    current_role_can('appointment.general', 'read')
    AND user_id IS NOT DISTINCT FROM current_user_id()
  );
CREATE POLICY personal_calendar_write ON personal_calendar_entries FOR ALL
  USING (
    current_role_can('appointment.general', 'write')
    AND user_id IS NOT DISTINCT FROM current_user_id()
  )
  WITH CHECK (
    current_role_can('appointment.general', 'write')
    AND user_id IS NOT DISTINCT FROM current_user_id()
  );

-- ============================================================================
-- Email object. Class decides the gate: a marketing send is email.marketing,
-- system/transactional mail is email.general. Templates, campaigns and saved
-- audiences are marketing assets (reps hold email.marketing READ only, so they
-- can review campaign results without being able to send bulk).
-- ============================================================================
CREATE OR REPLACE FUNCTION email_resource(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_kind = 'marketing' THEN 'email.marketing'
    ELSE 'email.general'
  END;
$$;
GRANT EXECUTE ON FUNCTION email_resource(text) TO crm_app;

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_templates_read  ON email_templates;
DROP POLICY IF EXISTS email_templates_write ON email_templates;
CREATE POLICY email_templates_read ON email_templates FOR SELECT
  USING (current_role_can('email.marketing', 'read'));
CREATE POLICY email_templates_write ON email_templates FOR ALL
  USING (current_role_can('email.marketing', 'write'))
  WITH CHECK (current_role_can('email.marketing', 'write'));

ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_campaigns_read  ON email_campaigns;
DROP POLICY IF EXISTS email_campaigns_write ON email_campaigns;
CREATE POLICY email_campaigns_read ON email_campaigns FOR SELECT
  USING (current_role_can('email.marketing', 'read'));
CREATE POLICY email_campaigns_write ON email_campaigns FOR ALL
  USING (current_role_can('email.marketing', 'write'))
  WITH CHECK (current_role_can('email.marketing', 'write'));

ALTER TABLE email_campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaign_steps FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_campaign_steps_read  ON email_campaign_steps;
DROP POLICY IF EXISTS email_campaign_steps_write ON email_campaign_steps;
CREATE POLICY email_campaign_steps_read ON email_campaign_steps FOR SELECT
  USING (current_role_can('email.marketing', 'read'));
CREATE POLICY email_campaign_steps_write ON email_campaign_steps FOR ALL
  USING (current_role_can('email.marketing', 'write'))
  WITH CHECK (current_role_can('email.marketing', 'write'));

ALTER TABLE email_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_audiences FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_audiences_read  ON email_audiences;
DROP POLICY IF EXISTS email_audiences_write ON email_audiences;
CREATE POLICY email_audiences_read ON email_audiences FOR SELECT
  USING (current_role_can('email.marketing', 'read'));
CREATE POLICY email_audiences_write ON email_audiences FOR ALL
  USING (current_role_can('email.marketing', 'write'))
  WITH CHECK (current_role_can('email.marketing', 'write'));

-- Sends + recipients: gated per row by the send's kind. email_recipients carries
-- its own denormalized `kind` so the check is direct — a subquery into
-- email_sends would return NULL under RLS for a hidden send and fall through to
-- the general class, leaking marketing recipients to a rep.
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_sends_read  ON email_sends;
DROP POLICY IF EXISTS email_sends_write ON email_sends;
CREATE POLICY email_sends_read ON email_sends FOR SELECT
  USING (current_role_can(email_resource(kind), 'read'));
CREATE POLICY email_sends_write ON email_sends FOR ALL
  USING (current_role_can(email_resource(kind), 'write'))
  WITH CHECK (current_role_can(email_resource(kind), 'write'));

ALTER TABLE email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_recipients FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_recipients_read  ON email_recipients;
DROP POLICY IF EXISTS email_recipients_write ON email_recipients;
CREATE POLICY email_recipients_read ON email_recipients FOR SELECT
  USING (current_role_can(email_resource(kind), 'read'));
CREATE POLICY email_recipients_write ON email_recipients FOR ALL
  USING (current_role_can(email_resource(kind), 'write'))
  WITH CHECK (current_role_can(email_resource(kind), 'write'));

-- Amplitude destination tables. Behavioural data is tied to contacts, so read
-- follows the contact.general grant; writes are INTEGRATION/ADMIN only (the
-- webhook ingests as INTEGRATION). Reps/Fintech can read the activity of
-- contacts they can already see; Marketing/others cannot write it via raw SQL.
ALTER TABLE amplitude_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE amplitude_events FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS amplitude_events_read  ON amplitude_events;
DROP POLICY IF EXISTS amplitude_events_write ON amplitude_events;
CREATE POLICY amplitude_events_read ON amplitude_events FOR SELECT
  USING (current_role_can('contact.general', 'read'));
CREATE POLICY amplitude_events_write ON amplitude_events FOR ALL
  USING (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'))
  WITH CHECK (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'));

ALTER TABLE amplitude_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE amplitude_cohorts FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS amplitude_cohorts_read  ON amplitude_cohorts;
DROP POLICY IF EXISTS amplitude_cohorts_write ON amplitude_cohorts;
CREATE POLICY amplitude_cohorts_read ON amplitude_cohorts FOR SELECT
  USING (current_role_can('contact.general', 'read'));
CREATE POLICY amplitude_cohorts_write ON amplitude_cohorts FOR ALL
  USING (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'))
  WITH CHECK (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'));

ALTER TABLE amplitude_cohort_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE amplitude_cohort_memberships FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS amplitude_cohort_memberships_read  ON amplitude_cohort_memberships;
DROP POLICY IF EXISTS amplitude_cohort_memberships_write ON amplitude_cohort_memberships;
CREATE POLICY amplitude_cohort_memberships_read ON amplitude_cohort_memberships FOR SELECT
  USING (current_role_can('contact.general', 'read'));
CREATE POLICY amplitude_cohort_memberships_write ON amplitude_cohort_memberships FOR ALL
  USING (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'))
  WITH CHECK (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'));

-- audit_logs: append-only from the API; readable by Admin only. RLS keeps reps
-- and fintech out even via raw SQL. (Writes happen as the owner/service path.)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_read  ON audit_logs;
DROP POLICY IF EXISTS audit_write ON audit_logs;
CREATE POLICY audit_read  ON audit_logs FOR SELECT
  USING (current_setting('app.current_role', true) = 'ADMIN');
CREATE POLICY audit_write ON audit_logs FOR INSERT
  WITH CHECK (current_setting('app.current_role', true) IS NOT NULL);

-- ----------------------------------------------------------------------------
-- Phase 3 — pipelines / stages (reference/config) + stage history.
--
-- pipelines & pipeline_stages are reference data: any authenticated role may
-- READ them (needed to render boards); only ADMIN may mutate. The pipeline LIST
-- is not sensitive — the financing *fields* live in the RLS-protected
-- easyfund_loans / mastercover_applications satellites.
--
-- opportunities itself intentionally has NO row-RLS (sensitive data is isolated
-- in satellites; financing-pipeline rows are filtered at the API layer by grant).
-- opportunity_stage_history follows the same gate as opportunities via the
-- opportunity.general class, so a missed API check still cannot leak history to
-- an unauthenticated caller (default-deny backstop).
-- ----------------------------------------------------------------------------

-- brands: managed reference/picklist for Company.authorized_brands +
-- Contact.brand_interests. Read = any authenticated role (everyone needs the
-- picklist); write = ADMIN only. (Implicit m2m join tables follow the parent
-- company/contact gate, same as tags.)
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brands_read  ON brands;
DROP POLICY IF EXISTS brands_write ON brands;
CREATE POLICY brands_read  ON brands FOR SELECT
  USING (current_setting('app.current_role', true) IS NOT NULL);
CREATE POLICY brands_write ON brands FOR ALL
  USING (current_setting('app.current_role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.current_role', true) = 'ADMIN');

-- users: CRM staff records. Read = any authenticated role (owner/assignee names
-- must render on every record); write = ADMIN only. Nothing in src/ writes this
-- table today — user rows are administered out-of-band — so an ADMIN-only write
-- gate costs nothing now and closes the hole where any role could reassign or
-- delete staff records. NOTE for later: when WorkOS JIT provisioning lands it
-- must run inside withRole("ADMIN"), or add INTEGRATION to the write predicate.
-- (crm_sync is rolbypassrls, so the dual-write is unaffected either way.)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_read  ON users;
DROP POLICY IF EXISTS users_write ON users;
CREATE POLICY users_read  ON users FOR SELECT
  USING (current_setting('app.current_role', true) IS NOT NULL);
CREATE POLICY users_write ON users FOR ALL
  USING (current_setting('app.current_role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.current_role', true) = 'ADMIN');

-- pipelines: read = any authenticated role; write = ADMIN
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipelines_read  ON pipelines;
DROP POLICY IF EXISTS pipelines_write ON pipelines;
CREATE POLICY pipelines_read  ON pipelines FOR SELECT
  USING (current_setting('app.current_role', true) IS NOT NULL);
CREATE POLICY pipelines_write ON pipelines FOR ALL
  USING (current_setting('app.current_role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.current_role', true) = 'ADMIN');

-- pipeline_stages: read = any authenticated role; write = ADMIN
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipeline_stages_read  ON pipeline_stages;
DROP POLICY IF EXISTS pipeline_stages_write ON pipeline_stages;
CREATE POLICY pipeline_stages_read  ON pipeline_stages FOR SELECT
  USING (current_setting('app.current_role', true) IS NOT NULL);
CREATE POLICY pipeline_stages_write ON pipeline_stages FOR ALL
  USING (current_setting('app.current_role', true) = 'ADMIN')
  WITH CHECK (current_setting('app.current_role', true) = 'ADMIN');

-- opportunity_stage_history -> opportunity.general
ALTER TABLE opportunity_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_stage_history FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opp_stage_history_read  ON opportunity_stage_history;
DROP POLICY IF EXISTS opp_stage_history_write ON opportunity_stage_history;
CREATE POLICY opp_stage_history_read  ON opportunity_stage_history FOR SELECT
  USING (current_role_can('opportunity.general', 'read'));
CREATE POLICY opp_stage_history_write ON opportunity_stage_history FOR ALL
  USING (current_role_can('opportunity.general', 'write'))
  WITH CHECK (current_role_can('opportunity.general', 'write'));

-- ============================================================================
-- Phase X0 — Xero-via-Make billing.
--
-- invoices / payments / bills / credit_notes carry sensitivity_class and are
-- gated per-row: easyfund/mastercover → invoice.financing / bill.financing
-- (FINTECH/ADMIN only); everything else → invoice.general / bill.general. Reps
-- therefore never see financing referral invoices/payables — only the
-- materialized paid-referral/credit rollups on companies (company.general).
-- Estimates are general-only in v1. Products are reference data (any authed can
-- read; INTEGRATION/ADMIN write via the Xero item sync). opportunity_line_items
-- follow opportunity.general; studio_shoot_credits follow company.general.
-- ============================================================================

-- financing classes → invoice.financing; else invoice.general
CREATE OR REPLACE FUNCTION invoice_resource(p_class text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_class IN ('financing', 'easyfund', 'mastercover') THEN 'invoice.financing'
    ELSE 'invoice.general'
  END;
$$;
GRANT EXECUTE ON FUNCTION invoice_resource(text) TO crm_app;

-- financing classes → bill.financing; else bill.general
CREATE OR REPLACE FUNCTION bill_resource(p_class text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_class IN ('financing', 'easyfund', 'mastercover') THEN 'bill.financing'
    ELSE 'bill.general'
  END;
$$;
GRANT EXECUTE ON FUNCTION bill_resource(text) TO crm_app;

-- invoices -> per-row by sensitivity_class
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_read  ON invoices;
DROP POLICY IF EXISTS invoices_write ON invoices;
CREATE POLICY invoices_read ON invoices FOR SELECT
  USING (current_role_can(invoice_resource(sensitivity_class), 'read'));
CREATE POLICY invoices_write ON invoices FOR ALL
  USING (current_role_can(invoice_resource(sensitivity_class), 'write'))
  WITH CHECK (current_role_can(invoice_resource(sensitivity_class), 'write'));

-- payments -> per-row by sensitivity_class (denormalized from the invoice)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_read  ON payments;
DROP POLICY IF EXISTS payments_write ON payments;
CREATE POLICY payments_read ON payments FOR SELECT
  USING (current_role_can(invoice_resource(sensitivity_class), 'read'));
CREATE POLICY payments_write ON payments FOR ALL
  USING (current_role_can(invoice_resource(sensitivity_class), 'write'))
  WITH CHECK (current_role_can(invoice_resource(sensitivity_class), 'write'));

-- credit_notes -> per-row by sensitivity_class (reuse the invoice classes)
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_notes_read  ON credit_notes;
DROP POLICY IF EXISTS credit_notes_write ON credit_notes;
CREATE POLICY credit_notes_read ON credit_notes FOR SELECT
  USING (current_role_can(invoice_resource(sensitivity_class), 'read'));
CREATE POLICY credit_notes_write ON credit_notes FOR ALL
  USING (current_role_can(invoice_resource(sensitivity_class), 'write'))
  WITH CHECK (current_role_can(invoice_resource(sensitivity_class), 'write'));

-- bills -> per-row by sensitivity_class (bill.* classes)
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bills_read  ON bills;
DROP POLICY IF EXISTS bills_write ON bills;
CREATE POLICY bills_read ON bills FOR SELECT
  USING (current_role_can(bill_resource(sensitivity_class), 'read'));
CREATE POLICY bills_write ON bills FOR ALL
  USING (current_role_can(bill_resource(sensitivity_class), 'write'))
  WITH CHECK (current_role_can(bill_resource(sensitivity_class), 'write'));

-- estimates + estimate_line_items -> estimate.general (no financing estimates in v1)
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS estimates_read  ON estimates;
DROP POLICY IF EXISTS estimates_write ON estimates;
CREATE POLICY estimates_read  ON estimates FOR SELECT USING (current_role_can('estimate.general', 'read'));
CREATE POLICY estimates_write ON estimates FOR ALL
  USING (current_role_can('estimate.general', 'write'))
  WITH CHECK (current_role_can('estimate.general', 'write'));

ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_line_items FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS estimate_line_items_read  ON estimate_line_items;
DROP POLICY IF EXISTS estimate_line_items_write ON estimate_line_items;
CREATE POLICY estimate_line_items_read  ON estimate_line_items FOR SELECT USING (current_role_can('estimate.general', 'read'));
CREATE POLICY estimate_line_items_write ON estimate_line_items FOR ALL
  USING (current_role_can('estimate.general', 'write'))
  WITH CHECK (current_role_can('estimate.general', 'write'));

-- opportunity_line_items -> opportunity.general (line items inherit the opp's class)
ALTER TABLE opportunity_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_line_items FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_line_items_read  ON opportunity_line_items;
DROP POLICY IF EXISTS opportunity_line_items_write ON opportunity_line_items;
CREATE POLICY opportunity_line_items_read  ON opportunity_line_items FOR SELECT USING (current_role_can('opportunity.general', 'read'));
CREATE POLICY opportunity_line_items_write ON opportunity_line_items FOR ALL
  USING (current_role_can('opportunity.general', 'write'))
  WITH CHECK (current_role_can('opportunity.general', 'write'));

-- subscriptions (Stripe) -> invoice.general (billing; INTEGRATION writes on webhook)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_read  ON subscriptions;
DROP POLICY IF EXISTS subscriptions_write ON subscriptions;
CREATE POLICY subscriptions_read  ON subscriptions FOR SELECT USING (current_role_can('invoice.general', 'read'));
CREATE POLICY subscriptions_write ON subscriptions FOR ALL
  USING (current_role_can('invoice.general', 'write'))
  WITH CHECK (current_role_can('invoice.general', 'write'));

-- studio_shoot_credits (internal ledger) -> company.general (rep-visible)
ALTER TABLE studio_shoot_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_shoot_credits FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS studio_shoot_credits_read  ON studio_shoot_credits;
DROP POLICY IF EXISTS studio_shoot_credits_write ON studio_shoot_credits;
CREATE POLICY studio_shoot_credits_read  ON studio_shoot_credits FOR SELECT USING (current_role_can('company.general', 'read'));
CREATE POLICY studio_shoot_credits_write ON studio_shoot_credits FOR ALL
  USING (current_role_can('company.general', 'write'))
  WITH CHECK (current_role_can('company.general', 'write'));

-- products: reference catalog (Xero item sync). Read = any authenticated role;
-- write = INTEGRATION (Make item sync) or ADMIN.
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_read  ON products;
DROP POLICY IF EXISTS products_write ON products;
CREATE POLICY products_read ON products FOR SELECT
  USING (current_setting('app.current_role', true) IS NOT NULL);
CREATE POLICY products_write ON products FOR ALL
  USING (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'))
  WITH CHECK (current_setting('app.current_role', true) IN ('ADMIN', 'INTEGRATION'));

-- partner_receivables: lender/insurer amounts owed — all rows are financing, so a
-- fixed receivable.financing class (FINTECH/ADMIN/INTEGRATION). Reps never see them
-- (they get the materialized Company rollups instead).
ALTER TABLE partner_receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_receivables FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_receivables_read  ON partner_receivables;
DROP POLICY IF EXISTS partner_receivables_write ON partner_receivables;
CREATE POLICY partner_receivables_read  ON partner_receivables FOR SELECT
  USING (current_role_can('receivable.financing', 'read'));
CREATE POLICY partner_receivables_write ON partner_receivables FOR ALL
  USING (current_role_can('receivable.financing', 'write'))
  WITH CHECK (current_role_can('receivable.financing', 'write'));

-- payouts: money owed/paid to dealers — all rows financing, payout.financing class.
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payouts_read  ON payouts;
DROP POLICY IF EXISTS payouts_write ON payouts;
CREATE POLICY payouts_read  ON payouts FOR SELECT
  USING (current_role_can('payout.financing', 'read'));
CREATE POLICY payouts_write ON payouts FOR ALL
  USING (current_role_can('payout.financing', 'write'))
  WITH CHECK (current_role_can('payout.financing', 'write'));

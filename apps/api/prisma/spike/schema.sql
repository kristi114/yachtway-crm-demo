-- ============================================================================
-- Permission spike (7a): minimal slice to prove EasyFund isolation via RLS.
-- Run as the superuser (crm). Creates a NON-superuser app role (crm_app) that
-- the API connects as, because Postgres superusers bypass RLS even with FORCE.
-- ============================================================================

-- Least-privilege application role the API connects as.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN PASSWORD 'devpass';
  END IF;
END
$$;

DROP TABLE IF EXISTS easyfund_loans;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id    text PRIMARY KEY,
  email text NOT NULL,
  role  text NOT NULL
);

CREATE TABLE contacts (
  id          text PRIMARY KEY,
  record_type text NOT NULL,
  first_name  text,
  last_name   text,
  email       text
);

-- Sensitive financial data lives in its own table (matches the generated schema).
CREATE TABLE easyfund_loans (
  id             text PRIMARY KEY,
  contact_id     text NOT NULL REFERENCES contacts(id),
  credit_score   text,
  monthly_income numeric(14, 2),
  down_payment   numeric(14, 2)
);

GRANT USAGE ON SCHEMA public TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;

-- ----------------------------------------------------------------------------
-- Row-level security. The per-request role is read from a session variable
-- (app.current_role) set by the API inside each transaction. current_setting
-- with missing_ok = true returns NULL when unset, so an unauthenticated
-- connection matches no policy and sees nothing (default-deny).
-- FORCE so the table owner is subject to the policies too.
-- ----------------------------------------------------------------------------
ALTER TABLE contacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts        FORCE  ROW LEVEL SECURITY;
ALTER TABLE easyfund_loans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE easyfund_loans  FORCE  ROW LEVEL SECURITY;

-- contacts.general: any authenticated CRM role may read.
CREATE POLICY contacts_read ON contacts
  FOR SELECT
  USING (current_setting('app.current_role', true) IN ('SALES_REP', 'FINTECH', 'MARKETING', 'ADMIN'));

-- easyfund: only FINTECH and ADMIN hold the grant.
CREATE POLICY easyfund_read ON easyfund_loans
  FOR SELECT
  USING (current_setting('app.current_role', true) IN ('FINTECH', 'ADMIN'));

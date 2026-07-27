-- Phase X0 — Xero-via-Make billing.
--
-- The CRM owns invoicing logic; Make is the Xero transport. New tables:
--   invoices / payments        — ACCREC mirror + payments (bidirectional)
--   bills                      — ACCPAY payables (inbound only; studio spend, financing)
--   credit_notes               — ACCRECCREDIT dealer credits (inbound only)
--   estimates / estimate_line_items — CRM-only client quotes (no Xero object)
--   studio_shoot_credits       — internal, non-monetary per-shoot credit ledger
-- Extends products (Xero item sync) + opportunity_line_items (invoice link) +
-- companies (mastercover referral rollup). invoices/payments/bills/credit_notes
-- carry sensitivity_class for per-row RLS (see policies/rls.sql).
--
-- Additive to a database whose billing rollup + shoot-credit columns already
-- exist on companies (totalAmount*, easyfundClosedReferralsAmount,
-- freeListingShootsEarned/Remaining) — those are reused, not re-created.

-- ---------------------------------------------------------------------------
-- estimates (created first: invoices.from_estimate_id references it)
-- ---------------------------------------------------------------------------
CREATE TABLE "estimates" (
  "id"                           TEXT NOT NULL,
  "company_id"                   TEXT,
  "currency"                     TEXT NOT NULL DEFAULT 'EUR',
  "notes"                        TEXT,
  "status"                       TEXT NOT NULL DEFAULT 'draft',
  "primary_recipient_contact_id" TEXT,
  "cc_emails"                    TEXT[],
  "total"                        DECIMAL(14,2),
  "sensitivity_class"            TEXT NOT NULL DEFAULT 'general',
  "sent_at"                      TIMESTAMP(3),
  "responded_at"                 TIMESTAMP(3),
  "accept_token"                 TEXT,
  "created_by_id"                TEXT,
  "created_at"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "estimates_accept_token_key" ON "estimates"("accept_token");
CREATE INDEX "estimates_company_id_idx" ON "estimates"("company_id");
CREATE INDEX "estimates_primary_recipient_contact_id_idx" ON "estimates"("primary_recipient_contact_id");
CREATE INDEX "estimates_status_idx" ON "estimates"("status");

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
CREATE TABLE "invoices" (
  "id"                  TEXT NOT NULL,
  "opportunity_id"      TEXT,
  "company_id"          TEXT,
  "contact_id"          TEXT,
  "from_estimate_id"    TEXT,
  "invoice_type"        TEXT NOT NULL,
  "org_key"             TEXT,
  "currency"            TEXT NOT NULL DEFAULT 'USD',
  "amount"              DECIMAL(14,2),
  "reference"           TEXT,
  "itemized"            BOOLEAN NOT NULL DEFAULT false,
  "status"              TEXT NOT NULL DEFAULT 'draft',
  "amount_paid"         DECIMAL(14,2),
  "amount_due"          DECIMAL(14,2),
  "due_date"            DATE,
  "xero_invoice_id"     TEXT,
  "xero_invoice_number" TEXT,
  "xero_contact_id"     TEXT,
  "online_invoice_url"  TEXT,
  "sensitivity_class"   TEXT NOT NULL DEFAULT 'general',
  "idempotency_key"     TEXT,
  "sync_error"          TEXT,
  "approved_by_id"      TEXT,
  "approved_at"         TIMESTAMP(3),
  "created_by_id"       TEXT,
  "custom_fields"       JSONB,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoices_from_estimate_id_key" ON "invoices"("from_estimate_id");
CREATE UNIQUE INDEX "invoices_xero_invoice_id_key" ON "invoices"("xero_invoice_id");
CREATE UNIQUE INDEX "invoices_idempotency_key_key" ON "invoices"("idempotency_key");
CREATE INDEX "invoices_opportunity_id_idx" ON "invoices"("opportunity_id");
CREATE INDEX "invoices_company_id_idx" ON "invoices"("company_id");
CREATE INDEX "invoices_contact_id_idx" ON "invoices"("contact_id");
CREATE INDEX "invoices_invoice_type_idx" ON "invoices"("invoice_type");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_sensitivity_class_idx" ON "invoices"("sensitivity_class");

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
CREATE TABLE "payments" (
  "id"                TEXT NOT NULL,
  "invoice_id"        TEXT NOT NULL,
  "xero_payment_id"   TEXT,
  "amount"            DECIMAL(14,2),
  "paid_at"           DATE,
  "reference"         TEXT,
  "sensitivity_class" TEXT NOT NULL DEFAULT 'general',
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_xero_payment_id_key" ON "payments"("xero_payment_id");
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- ---------------------------------------------------------------------------
-- bills (payables)
-- ---------------------------------------------------------------------------
CREATE TABLE "bills" (
  "id"                TEXT NOT NULL,
  "company_id"        TEXT,
  "contact_id"        TEXT,
  "bill_type"         TEXT,
  "org_key"           TEXT,
  "currency"          TEXT NOT NULL DEFAULT 'USD',
  "amount"            DECIMAL(14,2),
  "status"            TEXT NOT NULL DEFAULT 'awaiting_payment',
  "amount_paid"       DECIMAL(14,2),
  "due_date"          DATE,
  "xero_bill_id"      TEXT,
  "xero_contact_id"   TEXT,
  "sensitivity_class" TEXT NOT NULL DEFAULT 'general',
  "sync_error"        TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bills_xero_bill_id_key" ON "bills"("xero_bill_id");
CREATE INDEX "bills_company_id_idx" ON "bills"("company_id");
CREATE INDEX "bills_contact_id_idx" ON "bills"("contact_id");
CREATE INDEX "bills_sensitivity_class_idx" ON "bills"("sensitivity_class");

-- ---------------------------------------------------------------------------
-- credit_notes
-- ---------------------------------------------------------------------------
CREATE TABLE "credit_notes" (
  "id"                  TEXT NOT NULL,
  "company_id"          TEXT,
  "contact_id"          TEXT,
  "xero_credit_note_id" TEXT,
  "amount"              DECIMAL(14,2),
  "remaining_credit"    DECIMAL(14,2),
  "status"              TEXT,
  "currency"            TEXT NOT NULL DEFAULT 'USD',
  "reference"           TEXT,
  "sensitivity_class"   TEXT NOT NULL DEFAULT 'general',
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credit_notes_xero_credit_note_id_key" ON "credit_notes"("xero_credit_note_id");
CREATE INDEX "credit_notes_company_id_idx" ON "credit_notes"("company_id");
CREATE INDEX "credit_notes_contact_id_idx" ON "credit_notes"("contact_id");

-- ---------------------------------------------------------------------------
-- studio_shoot_credits (internal, non-monetary ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE "studio_shoot_credits" (
  "id"                     TEXT NOT NULL,
  "company_id"             TEXT NOT NULL,
  "delta"                  INTEGER NOT NULL,
  "reason"                 TEXT,
  "related_opportunity_id" TEXT,
  "note"                   TEXT,
  "created_by_id"          TEXT,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "studio_shoot_credits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "studio_shoot_credits_company_id_idx" ON "studio_shoot_credits"("company_id");
CREATE INDEX "studio_shoot_credits_related_opportunity_id_idx" ON "studio_shoot_credits"("related_opportunity_id");

-- ---------------------------------------------------------------------------
-- estimate_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE "estimate_line_items" (
  "id"           TEXT NOT NULL,
  "estimate_id"  TEXT NOT NULL,
  "description"  TEXT,
  "quantity"     DECIMAL(65,30),
  "unit_price"   DECIMAL(14,2),
  "product_code" TEXT,
  "line_total"   DECIMAL(14,2),
  "position"     INTEGER,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "estimate_line_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "estimate_line_items_estimate_id_idx" ON "estimate_line_items"("estimate_id");

-- ---------------------------------------------------------------------------
-- Extend products (Xero item catalog sync)
-- ---------------------------------------------------------------------------
ALTER TABLE "products" ADD COLUMN "org_key"        TEXT;
ALTER TABLE "products" ADD COLUMN "xero_item_id"   TEXT;
ALTER TABLE "products" ADD COLUMN "account_code"   TEXT;
ALTER TABLE "products" ADD COLUMN "tax_type"       TEXT;
ALTER TABLE "products" ADD COLUMN "quantity_basis" TEXT;
CREATE UNIQUE INDEX "products_xero_item_id_key" ON "products"("xero_item_id");

-- ---------------------------------------------------------------------------
-- Extend opportunity_line_items (invoice link + item code)
-- ---------------------------------------------------------------------------
ALTER TABLE "opportunity_line_items" ADD COLUMN "product_code" TEXT;
ALTER TABLE "opportunity_line_items" ADD COLUMN "invoice_id"   TEXT;
CREATE INDEX "opportunity_line_items_invoice_id_idx" ON "opportunity_line_items"("invoice_id");

-- ---------------------------------------------------------------------------
-- Extend companies (mastercover referral rollup — parity with easyfund)
-- ---------------------------------------------------------------------------
ALTER TABLE "companies" ADD COLUMN "mastercover_closed_referrals_amount" DECIMAL(14,2);

-- ---------------------------------------------------------------------------
-- Foreign keys (added last so all referenced tables exist)
-- ---------------------------------------------------------------------------
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_primary_recipient_contact_id_fkey"
  FOREIGN KEY ("primary_recipient_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_from_estimate_id_fkey"
  FOREIGN KEY ("from_estimate_id") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bills" ADD CONSTRAINT "bills_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bills" ADD CONSTRAINT "bills_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "studio_shoot_credits" ADD CONSTRAINT "studio_shoot_credits_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studio_shoot_credits" ADD CONSTRAINT "studio_shoot_credits_related_opportunity_id_fkey"
  FOREIGN KEY ("related_opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_estimate_id_fkey"
  FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "opportunity_line_items" ADD CONSTRAINT "opportunity_line_items_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Accounting object goes CRM-native: Xero removed; add partner receivables + payouts.

-- 1. Drop every Xero column (dropping a column also drops its unique index).
ALTER TABLE "companies" DROP COLUMN IF EXISTS "xero_contact_id";
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "xero_invoice_id";
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "xero_invoice_number";
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "xero_contact_id";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "xero_payment_id";
ALTER TABLE "bills" DROP COLUMN IF EXISTS "xero_bill_id";
ALTER TABLE "bills" DROP COLUMN IF EXISTS "xero_contact_id";
ALTER TABLE "credit_notes" DROP COLUMN IF EXISTS "xero_credit_note_id";

-- 2. Invoice: card rail default xero -> stripe; add PDF/send fields.
ALTER TABLE "invoices" ALTER COLUMN "billing_provider" SET DEFAULT 'stripe';
ALTER TABLE "invoices" ADD COLUMN "sent_at" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "pdf_path" TEXT;

-- 3. Payment: default -> stripe; add method + recorder.
ALTER TABLE "payments" ALTER COLUMN "billing_provider" SET DEFAULT 'stripe';
ALTER TABLE "payments" ADD COLUMN "method" TEXT;
ALTER TABLE "payments" ADD COLUMN "recorded_by_id" TEXT;

-- 4. CreditNote: CRM-native (drop provider; add issuer/applied; status NOT NULL default 'open').
ALTER TABLE "credit_notes" DROP COLUMN IF EXISTS "billing_provider";
ALTER TABLE "credit_notes" ADD COLUMN "applied_to_invoice_id" TEXT;
ALTER TABLE "credit_notes" ADD COLUMN "issued_by_id" TEXT;
UPDATE "credit_notes" SET "status" = 'open' WHERE "status" IS NULL;
ALTER TABLE "credit_notes" ALTER COLUMN "status" SET DEFAULT 'open';
ALTER TABLE "credit_notes" ALTER COLUMN "status" SET NOT NULL;

-- 5. Company: partner + payout rollups (rep-safe aggregates).
ALTER TABLE "companies" ADD COLUMN "total_partner_owed" DECIMAL(14,2);
ALTER TABLE "companies" ADD COLUMN "total_partner_settled" DECIMAL(14,2);
ALTER TABLE "companies" ADD COLUMN "total_payouts_pending" DECIMAL(14,2);
ALTER TABLE "companies" ADD COLUMN "total_payouts_paid" DECIMAL(14,2);

-- 6. Financing satellites: payout owed to the referring dealer (null = not a referral).
--    IF NOT EXISTS: easyfund_loans already ships this column; mastercover is new.
ALTER TABLE "easyfund_loans" ADD COLUMN IF NOT EXISTS "paid_to_referring_dealer" DECIMAL(14,2);
ALTER TABLE "mastercover_applications" ADD COLUMN IF NOT EXISTS "paid_to_referring_dealer" DECIMAL(14,2);

-- 7. PartnerReceivable — lender/insurer amount owed, accrued on close, settled monthly.
CREATE TABLE "partner_receivables" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "closed_at" DATE NOT NULL,
    "expected_settlement_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accrued',
    "settlement_payment_id" TEXT,
    "sensitivity_class" TEXT NOT NULL DEFAULT 'financing',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "partner_receivables_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "partner_receivables_opportunity_id_key" ON "partner_receivables"("opportunity_id");
CREATE INDEX "partner_receivables_company_id_idx" ON "partner_receivables"("company_id");
CREATE INDEX "partner_receivables_status_idx" ON "partner_receivables"("status");
CREATE INDEX "partner_receivables_expected_settlement_date_idx" ON "partner_receivables"("expected_settlement_date");
ALTER TABLE "partner_receivables" ADD CONSTRAINT "partner_receivables_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner_receivables" ADD CONSTRAINT "partner_receivables_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Payout — money owed/paid to a dealer.
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT,
    "amount_source" TEXT NOT NULL DEFAULT 'referral_field',
    "reference" TEXT,
    "paid_at" DATE,
    "related_opportunity_id" TEXT,
    "stripe_transfer_id" TEXT,
    "sensitivity_class" TEXT NOT NULL DEFAULT 'financing',
    "approved_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payouts_related_opportunity_id_key" ON "payouts"("related_opportunity_id");
CREATE INDEX "payouts_company_id_idx" ON "payouts"("company_id");
CREATE INDEX "payouts_status_idx" ON "payouts"("status");
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_related_opportunity_id_fkey" FOREIGN KEY ("related_opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

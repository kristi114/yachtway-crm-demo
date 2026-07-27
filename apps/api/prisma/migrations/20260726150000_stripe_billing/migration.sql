-- Stripe billing rail. Every financial row learns its rail via billing_provider
-- ('xero' default | 'stripe'); invoices/payments gain Stripe correlation ids; and
-- a subscriptions table mirrors Stripe Subscriptions. Additive.

ALTER TABLE "invoices" ADD COLUMN "billing_provider" TEXT NOT NULL DEFAULT 'xero';
ALTER TABLE "invoices" ADD COLUMN "stripe_invoice_id" TEXT;
CREATE UNIQUE INDEX "invoices_stripe_invoice_id_key" ON "invoices"("stripe_invoice_id");

ALTER TABLE "payments" ADD COLUMN "billing_provider" TEXT NOT NULL DEFAULT 'xero';
ALTER TABLE "payments" ADD COLUMN "stripe_payment_id" TEXT;
CREATE UNIQUE INDEX "payments_stripe_payment_id_key" ON "payments"("stripe_payment_id");
-- payments can now stand alone (a Stripe subscription payment has no CRM invoice)
ALTER TABLE "payments" ALTER COLUMN "invoice_id" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN "company_id" TEXT;
ALTER TABLE "payments" ADD COLUMN "subscription_id" TEXT;
CREATE INDEX "payments_company_id_idx" ON "payments"("company_id");
CREATE INDEX "payments_subscription_id_idx" ON "payments"("subscription_id");

ALTER TABLE "bills" ADD COLUMN "billing_provider" TEXT NOT NULL DEFAULT 'xero';

ALTER TABLE "credit_notes" ADD COLUMN "billing_provider" TEXT NOT NULL DEFAULT 'xero';

CREATE TABLE "subscriptions" (
  "id"                     TEXT NOT NULL,
  "company_id"             TEXT,
  "stripe_subscription_id" TEXT,
  "stripe_customer_id"     TEXT,
  "stripe_price_id"        TEXT,
  "product_name"           TEXT,
  "status"                 TEXT,
  "seats"                  INTEGER,
  "mrr"                    DECIMAL(14,2),
  "currency"               TEXT NOT NULL DEFAULT 'USD',
  "current_period_end"     TIMESTAMP(3),
  "billing_provider"       TEXT NOT NULL DEFAULT 'stripe',
  "sensitivity_class"      TEXT NOT NULL DEFAULT 'general',
  "created_by_id"          TEXT,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");
CREATE INDEX "subscriptions_company_id_idx" ON "subscriptions"("company_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- payments' new FKs (added after subscriptions exists)
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EasyFund credit fields:
--  * credit_score becomes numeric (exact score) instead of a band string
--  * self_reported_credit_score (picklist value) and buyer_cash_back (money) added
-- Safe cast: the CRM database is freshly provisioned (no rows yet).

ALTER TABLE "easyfund_loans"
  ALTER COLUMN "credit_score" SET DATA TYPE DECIMAL(65,30) USING "credit_score"::DECIMAL(65,30);

ALTER TABLE "easyfund_loans"
  ALTER COLUMN "co_applicant_credit_score" SET DATA TYPE DECIMAL(65,30) USING "co_applicant_credit_score"::DECIMAL(65,30);

ALTER TABLE "easyfund_loans" ADD COLUMN "self_reported_credit_score" TEXT;
ALTER TABLE "easyfund_loans" ADD COLUMN "buyer_cash_back" DECIMAL(14,2);

-- Add attachment_path for storing the original supplier document (PDF/image),
-- replacing the generated-PDF approach on supplier invoices.
ALTER TABLE "supplier_invoices"
  ADD COLUMN IF NOT EXISTS "attachment_path" VARCHAR(500);

-- Portability: remove the hardcoded OHADA default on the accounting account so
-- the account is resolved from company settings instead of a baked-in value.
ALTER TABLE "supplier_invoices"
  ALTER COLUMN "accounting_account" DROP DEFAULT;

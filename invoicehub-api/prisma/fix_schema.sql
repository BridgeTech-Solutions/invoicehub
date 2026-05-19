ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS initial_stock_account VARCHAR(20) DEFAULT '108000';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS escompte_accounting_account VARCHAR(20) DEFAULT '673000';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS collected_tax_account VARCHAR(20) DEFAULT '447200';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS deductible_tax_account VARCHAR(20) DEFAULT '447100';

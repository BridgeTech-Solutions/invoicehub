-- ============================================================
--  InvoiceHub v3 — Script de correction des numéros de compte
--  SYSCOHADA (plan comptable OHADA, numéros 4 chiffres)
--
--  Problème : des valeurs DEFAULT à 6 chiffres (ex: 447200,
--  521000, 411000…) ne correspondent à aucune entrée de la
--  table chart_of_accounts et provoquent des violations FK
--  sur journal_entry_lines.account_number.
--
--  Règle : seuls les numéros présents textuellement dans
--  insert_coa.sql sont utilisés ici. Zéro invention.
--
--  Mapping appliqué :
--    108000  → 1042   (Compte exploitant — Opérations courantes)
--    673000  → 673    (Escomptes accordés)
--    447200  → 4431   (TVA facturée sur ventes)
--    447100  → 4452   (TVA récupérable sur achats)
--    411000  → 4111   (Clients)
--    401000  → 4011   (Fournisseurs)
--    521000  → 5211   (Banques locales)
--    311000  → 3111   (Marchandises A1 — stock)
--    603100  → 6031   (Variations stocks marchandises)
--    603200  → 6032   (Variations stocks matières premières)
--    701000  → 7011   (Ventes marchandises — dans la Région)
--  Expense categories :
--    621000  → 6222   (Locations de bâtiments)
--    641000  → 6611   (Appointements, salaires, commissions)
--    624000  → 6181   (Voyages et déplacements)
--    626000  → 6281   (Frais de téléphone)
--    623000  → 6271   (Annonces, insertions publicitaires)
--    615000  → 6243   (Maintenance)
--    606000  → 6047   (Fournitures de bureau)
--    632000  → 633    (Frais de formation du personnel)
--    635000  → 641    (Impôts et taxes directs)
--    658000  → 6588   (Autres charges diverses)
-- ============================================================

BEGIN;

-- ============================================================
-- A) ALTER TABLE — Correction des valeurs DEFAULT
-- ============================================================

-- -----------------------------------------------------------
-- A.1  company_settings
-- -----------------------------------------------------------
-- initial_stock_account : 108000 → 1042
--   COA : ('1042','1','Opérations courantes','credit_normal','104',TRUE,TRUE)
ALTER TABLE company_settings
    ALTER COLUMN initial_stock_account
        SET DEFAULT '1042';

-- escompte_accounting_account : 673000 → 673
--   COA : ('673','6','ESCOMPTES ACCORDES','debit_normal','67',FALSE,TRUE)
ALTER TABLE company_settings
    ALTER COLUMN escompte_accounting_account
        SET DEFAULT '673';

-- collected_tax_account : 447200 → 4431
--   COA : ('4431','4','T.V.A. facturée sur ventes','credit_normal','443',TRUE,TRUE)
ALTER TABLE company_settings
    ALTER COLUMN collected_tax_account
        SET DEFAULT '4431';

-- deductible_tax_account : 447100 → 4452
--   COA : ('4452','4','T.V.A. récupérable sur achats','credit_normal','445',TRUE,TRUE)
ALTER TABLE company_settings
    ALTER COLUMN deductible_tax_account
        SET DEFAULT '4452';

-- -----------------------------------------------------------
-- A.2  tax_rates
-- -----------------------------------------------------------
-- (colonnes créées dans le CREATE TABLE et répétées dans l'ALTER TABLE 2.6c)
-- collected_tax_account : 447200 → 4431
ALTER TABLE tax_rates
    ALTER COLUMN collected_tax_account
        SET DEFAULT '4431';

-- deductible_tax_account : 447100 → 4452
ALTER TABLE tax_rates
    ALTER COLUMN deductible_tax_account
        SET DEFAULT '4452';

-- -----------------------------------------------------------
-- A.3  clients
-- -----------------------------------------------------------
-- accounting_account : 411000 → 4111
--   COA : ('4111','4','Clients','debit_normal','411',TRUE,TRUE)
ALTER TABLE clients
    ALTER COLUMN accounting_account
        SET DEFAULT '4111';

-- -----------------------------------------------------------
-- A.4  suppliers
-- -----------------------------------------------------------
-- accounting_account : 401000 → 4011
--   COA : ('4011','4','Fournisseurs','credit_normal','401',TRUE,TRUE)
ALTER TABLE suppliers
    ALTER COLUMN accounting_account
        SET DEFAULT '4011';

-- -----------------------------------------------------------
-- A.5  supplier_invoices
-- -----------------------------------------------------------
-- accounting_account : 401000 → 4011
ALTER TABLE supplier_invoices
    ALTER COLUMN accounting_account
        SET DEFAULT '4011';

-- -----------------------------------------------------------
-- A.6  bank_accounts
-- -----------------------------------------------------------
-- accounting_account : 521000 → 5211
--   COA : ('5211','5','Banques X','debit_normal','521',TRUE,TRUE)
ALTER TABLE bank_accounts
    ALTER COLUMN accounting_account
        SET DEFAULT '5211';

-- -----------------------------------------------------------
-- A.7  product_categories
-- -----------------------------------------------------------
-- stock_accounting_account : 311000 → 3111
--   COA : ('3111','3','Marchandises A1','debit_normal','311',TRUE,TRUE)
ALTER TABLE product_categories
    ALTER COLUMN stock_accounting_account
        SET DEFAULT '3111';

-- cogs_accounting_account : 603100 → 6031
--   COA : ('6031','6','Variations des stocks de marchandises','debit_normal','603',TRUE,TRUE)
ALTER TABLE product_categories
    ALTER COLUMN cogs_accounting_account
        SET DEFAULT '6031';

-- loss_accounting_account : 603200 → 6032
--   COA : ('6032','6','Variations des stocks de matières premières et fournitures liées','debit_normal','603',TRUE,TRUE)
ALTER TABLE product_categories
    ALTER COLUMN loss_accounting_account
        SET DEFAULT '6032';

-- sales_accounting_account : 701000 → 7011
--   COA : ('7011','7','dans la Région','credit_normal','701',TRUE,TRUE)
ALTER TABLE product_categories
    ALTER COLUMN sales_accounting_account
        SET DEFAULT '7011';

-- ============================================================
-- B) UPDATE — Correction des données existantes
-- ============================================================

-- -----------------------------------------------------------
-- B.1  company_settings
-- -----------------------------------------------------------
UPDATE company_settings
SET
    initial_stock_account       = '1042'  WHERE initial_stock_account       = '108000';

UPDATE company_settings
SET
    escompte_accounting_account = '673'   WHERE escompte_accounting_account = '673000';

UPDATE company_settings
SET
    collected_tax_account       = '4431'  WHERE collected_tax_account       = '447200';

UPDATE company_settings
SET
    deductible_tax_account      = '4452'  WHERE deductible_tax_account      = '447100';

-- -----------------------------------------------------------
-- B.2  tax_rates
-- -----------------------------------------------------------
UPDATE tax_rates
SET collected_tax_account = '4431'
WHERE collected_tax_account = '447200';

UPDATE tax_rates
SET deductible_tax_account = '4452'
WHERE deductible_tax_account = '447100';

-- -----------------------------------------------------------
-- B.3  clients
-- -----------------------------------------------------------
UPDATE clients
SET accounting_account = '4111'
WHERE accounting_account = '411000';

-- -----------------------------------------------------------
-- B.4  suppliers
-- -----------------------------------------------------------
UPDATE suppliers
SET accounting_account = '4011'
WHERE accounting_account = '401000';

-- -----------------------------------------------------------
-- B.5  supplier_invoices
-- -----------------------------------------------------------
UPDATE supplier_invoices
SET accounting_account = '4011'
WHERE accounting_account = '401000';

-- -----------------------------------------------------------
-- B.6  bank_accounts
-- -----------------------------------------------------------
UPDATE bank_accounts
SET accounting_account = '5211'
WHERE accounting_account = '521000';

-- -----------------------------------------------------------
-- B.7  product_categories — colonnes de compte
-- -----------------------------------------------------------
UPDATE product_categories
SET stock_accounting_account = '3111'
WHERE stock_accounting_account = '311000';

UPDATE product_categories
SET cogs_accounting_account = '6031'
WHERE cogs_accounting_account = '603100';

UPDATE product_categories
SET loss_accounting_account = '6032'
WHERE loss_accounting_account = '603200';

UPDATE product_categories
SET sales_accounting_account = '7011'
WHERE sales_accounting_account = '701000';

-- -----------------------------------------------------------
-- B.8  products — colonnes de compte (sans DEFAULT, NULL par défaut)
-- -----------------------------------------------------------
UPDATE products
SET stock_accounting_account = '3111'
WHERE stock_accounting_account = '311000';

UPDATE products
SET cogs_accounting_account = '6031'
WHERE cogs_accounting_account = '603100';

UPDATE products
SET loss_accounting_account = '6032'
WHERE loss_accounting_account = '603200';

UPDATE products
SET sales_accounting_account = '7011'
WHERE sales_accounting_account = '701000';

-- -----------------------------------------------------------
-- B.9  expense_categories — seed 10 catégories BTS
--
--  Mapping 6-digit → 4-digit (COA uniquement) :
--    621000 (Loyer)       → 6222  Locations de bâtiments
--    641000 (Personnel)   → 6611  Appointements salaires et commissions
--    624000 (Transport)   → 6181  Voyages et déplacements
--    626000 (Télécom)     → 6281  Frais de téléphone
--    623000 (Marketing)   → 6271  Annonces, insertions
--    615000 (Maintenance) → 6243  Maintenance
--    606000 (Fournitures) → 6047  Fournitures de bureau
--    632000 (Formation)   → 633   Frais de formation du personnel
--    635000 (Fiscalité)   → 641   Impôts et taxes directs
--    658000 (Divers)      → 6588  Autres charges diverses
-- -----------------------------------------------------------

-- Loyer & Charges : 621000 → 6222
--   COA : ('6222','6','Locations de bâtiments','debit_normal','622',TRUE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '6222',
    accounting_account_label = 'Locations de bâtiments'
WHERE accounting_account = '621000';

-- Personnel : 641000 → 6611
--   COA : ('6611','6','Appointements salaires et commissions','debit_normal','661',TRUE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '6611',
    accounting_account_label = 'Appointements salaires et commissions'
WHERE accounting_account = '641000';

-- Transport : 624000 → 6181
--   COA : ('6181','6','Voyages et déplacements','debit_normal','618',TRUE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '6181',
    accounting_account_label = 'Voyages et déplacements'
WHERE accounting_account = '624000';

-- Télécom & Internet : 626000 → 6281
--   COA : ('6281','6','Frais de téléphone','debit_normal','628',TRUE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '6281',
    accounting_account_label = 'Frais de téléphone'
WHERE accounting_account = '626000';

-- Marketing : 623000 → 6271
--   COA : ('6271','6','annonces, insertions','debit_normal','627',TRUE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '6271',
    accounting_account_label = 'Annonces, insertions publicitaires'
WHERE accounting_account = '623000';

-- Maintenance : 615000 → 6243
--   COA : ('6243','6','Maintenance','debit_normal','624',TRUE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '6243',
    accounting_account_label = 'Maintenance'
WHERE accounting_account = '615000';

-- Fournitures : 606000 → 6047
--   COA : ('6047','6','Fournitures de bureau','debit_normal','604',TRUE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '6047',
    accounting_account_label = 'Fournitures de bureau'
WHERE accounting_account = '606000';

-- Formation : 632000 → 633
--   COA : ('633','6','FRAIS DE FORMATION DU PERSONNEL','debit_normal','63',FALSE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '633',
    accounting_account_label = 'Frais de formation du personnel'
WHERE accounting_account = '632000';

-- Fiscalité & Légal : 635000 → 641
--   COA : ('641','6','IMPOTS ET TAXES DIRECTS','debit_normal','64',FALSE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '641',
    accounting_account_label = 'Impôts et taxes directs'
WHERE accounting_account = '635000';

-- Divers : 658000 → 6588
--   COA : ('6588','6','Autres charges diverses','debit_normal','658',TRUE,TRUE)
UPDATE expense_categories
SET
    accounting_account       = '6588',
    accounting_account_label = 'Autres charges diverses'
WHERE accounting_account = '658000';

-- -----------------------------------------------------------
-- B.10 expenses — colonne accounting_account (hérite catégorie)
-- -----------------------------------------------------------
UPDATE expenses
SET accounting_account = '6222'  WHERE accounting_account = '621000';
UPDATE expenses
SET accounting_account = '6611'  WHERE accounting_account = '641000';
UPDATE expenses
SET accounting_account = '6181'  WHERE accounting_account = '624000';
UPDATE expenses
SET accounting_account = '6281'  WHERE accounting_account = '626000';
UPDATE expenses
SET accounting_account = '6271'  WHERE accounting_account = '623000';
UPDATE expenses
SET accounting_account = '6243'  WHERE accounting_account = '615000';
UPDATE expenses
SET accounting_account = '6047'  WHERE accounting_account = '606000';
UPDATE expenses
SET accounting_account = '633'   WHERE accounting_account = '632000';
UPDATE expenses
SET accounting_account = '641'   WHERE accounting_account = '635000';
UPDATE expenses
SET accounting_account = '6588'  WHERE accounting_account = '658000';

-- -----------------------------------------------------------
-- B.11  Vérification des lignes impactées (optionnel — désactiver en prod)
-- -----------------------------------------------------------
-- SELECT 'company_settings.initial_stock_account'  AS col, COUNT(*) FROM company_settings WHERE initial_stock_account  = '108000'
-- UNION ALL
-- SELECT 'company_settings.escompte',              COUNT(*) FROM company_settings WHERE escompte_accounting_account = '673000'
-- UNION ALL
-- SELECT 'company_settings.collected_tax',         COUNT(*) FROM company_settings WHERE collected_tax_account       = '447200'
-- UNION ALL
-- SELECT 'company_settings.deductible_tax',        COUNT(*) FROM company_settings WHERE deductible_tax_account      = '447100'
-- UNION ALL
-- SELECT 'tax_rates.collected',                    COUNT(*) FROM tax_rates        WHERE collected_tax_account       = '447200'
-- UNION ALL
-- SELECT 'tax_rates.deductible',                   COUNT(*) FROM tax_rates        WHERE deductible_tax_account      = '447100'
-- UNION ALL
-- SELECT 'clients.accounting_account',             COUNT(*) FROM clients          WHERE accounting_account          = '411000'
-- UNION ALL
-- SELECT 'suppliers.accounting_account',           COUNT(*) FROM suppliers        WHERE accounting_account          = '401000'
-- UNION ALL
-- SELECT 'supplier_invoices.accounting_account',   COUNT(*) FROM supplier_invoices WHERE accounting_account         = '401000'
-- UNION ALL
-- SELECT 'bank_accounts.accounting_account',       COUNT(*) FROM bank_accounts    WHERE accounting_account          = '521000'
-- UNION ALL
-- SELECT 'product_categories.stock',               COUNT(*) FROM product_categories WHERE stock_accounting_account  = '311000'
-- UNION ALL
-- SELECT 'product_categories.cogs',                COUNT(*) FROM product_categories WHERE cogs_accounting_account   = '603100'
-- UNION ALL
-- SELECT 'product_categories.loss',                COUNT(*) FROM product_categories WHERE loss_accounting_account   = '603200'
-- UNION ALL
-- SELECT 'product_categories.sales',               COUNT(*) FROM product_categories WHERE sales_accounting_account  = '701000'
-- ;

COMMIT;

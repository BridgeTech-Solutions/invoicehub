-- ================================================================
-- fix_account_numbers.sql
-- InvoiceHub v3 — Bridge Technologies Solutions (BTS)
-- Correction des numéros de compte comptable OHADA/SYSCOHADA
-- Auteur : Claude (Anthropic) — Mai 2026
-- Source de vérité : chart-of-accounts-ohada.json (1 347 comptes OHADA)
--
-- RÈGLE ABSOLUE : tous les numéros ci-dessous existent textuellement
-- dans le fichier chart-of-accounts-ohada.json.
-- ================================================================
--
-- MAPPING COMPLET : ancien (incorrect) → nouveau (OHADA vérifié)
-- ┌────────────────────────────────────────────────────────────────────────────────────────────┐
-- │ ANCIEN (INCORRECT)  │ NOUVEAU (OHADA)  │ LIBELLÉ OHADA                                    │
-- ├─────────────────────┼─────────────────┼──────────────────────────────────────────────────┤
-- │ 447200              │ 4431            │ T.V.A. facturée sur ventes                        │
-- │ 447100              │ 4452            │ T.V.A. récupérable sur achats                     │
-- │ 108000              │ 1042            │ Compte de l'exploitant — Opérations courantes      │
-- │ 673000              │ 673             │ ESCOMPTES ACCORDES                                │
-- │ 411000              │ 4111            │ Clients                                           │
-- │ 401000              │ 4011            │ Fournisseurs                                      │
-- │ 311000              │ 3111            │ Marchandises A1 (stocks)                          │
-- │ 603100              │ 6031            │ Variations des stocks de marchandises              │
-- │ 603200              │ 6032            │ Variations des stocks de matières premières        │
-- │ 701000              │ 7011            │ Ventes de marchandises dans la Région             │
-- │ 706000              │ 7061            │ Services vendus dans la Région                    │
-- │ 521000              │ 5211            │ Banques X (banques locales)                       │
-- │ 621000              │ 6222            │ Locations de bâtiments                            │
-- │ 641000              │ 6611            │ Appointements salaires et commissions              │
-- │ 624000              │ 6181            │ Voyages et déplacements                           │
-- │ 626000              │ 6281            │ Frais de téléphone                                │
-- │ 623000              │ 6271            │ Annonces, insertions (Publicité)                  │
-- │ 615000              │ 6242            │ Entretien et réparations des biens mobiliers       │
-- │ 606000              │ 6041            │ Matières consommables (fournitures)               │
-- │ 632000              │ 633             │ FRAIS DE FORMATION DU PERSONNEL                   │
-- │ 635000              │ 6412            │ Patentes, licences et taxes annexes               │
-- │ 658000              │ 6588            │ Autres charges diverses                           │
-- └────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- TABLES CONCERNÉES :
--   company_settings, tax_rates, clients, suppliers,
--   supplier_invoices, bank_accounts, product_categories,
--   products, expense_categories, expenses
-- ================================================================

BEGIN;

-- ================================================================
-- SECTION A — ALTER TABLE : correction des valeurs DEFAULT
-- ================================================================

-- ----------------------------------------------------------------
-- A.1 company_settings
-- ----------------------------------------------------------------

-- initial_stock_account : 108000 → 1042 (Opérations courantes)
ALTER TABLE company_settings
    ALTER COLUMN initial_stock_account SET DEFAULT '1042';

-- escompte_accounting_account : 673000 → 673 (ESCOMPTES ACCORDES)
ALTER TABLE company_settings
    ALTER COLUMN escompte_accounting_account SET DEFAULT '673';

-- collected_tax_account : 447200 → 4431 (T.V.A. facturée sur ventes)
ALTER TABLE company_settings
    ALTER COLUMN collected_tax_account SET DEFAULT '4431';

-- deductible_tax_account : 447100 → 4452 (T.V.A. récupérable sur achats)
ALTER TABLE company_settings
    ALTER COLUMN deductible_tax_account SET DEFAULT '4452';

-- ----------------------------------------------------------------
-- A.2 tax_rates
-- ----------------------------------------------------------------

-- collected_tax_account : 447200 → 4431 (T.V.A. facturée sur ventes)
ALTER TABLE tax_rates
    ALTER COLUMN collected_tax_account SET DEFAULT '4431';

-- deductible_tax_account : 447100 → 4452 (T.V.A. récupérable sur achats)
ALTER TABLE tax_rates
    ALTER COLUMN deductible_tax_account SET DEFAULT '4452';

-- ----------------------------------------------------------------
-- A.3 clients
-- ----------------------------------------------------------------

-- accounting_account : 411000 → 4111 (Clients)
ALTER TABLE clients
    ALTER COLUMN accounting_account SET DEFAULT '4111';

-- ----------------------------------------------------------------
-- A.4 suppliers
-- ----------------------------------------------------------------

-- accounting_account : 401000 → 4011 (Fournisseurs)
ALTER TABLE suppliers
    ALTER COLUMN accounting_account SET DEFAULT '4011';

-- ----------------------------------------------------------------
-- A.5 supplier_invoices
-- ----------------------------------------------------------------

-- accounting_account : 401000 → 4011 (Fournisseurs)
ALTER TABLE supplier_invoices
    ALTER COLUMN accounting_account SET DEFAULT '4011';

-- ----------------------------------------------------------------
-- A.6 bank_accounts
-- ----------------------------------------------------------------

-- accounting_account : 521000 → 5211 (Banques X)
ALTER TABLE bank_accounts
    ALTER COLUMN accounting_account SET DEFAULT '5211';

-- ----------------------------------------------------------------
-- A.7 product_categories
-- ----------------------------------------------------------------

-- stock_accounting_account : 311000 → 3111 (Marchandises A1)
ALTER TABLE product_categories
    ALTER COLUMN stock_accounting_account SET DEFAULT '3111';

-- cogs_accounting_account : 603100 → 6031 (Variations des stocks de marchandises)
ALTER TABLE product_categories
    ALTER COLUMN cogs_accounting_account SET DEFAULT '6031';

-- loss_accounting_account : 603200 → 6032 (Variations des stocks de matières premières)
ALTER TABLE product_categories
    ALTER COLUMN loss_accounting_account SET DEFAULT '6032';

-- sales_accounting_account : 701000 → 7011 (Ventes de marchandises dans la Région)
ALTER TABLE product_categories
    ALTER COLUMN sales_accounting_account SET DEFAULT '7011';

-- ================================================================
-- SECTION B — UPDATE : correction des données existantes
-- ================================================================

-- ----------------------------------------------------------------
-- B.1 company_settings
-- ----------------------------------------------------------------

-- initial_stock_account → 1042 : Opérations courantes
UPDATE company_settings
    SET initial_stock_account = '1042'
    WHERE initial_stock_account = '108000';

-- escompte_accounting_account → 673 : ESCOMPTES ACCORDES
UPDATE company_settings
    SET escompte_accounting_account = '673'
    WHERE escompte_accounting_account = '673000';

-- collected_tax_account → 4431 : T.V.A. facturée sur ventes
UPDATE company_settings
    SET collected_tax_account = '4431'
    WHERE collected_tax_account = '447200';

-- deductible_tax_account → 4452 : T.V.A. récupérable sur achats
UPDATE company_settings
    SET deductible_tax_account = '4452'
    WHERE deductible_tax_account = '447100';

-- ----------------------------------------------------------------
-- B.2 tax_rates
-- ----------------------------------------------------------------

-- collected_tax_account → 4431 : T.V.A. facturée sur ventes
UPDATE tax_rates
    SET collected_tax_account = '4431'
    WHERE collected_tax_account = '447200';

-- deductible_tax_account → 4452 : T.V.A. récupérable sur achats
UPDATE tax_rates
    SET deductible_tax_account = '4452'
    WHERE deductible_tax_account = '447100';

-- ----------------------------------------------------------------
-- B.3 clients
-- ----------------------------------------------------------------

-- accounting_account → 4111 : Clients
UPDATE clients
    SET accounting_account = '4111'
    WHERE accounting_account = '411000';

-- ----------------------------------------------------------------
-- B.4 suppliers
-- ----------------------------------------------------------------

-- accounting_account → 4011 : Fournisseurs
UPDATE suppliers
    SET accounting_account = '4011'
    WHERE accounting_account = '401000';

-- ----------------------------------------------------------------
-- B.5 supplier_invoices
-- ----------------------------------------------------------------

-- accounting_account → 4011 : Fournisseurs
UPDATE supplier_invoices
    SET accounting_account = '4011'
    WHERE accounting_account = '401000';

-- ----------------------------------------------------------------
-- B.6 bank_accounts
-- ----------------------------------------------------------------

-- accounting_account → 5211 : Banques X
UPDATE bank_accounts
    SET accounting_account = '5211'
    WHERE accounting_account = '521000';

-- ----------------------------------------------------------------
-- B.7 product_categories
-- ----------------------------------------------------------------

-- stock_accounting_account → 3111 : Marchandises A1
UPDATE product_categories
    SET stock_accounting_account = '3111'
    WHERE stock_accounting_account = '311000';

-- cogs_accounting_account → 6031 : Variations des stocks de marchandises
UPDATE product_categories
    SET cogs_accounting_account = '6031'
    WHERE cogs_accounting_account = '603100';

-- loss_accounting_account → 6032 : Variations des stocks de matières premières
UPDATE product_categories
    SET loss_accounting_account = '6032'
    WHERE loss_accounting_account = '603200';

-- sales_accounting_account → 7011 : Ventes de marchandises dans la Région
UPDATE product_categories
    SET sales_accounting_account = '7011'
    WHERE sales_accounting_account = '701000';

-- ----------------------------------------------------------------
-- B.8 products (colonnes sans DEFAULT — correction des valeurs insérées)
-- ----------------------------------------------------------------

-- stock_accounting_account → 3111 : Marchandises A1
UPDATE products
    SET stock_accounting_account = '3111'
    WHERE stock_accounting_account = '311000';

-- cogs_accounting_account → 6031 : Variations des stocks de marchandises
UPDATE products
    SET cogs_accounting_account = '6031'
    WHERE cogs_accounting_account = '603100';

-- loss_accounting_account → 6032 : Variations des stocks de matières premières
UPDATE products
    SET loss_accounting_account = '6032'
    WHERE loss_accounting_account = '603200';

-- sales_accounting_account → 7011 : Ventes de marchandises dans la Région
UPDATE products
    SET sales_accounting_account = '7011'
    WHERE sales_accounting_account = '701000';

-- sales_accounting_account → 7061 : Services vendus dans la Région
UPDATE products
    SET sales_accounting_account = '7061'
    WHERE sales_accounting_account = '706000';

-- ----------------------------------------------------------------
-- B.9 expense_categories — correction du seed existant
-- ----------------------------------------------------------------

-- 'Loyer & Charges' : 621000 → 6222 (Locations de bâtiments)
UPDATE expense_categories
    SET accounting_account       = '6222',
        accounting_account_label = 'Locations de bâtiments'
    WHERE name = 'Loyer & Charges'
      AND accounting_account = '621000';

-- 'Personnel' : 641000 → 6611 (Appointements salaires et commissions)
UPDATE expense_categories
    SET accounting_account       = '6611',
        accounting_account_label = 'Appointements salaires et commissions'
    WHERE name = 'Personnel'
      AND accounting_account = '641000';

-- 'Transport' : 624000 → 6181 (Voyages et déplacements)
UPDATE expense_categories
    SET accounting_account       = '6181',
        accounting_account_label = 'Voyages et déplacements'
    WHERE name = 'Transport'
      AND accounting_account = '624000';

-- 'Télécom & Internet' : 626000 → 6281 (Frais de téléphone)
UPDATE expense_categories
    SET accounting_account       = '6281',
        accounting_account_label = 'Frais de téléphone'
    WHERE name = 'Télécom & Internet'
      AND accounting_account = '626000';

-- 'Marketing' : 623000 → 6271 (Annonces, insertions — Publicité)
UPDATE expense_categories
    SET accounting_account       = '6271',
        accounting_account_label = 'Annonces et insertions publicitaires'
    WHERE name = 'Marketing'
      AND accounting_account = '623000';

-- 'Maintenance' : 615000 → 6242 (Entretien et réparations des biens mobiliers)
UPDATE expense_categories
    SET accounting_account       = '6242',
        accounting_account_label = 'Entretien et réparations des biens mobiliers'
    WHERE name = 'Maintenance'
      AND accounting_account = '615000';

-- 'Fournitures' : 606000 → 6041 (Matières consommables)
UPDATE expense_categories
    SET accounting_account       = '6041',
        accounting_account_label = 'Matières consommables'
    WHERE name = 'Fournitures'
      AND accounting_account = '606000';

-- 'Formation' : 632000 → 633 (FRAIS DE FORMATION DU PERSONNEL)
UPDATE expense_categories
    SET accounting_account       = '633',
        accounting_account_label = 'Frais de formation du personnel'
    WHERE name = 'Formation'
      AND accounting_account = '632000';

-- 'Fiscalité & Légal' : 635000 → 6412 (Patentes, licences et taxes annexes)
UPDATE expense_categories
    SET accounting_account       = '6412',
        accounting_account_label = 'Patentes, licences et taxes annexes'
    WHERE name = 'Fiscalité & Légal'
      AND accounting_account = '635000';

-- 'Divers' : 658000 → 6588 (Autres charges diverses)
UPDATE expense_categories
    SET accounting_account       = '6588',
        accounting_account_label = 'Autres charges diverses'
    WHERE name = 'Divers'
      AND accounting_account = '658000';

-- ----------------------------------------------------------------
-- B.10 expenses — correction des comptes portés par des dépenses existantes
-- ----------------------------------------------------------------

-- 621000 → 6222 : Locations de bâtiments
UPDATE expenses SET accounting_account = '6222' WHERE accounting_account = '621000';

-- 641000 → 6611 : Appointements salaires et commissions
UPDATE expenses SET accounting_account = '6611' WHERE accounting_account = '641000';

-- 624000 → 6181 : Voyages et déplacements
UPDATE expenses SET accounting_account = '6181' WHERE accounting_account = '624000';

-- 626000 → 6281 : Frais de téléphone
UPDATE expenses SET accounting_account = '6281' WHERE accounting_account = '626000';

-- 623000 → 6271 : Annonces et insertions publicitaires
UPDATE expenses SET accounting_account = '6271' WHERE accounting_account = '623000';

-- 615000 → 6242 : Entretien et réparations des biens mobiliers
UPDATE expenses SET accounting_account = '6242' WHERE accounting_account = '615000';

-- 606000 → 6041 : Matières consommables
UPDATE expenses SET accounting_account = '6041' WHERE accounting_account = '606000';

-- 632000 → 633 : Frais de formation du personnel
UPDATE expenses SET accounting_account = '633' WHERE accounting_account = '632000';

-- 635000 → 6412 : Patentes, licences et taxes annexes
UPDATE expenses SET accounting_account = '6412' WHERE accounting_account = '635000';

-- 658000 → 6588 : Autres charges diverses
UPDATE expenses SET accounting_account = '6588' WHERE accounting_account = '658000';

-- ================================================================
-- VÉRIFICATION RAPIDE POST-MIGRATION (décommenter après le COMMIT)
-- ================================================================
-- SELECT 'company_settings' AS tbl,
--        initial_stock_account, escompte_accounting_account,
--        collected_tax_account, deductible_tax_account
-- FROM company_settings LIMIT 1;
--
-- SELECT 'tax_rates' AS tbl, name, collected_tax_account, deductible_tax_account
-- FROM tax_rates WHERE deleted_at IS NULL;
--
-- SELECT 'expense_categories' AS tbl, name, accounting_account, accounting_account_label
-- FROM expense_categories WHERE deleted_at IS NULL ORDER BY sort_order;
--
-- SELECT 'product_categories' AS tbl, name,
--        stock_accounting_account, cogs_accounting_account,
--        loss_accounting_account, sales_accounting_account
-- FROM product_categories WHERE deleted_at IS NULL;

COMMIT;

-- ================================================================
-- FIN DU SCRIPT
-- ================================================================

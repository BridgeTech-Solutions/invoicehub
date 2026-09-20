-- ============================================================================
-- Migration : TVA sur encaissement (prestations de services).
-- - compte technique "TVA en attente d'exigibilite" (4438)
-- - reglages company_settings : compte + interrupteur de regime
-- Idempotente, rejouable.
-- A executer :  psql -U postgres -d invoicehub -f prisma/add_tva_on_collection.sql
-- ============================================================================

-- Compte de TVA collectee mais pas encore exigible (services non encaisses).
INSERT INTO chart_of_accounts (account_number, account_class, name, account_nature, parent_account_number, is_detail_account, is_system)
VALUES ('4438', '4', 'Etat, T.V.A. en attente d''exigibilite (encaissements)', 'credit_normal', '443', TRUE, TRUE)
ON CONFLICT (account_number) DO NOTHING;

-- Reglages : compte "en attente" + regime "TVA services sur encaissement".
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pending_tva_account VARCHAR(20) NOT NULL DEFAULT '4438';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tva_on_collection   BOOLEAN     NOT NULL DEFAULT FALSE;

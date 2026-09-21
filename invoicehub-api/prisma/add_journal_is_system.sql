-- Journaux comptables : flag "système" pour protéger les journaux essentiels
-- (ventes, achats, banque, caisse, OD, à-nouveaux, clôture) contre la suppression,
-- la désactivation et le changement de type — sinon le moteur d'écritures lève
-- « Journal introuvable » au runtime (facture / paiement / clôture d'exercice).
ALTER TABLE accounting_journals ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Marque les journaux seedés d'origine comme systèmes.
UPDATE accounting_journals SET is_system = TRUE
 WHERE code IN ('VTE', 'ACH', 'BQ', 'CAI', 'OD', 'AN', 'CL');

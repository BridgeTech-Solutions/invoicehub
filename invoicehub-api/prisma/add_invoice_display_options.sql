-- Migration : options d'affichage du PDF par facture.
-- Permet de masquer, sur une facture donnée, certains éléments du PDF sans
-- toucher aux calculs ni à la comptabilité (pur affichage). Structure JSON
-- extensible : { "hidePtColumn": true, "hideTotalHt": true }.
--   - hidePtColumn : masque la colonne PT (montant par ligne d'article)
--   - hideTotalHt  : masque la/les ligne(s) TOTAL HT du bloc totaux
-- Cas d'usage : un client qui, sur une facture solde, ne veut pas voir le
-- détail des montants par ligne ni le HT du projet complet.
-- Idempotent : réexécutable sans erreur.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS display_options JSONB NOT NULL DEFAULT '{}';

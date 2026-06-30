-- Migration : option « avances et acomptes reçus » (compte 4191, SYSCOHADA).
-- Quand `use_advance_account` est activé, une facture d'acompte est comptabilisée
-- en avance reçue (Dr 411 / Cr 4191) au lieu d'une vente immédiate ; le produit et
-- la TVA sont reconnus à la livraison (facture de solde), qui reprend l'avance
-- (Dr 4191 / Cr 411). Désactivé par défaut -> aucun changement de comportement.
-- Idempotent : réexécutable sans erreur.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS use_advance_account BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS advance_account VARCHAR(20) NOT NULL DEFAULT '4191';

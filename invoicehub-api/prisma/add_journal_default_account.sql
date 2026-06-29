-- Migration : compte de contrepartie par défaut sur les journaux comptables.
-- Le formulaire envoyait déjà `defaultAccountId` mais il n'était ni accepté par
-- le schéma, ni stocké (aucune colonne) -> champ inopérant. Ajout de la colonne.
ALTER TABLE accounting_journals ADD COLUMN IF NOT EXISTS default_account_id VARCHAR(20);

-- Migration : colonne `description` sur les journaux comptables
-- Le schéma Zod acceptait déjà `description` (create/updateJournalSchema) mais la
-- colonne n'existait pas en BD -> PUT /journals/:id plantait (Unknown argument).
-- À exécuter une fois sur le serveur (idempotent grâce à IF NOT EXISTS).
ALTER TABLE accounting_journals ADD COLUMN IF NOT EXISTS description TEXT;

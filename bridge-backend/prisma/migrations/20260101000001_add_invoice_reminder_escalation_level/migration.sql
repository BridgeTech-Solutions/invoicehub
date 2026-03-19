-- Migration : ajout de reminder_escalation_level sur la table invoices
-- La colonne existe sur proformas dans le schéma SQL initial mais manquait sur invoices.
-- Utilisée par le job de relance escalante (reminder.processor.ts).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS reminder_escalation_level SMALLINT NOT NULL DEFAULT 0;

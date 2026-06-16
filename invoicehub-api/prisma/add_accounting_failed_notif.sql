-- Migration : nouveau type de notification « écriture comptable échouée »
-- À exécuter une fois sur le serveur (idempotent grâce à IF NOT EXISTS).
-- Nécessaire pour la notification non bloquante des échecs d'écriture auto.
ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'accounting_entry_failed';

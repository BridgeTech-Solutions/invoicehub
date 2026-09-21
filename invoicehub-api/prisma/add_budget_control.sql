-- Contrôle budgétaire configurable (remplace les seuils 80/100 % et « admins » codés
-- en dur). warnThresholdPct = seuil d'alerte ; blockOnExceed = refuser l'approbation
-- d'une dépense qui dépasse le budget ; notifyRoles = rôles notifiés.
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS budget_control JSONB NOT NULL
  DEFAULT '{"warnThresholdPct": 80, "blockOnExceed": false, "notifyRoles": ["admin"]}'::jsonb;

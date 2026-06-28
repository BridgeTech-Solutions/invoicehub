-- Migration corrective : périodes fiscales mensuelles décalées d'un jour
-- Cause : seed.ts construisait les dates avec le constructeur Date LOCAL
-- (new Date(year, month, 1)) ; sur serveur UTC+1 (Cameroun), minuit local = 23h UTC
-- la veille, et la colonne @db.Date tronque -> start/end décalés de -1 jour.
--
-- Correction : pour les périodes mensuelles non alignées sur le 1er du mois,
-- on rajoute 1 jour à start_date et end_date pour rétablir le mois calendaire.
-- Idempotent : les périodes déjà alignées (start = 1er du mois) ne sont pas touchées.
UPDATE fiscal_periods
SET start_date = start_date + INTERVAL '1 day',
    end_date   = end_date   + INTERVAL '1 day'
WHERE period_type = 'month'
  AND EXTRACT(DAY FROM start_date) <> 1;

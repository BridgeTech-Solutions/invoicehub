-- Envoi des documents par email — 2026-09-23
-- Config Reply-To (paramètres) + traçabilité "dernière fois envoyé par email".

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;

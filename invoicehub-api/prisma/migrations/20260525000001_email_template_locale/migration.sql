-- Migration: email_template_locale
-- Ajoute le champ locale sur email_templates et change la contrainte d'unicité

-- 1. Supprimer l'ancienne contrainte d'unicité sur type seul
ALTER TABLE "email_templates" DROP CONSTRAINT IF EXISTS "email_templates_type_key";

-- 2. Ajouter la colonne locale avec valeur par défaut 'fr'
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "locale" VARCHAR(5) NOT NULL DEFAULT 'fr';

-- 3. Créer la nouvelle contrainte d'unicité sur (type, locale)
ALTER TABLE "email_templates"
    ADD CONSTRAINT "email_templates_type_locale_key" UNIQUE ("type", "locale");

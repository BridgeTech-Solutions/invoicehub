-- ─────────────────────────────────────────────────────────────────────────────
-- Migration InvoiceHub v3 — à exécuter sur le serveur de déploiement
-- Applique les changements de schéma Prisma qui ne sont pas encore en base
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. audit_logs : renommer user_role → user_role_name (preserve les données)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'user_role'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'user_role_name'
  ) THEN
    ALTER TABLE audit_logs RENAME COLUMN user_role TO user_role_name;
    RAISE NOTICE 'audit_logs.user_role renommé en user_role_name';
  ELSE
    RAISE NOTICE 'audit_logs : aucune action nécessaire';
  END IF;
END $$;

-- 2. email_templates : ajouter la colonne locale
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS locale VARCHAR(5) NOT NULL DEFAULT 'fr';

-- 3. email_templates : supprimer l'ancienne contrainte unique sur type seul
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_templates_type_key'
      AND conrelid = 'email_templates'::regclass
  ) THEN
    ALTER TABLE email_templates DROP CONSTRAINT email_templates_type_key;
    RAISE NOTICE 'Contrainte email_templates_type_key supprimée';
  ELSE
    RAISE NOTICE 'Contrainte email_templates_type_key absente — ignoré';
  END IF;
END $$;

-- 4. email_templates : ajouter la nouvelle contrainte unique (type, locale)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_templates_type_locale_key'
      AND conrelid = 'email_templates'::regclass
  ) THEN
    ALTER TABLE email_templates ADD CONSTRAINT email_templates_type_locale_key UNIQUE (type, locale);
    RAISE NOTICE 'Contrainte email_templates_type_locale_key créée';
  ELSE
    RAISE NOTICE 'Contrainte email_templates_type_locale_key déjà présente — ignoré';
  END IF;
END $$;

-- Vérification finale
SELECT
  'email_templates.locale' AS check_item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_templates' AND column_name = 'locale'
  ) THEN '✅ OK' ELSE '❌ MANQUANT' END AS status
UNION ALL
SELECT
  'audit_logs.user_role_name',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_logs' AND column_name = 'user_role_name'
  ) THEN '✅ OK' ELSE '❌ MANQUANT' END
UNION ALL
SELECT
  'unique(type,locale)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_templates_type_locale_key'
  ) THEN '✅ OK' ELSE '❌ MANQUANT' END;

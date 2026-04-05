/**
 * Setup des tests d'INTÉGRATION — chargé avant chaque suite via jest.config.ts
 *
 * Nécessite une base PostgreSQL de test démarrée via :
 *   docker-compose up db -d
 *
 * La base de test est réinitialisée avant chaque suite (truncate des tables).
 * Pour lancer uniquement les tests d'intégration :
 *   pnpm test:integration
 */

// ── Variables d'environnement pour les tests d'intégration ───────────────────
process.env.NODE_ENV                 = 'test';
process.env.PORT                     = '3001';
process.env.API_PREFIX               = '/api';
process.env.DATABASE_URL             = process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:strongpassword@localhost:5432/invoicehub_test';
process.env.JWT_ACCESS_SECRET        = 'test_access_secret_at_least_32_chars_long!!';
process.env.JWT_REFRESH_SECRET       = 'test_refresh_secret_at_least_32_chars_long!';
process.env.JWT_ACCESS_EXPIRES_IN    = '15m';
process.env.JWT_REFRESH_EXPIRES_IN   = '7d';
process.env.REDIS_URL                = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';
process.env.APP_URL                  = 'http://localhost:3001';
process.env.BACKEND_URL              = 'http://localhost:3000';
process.env.TOTP_ISSUER              = 'InvoiceHub BTS Test';
process.env.SMTP_HOST                = 'smtp.test.local';
process.env.SMTP_PORT                = '587';
process.env.SMTP_SECURE              = 'false';
process.env.SMTP_USER                = 'test@bts.cm';
process.env.SMTP_PASS                = 'test_smtp_pass';
process.env.SMTP_FROM                = 'noreply@bts.cm';
process.env.OLLAMA_ENABLED           = 'false';
process.env.OLLAMA_MODEL             = 'mistral';
process.env.BACKUP_STORAGE_DISK      = 'local';
process.env.BACKUP_DIR               = '/tmp/test-backups';
process.env.BACKUP_RETENTION_DAYS    = '1';
process.env.BACKUP_CRON              = '0 0 * * *';
process.env.PGDUMP_PATH              = 'pg_dump';
process.env.DB_PASSWORD              = 'strongpassword';
process.env.SERVER_IP                = 'localhost';
process.env.CORS_ORIGINS             = '';

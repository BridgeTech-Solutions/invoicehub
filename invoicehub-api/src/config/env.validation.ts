import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api'),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default('false').transform(v => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@bts.cm'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  APP_URL: z.string().url(),
  CORS_ORIGINS: z.string().optional(),
  BACKEND_URL: z.string().url(),
  TOTP_ISSUER: z.string().default('InvoiceHub BTS'),

  BACKUP_STORAGE_DISK: z.enum(['local', 's3', 'google', 'azure', 'onedrive']).default('local'),
  BACKUP_DIR: z.string().default('./uploads/backups'),
  BACKUP_RETENTION_DAYS: z.coerce.number().default(30),
  BACKUP_CRON: z.string().default('30 15 * * *'),
  BACKUP_INCLUDE_FILES: z.string().default('false').transform(v => v === 'true'),
  UPLOADS_DIR: z.string().default('./uploads'),
  PGDUMP_PATH: z.string().default('pg_dump'),
  PGDUMP_DOCKER_CONTAINER: z.string().optional(),

  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),

  GCS_BUCKET: z.string().optional(),
  GCS_KEY_FILE: z.string().optional(),

  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().optional(),

  ONEDRIVE_TENANT_ID: z.string().optional(),
  ONEDRIVE_CLIENT_ID: z.string().optional(),
  ONEDRIVE_CLIENT_SECRET: z.string().optional(),
  ONEDRIVE_DRIVE_ID: z.string().optional(),
  ONEDRIVE_FOLDER_PATH: z.string().default('InvoiceHub/Backups'),

  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('phi3:mini'),
  OLLAMA_ENABLED: z.string().default('false').transform(v => v === 'true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    console.error('❌ Variables d\'environnement invalides :');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

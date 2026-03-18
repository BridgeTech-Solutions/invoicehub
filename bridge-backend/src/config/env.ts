/**
 * @module config/env
 * Validation des variables d'environnement au démarrage de l'application.
 *
 * Utilise Zod pour parser et valider `process.env`. Si une variable requise
 * est absente ou invalide, l'application s'arrête immédiatement avec un
 * message d'erreur explicite — jamais de valeur silencieusement incorrecte.
 */
import { z } from 'zod';

const envSchema = z.object({
  /** Environnement d'exécution : contrôle le niveau de logs et l'exposition des erreurs */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /** Port d'écoute du serveur HTTP */
  PORT: z.coerce.number().default(3000),

  /** Préfixe commun à toutes les routes API (ex: `/api`) */
  API_PREFIX: z.string().default('/api'),

  // --- Base de données ---
  /** URL de connexion Prisma/PostgreSQL au format postgresql://user:pass@host:port/db */
  DATABASE_URL: z.string().url(),

  // --- JWT ---
  /** Clé secrète de signature des access tokens (min 32 caractères) */
  JWT_ACCESS_SECRET: z.string().min(32),
  /** Clé secrète de signature des refresh tokens (min 32 caractères) */
  JWT_REFRESH_SECRET: z.string().min(32),
  /** Durée de vie des access tokens (ex: '15m', '1h') */
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  /** Durée de vie des refresh tokens (ex: '7d', '30d') */
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // --- SMTP ---
  /** Hôte du serveur SMTP sortant */
  SMTP_HOST: z.string().optional(),
  /** Port SMTP (587 = STARTTLS, 465 = SSL) */
  SMTP_PORT: z.coerce.number().default(587),
  /** `true` = connexion SSL directe ; `false` = STARTTLS */
  SMTP_SECURE: z.string().transform(v => v === 'true').default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Adresse expéditeur affichée dans les emails sortants */
  SMTP_FROM: z.string().default('noreply@bts.cm'),

  // --- Redis ---
  /** URL de connexion Redis pour BullMQ (ex: redis://localhost:6379) */
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // --- Application ---
  /** URL publique de l'application frontend — utilisée dans les liens des emails et CORS */
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** URL publique du backend — utilisée pour construire les URLs des fichiers uploadés */
  BACKEND_URL: z.string().url().default('http://localhost:3001'),
  /** Nom de l'émetteur affiché dans l'application authenticator pour le 2FA */
  TOTP_ISSUER: z.string().default('InvoiceHub BTS'),

  // --- Backups ---
  /** Disque de stockage des backups : local | s3 | google | azure */
  BACKUP_STORAGE_DISK: z.enum(['local', 's3', 'google', 'azure']).default('local'),
  /** Dossier local pour les backups (utilisé si BACKUP_STORAGE_DISK=local) */
  BACKUP_DIR: z.string().default('./uploads/backups'),
  /** Rétention des backups en jours (suppression automatique) */
  BACKUP_RETENTION_DAYS: z.coerce.number().default(30),
  /** Expression cron du backup automatique quotidien */
  BACKUP_CRON: z.string().default('0 0 * * *'),
  /** Chemin vers l'exécutable pg_dump */
  PGDUMP_PATH: z.string().default('pg_dump'),
  /**
   * Si défini, lance pg_dump via `docker exec <container> pg_dump ...`
   * Utile en dev quand la BD est dans Docker et pg_dump n'est pas installé sur l'hôte.
   * Exemple : bridge-backend-db-1
   */
  PGDUMP_DOCKER_CONTAINER: z.string().optional(),

  // S3 / Cloudflare R2 / MinIO
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Endpoint custom pour R2 ou MinIO (laisser vide pour AWS S3) */
  S3_ENDPOINT: z.string().optional(),

  // Google Cloud Storage
  GCS_BUCKET: z.string().optional(),
  /** Chemin vers le fichier JSON de compte de service GCP */
  GCS_KEY_FILE: z.string().optional(),

  // Microsoft Azure Blob Storage
  /** Chaîne de connexion Azure Storage (portail Azure → Compte de stockage → Clés d'accès) */
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  /** Nom du conteneur Azure Blob (ex: invoicehub-backups) */
  AZURE_STORAGE_CONTAINER: z.string().optional(),

  // --- BTS Assistant (Ollama) ---
  /** URL de l'API Ollama (ex: http://localhost:11434) */
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  /** Nom du modèle Ollama à utiliser (ex: mistral) */
  OLLAMA_MODEL: z.string().default('mistral'),
  /** Active ou désactive BTS Assistant */
  OLLAMA_ENABLED: z.string().transform(v => v === 'true').default('false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables d\'environnement invalides :');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

/** Objet typé contenant toutes les variables d'environnement validées */
export const env = parsed.data;
export type Env = typeof env;

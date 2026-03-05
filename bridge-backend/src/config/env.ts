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

  // --- Application ---
  /** URL publique de l'application — utilisée dans les liens des emails */
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** Nom de l'émetteur affiché dans l'application authenticator pour le 2FA */
  TOTP_ISSUER: z.string().default('InvoiceHub BTS'),
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

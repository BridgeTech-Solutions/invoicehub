/**
 * @module lib/jwt
 * Utilitaires de création et vérification des JSON Web Tokens.
 *
 * Architecture à deux tokens :
 *  - **Access token** (courte durée, ex: 15 min) : transmis dans l'en-tête
 *    `Authorization: Bearer <token>` à chaque requête protégée.
 *  - **Refresh token** (longue durée, ex: 7 jours) : stocké en base (hash SHA-256)
 *    pour permettre la rotation et la révocation unitaire.
 */
import * as jwt from 'jsonwebtoken';

const env = {
  JWT_ACCESS_SECRET:     process.env.JWT_ACCESS_SECRET  ?? '',
  JWT_REFRESH_SECRET:    process.env.JWT_REFRESH_SECRET ?? '',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN  ?? '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
};

// ---------------------------------------------------------------------------
// Interfaces — structure des payloads JWT
// ---------------------------------------------------------------------------

/** Contenu décodé d'un access token */
export interface AccessTokenPayload {
  /** Identifiant UUID de l'utilisateur (« subject » JWT) */
  sub: string;
  /** Email de l'utilisateur — dénormalisé pour éviter une requête DB à chaque appel */
  email: string;
  /** Rôle RBAC : 'admin' | 'commercial' | 'employee' */
  role: string;
  /** Discriminant de type pour éviter la confusion avec un refresh token */
  type: 'access';
}

/** Contenu décodé d'un refresh token */
export interface RefreshTokenPayload {
  /** Identifiant UUID de l'utilisateur */
  sub: string;
  /** Discriminant de type */
  type: 'refresh';
}

// ---------------------------------------------------------------------------
// Fonctions de signature
// ---------------------------------------------------------------------------

/**
 * Génère un access token signé avec HMAC-SHA256.
 *
 * @param payload - Données à encoder (sans le champ `type`, ajouté automatiquement)
 * @returns Token JWT signé, valide pour la durée définie par `JWT_ACCESS_EXPIRES_IN`
 */
export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions,
  );
}

/**
 * Génère un refresh token signé avec sa propre clé secrète.
 * Le token brut doit ensuite être hashé (SHA-256) avant stockage en base.
 *
 * @param userId - UUID de l'utilisateur propriétaire du token
 * @returns Token JWT signé, valide pour la durée définie par `JWT_REFRESH_EXPIRES_IN`
 */
export function signRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions,
  );
}

// ---------------------------------------------------------------------------
// Fonctions de vérification
// ---------------------------------------------------------------------------

/**
 * Vérifie la signature et l'expiration d'un access token.
 *
 * @param token - Token brut extrait de l'en-tête Authorization
 * @returns Payload décodé et typé
 * @throws `JsonWebTokenError` si la signature est invalide
 * @throws `TokenExpiredError` si le token est expiré
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/**
 * Vérifie la signature et l'expiration d'un refresh token.
 *
 * @param token - Token brut reçu du client
 * @returns Payload décodé et typé
 * @throws `JsonWebTokenError` si la signature est invalide
 * @throws `TokenExpiredError` si le token est expiré
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/**
 * Calcule la date d'expiration absolue du refresh token à partir de la
 * configuration `JWT_REFRESH_EXPIRES_IN`. Utilisé pour renseigner le champ
 * `expires_at` en base de données lors de la création du token.
 *
 * @returns `Date` représentant le moment d'expiration
 * @throws `Error` si le format de `JWT_REFRESH_EXPIRES_IN` est invalide (doit être `Nd`, `Nh`, `Nm`, `Ns`)
 */
export function getRefreshTokenExpiry(): Date {
  const expiresIn = env.JWT_REFRESH_EXPIRES_IN;
  const match = expiresIn.match(/^(\d+)([dhms])$/);
  if (!match) throw new Error('Invalid JWT_REFRESH_EXPIRES_IN format (expected: 7d, 24h, 30m, …)');

  const value = parseInt(match[1], 10);
  const unit = match[2] as 'd' | 'h' | 'm' | 's';
  const multipliers: Record<typeof unit, number> = { d: 86400, h: 3600, m: 60, s: 1 };
  const seconds = value * multipliers[unit];

  return new Date(Date.now() + seconds * 1000);
}

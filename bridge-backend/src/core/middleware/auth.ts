/**
 * @module core/middleware/auth
 * Middleware d'authentification JWT.
 *
 * Vérifie la présence et la validité de l'access token dans l'en-tête
 * `Authorization: Bearer <token>`, puis injecte les informations de
 * l'utilisateur dans `req.user` pour les middlewares et contrôleurs suivants.
 *
 * Utilisation : appliquer **avant** tout middleware RBAC ou logique métier.
 * ```ts
 * router.get('/protected', authenticate, authorize('admin'), handler)
 * ```
 */
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../lib/jwt';
import { prisma } from '../../config/database';
import { AppError } from '../errors/AppError';

/**
 * Middleware Express d'authentification par Bearer token.
 *
 * Flux d'exécution :
 * 1. Extrait le token de l'en-tête `Authorization`
 * 2. Vérifie la signature et l'expiration via `verifyAccessToken()`
 * 3. Confirme que le compte existe en base et est actif (statut `active`, non supprimé)
 * 4. Attache `req.user` avec les champs nécessaires au RBAC
 *
 * @throws `401 UNAUTHORIZED` - Token absent, invalide, expiré ou compte inactif
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Token d\'authentification manquant'));
  }

  const token = authHeader.slice(7); // Retire le préfixe "Bearer "

  try {
    const payload = verifyAccessToken(token);

    // Double vérification en base : le token peut être valide cryptographiquement
    // mais le compte peut avoir été suspendu ou supprimé entre-temps.
    const user = await prisma.user.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null,
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      return next(AppError.unauthorized('Compte introuvable ou suspendu'));
    }

    req.user = user;
    next();
  } catch {
    // Couvre : JsonWebTokenError (signature invalide) et TokenExpiredError
    next(AppError.unauthorized('Token invalide ou expiré'));
  }
}

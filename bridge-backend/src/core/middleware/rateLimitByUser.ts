/**
 * @module core/middleware/rateLimitByUser
 * Rate limiting par utilisateur JWT (stocké dans Redis).
 *
 * Contrairement au rate limit global par IP, ce middleware limite les requêtes
 * par userId — utile pour les routes coûteuses (PDF, export) afin qu'un seul
 * utilisateur ne puisse pas saturer le serveur.
 *
 * Usage :
 * ```ts
 * router.get('/:id/pdf', rateLimitByUser({ max: 10, windowMs: 60_000 }), handler)
 * ```
 */
import { Request, Response, NextFunction } from 'express';
import { redisConnection } from '../../config/redis';

interface Options {
  /** Nombre max de requêtes dans la fenêtre */
  max: number;
  /** Durée de la fenêtre en millisecondes */
  windowMs: number;
  /** Message d'erreur retourné (optionnel) */
  message?: string;
}

export function rateLimitByUser(options: Options) {
  const { max, windowMs, message = 'Trop de requêtes. Réessayez plus tard.' } = options;
  const windowSec = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Si pas d'utilisateur connecté, pas de limitation par user (le global prend le relais)
    if (!req.user?.id) return next();

    const key = `ratelimit:${req.user.id}:${req.path}`;
    const count = await redisConnection.incr(key);

    if (count === 1) {
      await redisConnection.expire(key, windowSec);
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));

    if (count > max) {
      res.status(429).json({ success: false, code: 'RATE_LIMIT', message });
      return;
    }

    next();
  };
}

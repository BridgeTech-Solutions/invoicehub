/**
 * @module core/middleware/rbac
 * Contrôle d'accès basé sur les rôles (Role-Based Access Control).
 *
 * Doit être utilisé **après** le middleware `authenticate` qui injecte `req.user`.
 *
 * Rôles disponibles (du plus au moins privilégié) :
 *  - `admin`      : accès complet à toutes les ressources
 *  - `commercial` : gestion des clients, devis et factures
 *  - `employee`   : lecture seule + saisie des paiements
 */
import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../errors/AppError';

/**
 * Fabrique de middleware RBAC : vérifie que l'utilisateur authentifié
 * possède l'un des rôles autorisés.
 *
 * Appelé sans argument (`authorize()`), il vérifie uniquement que l'utilisateur
 * est authentifié (utile si `authenticate` est séparé).
 *
 * @param roles - Liste des rôles autorisés (au moins l'un doit correspondre)
 * @returns Middleware Express
 *
 * @example
 * // Accès réservé aux admins et commerciaux
 * router.post('/invoices', authenticate, authorize('admin', 'commercial'), handler)
 *
 * @throws `401 UNAUTHORIZED` - Utilisateur non authentifié (`req.user` absent)
 * @throws `403 FORBIDDEN`    - Rôle insuffisant
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Rôle requis : ${roles.join(' ou ')}. Votre rôle : ${req.user.role}`,
        ),
      );
    }

    next();
  };
}

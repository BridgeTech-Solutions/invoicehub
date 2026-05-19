import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';

function hasPermission(userPerms: string[], required: string[]): boolean {
  if (userPerms.includes('*')) return true;
  return required.some((perm) => {
    if (userPerms.includes(perm)) return true;
    const [module] = perm.split(':');
    return userPerms.includes(`${module}:*`);
  });
}

/**
 * Vérifie que l'utilisateur possède au moins une des permissions granulaires requises.
 * Format: 'module:action' — ex: 'invoices:create', 'suppliers:read'
 * '*' dans les permissions de l'utilisateur = accès total (admin).
 */
export function authorizePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    if (permissions.length === 0 || hasPermission(req.user.permissions, permissions)) {
      return next();
    }

    return next(
      AppError.forbidden(
        `Permission requise : ${permissions.join(' ou ')}. Votre rôle (${req.user.roleName}) ne l'inclut pas.`,
      ),
    );
  };
}

/**
 * Compatibilité ascendante — vérifie par nom de rôle.
 * Préférer authorizePermission() pour les nouveaux modules.
 */
export function authorize(...roleNames: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    if (roleNames.length === 0) return next();

    if (!roleNames.includes(req.user.roleName)) {
      return next(
        AppError.forbidden(
          `Rôle requis : ${roleNames.join(' ou ')}. Votre rôle : ${req.user.roleName}`,
        ),
      );
    }

    next();
  };
}

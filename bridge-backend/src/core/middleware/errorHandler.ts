/**
 * @module core/middleware/errorHandler
 * Gestionnaire d'erreurs global Express (« error-handling middleware »).
 *
 * Doit être déclaré **en dernier** dans la chaîne de middlewares (`app.use(errorHandler)`).
 * Il centralise la transformation de toutes les erreurs en réponses JSON cohérentes,
 * et masque les détails techniques en production pour éviter les fuites d'information.
 *
 * Hiérarchie de traitement :
 *  1. Erreurs de validation Zod     → 400 VALIDATION_ERROR
 *  2. Erreurs métier AppError       → code HTTP défini à la création
 *  3. Erreurs Prisma connues        → 409 (doublons), 404 (not found), 409 (FK)
 *  4. Erreurs inconnues             → 500 INTERNAL_ERROR (détails cachés en prod)
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { logger } from './requestLogger';

/**
 * Middleware de gestion d'erreurs Express (signature à 4 paramètres obligatoire).
 *
 * Chaque branche produit une réponse JSON au format uniforme :
 * ```json
 * { "success": false, "code": "ERROR_CODE", "message": "..." }
 * ```
 * Les erreurs Zod incluent en plus un champ `errors` avec le détail par champ.
 *
 * @param err  - L'erreur propagée via `next(err)`
 * @param req  - Requête Express (utilisée pour les logs)
 * @param res  - Réponse Express
 * @param _next - Paramètre requis par Express pour reconnaître le middleware d'erreur
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // ------------------------------------------------------------------
  // 1. Erreurs de validation Zod (body, query, params invalides)
  // ------------------------------------------------------------------
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Données invalides',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  // ------------------------------------------------------------------
  // 2. Erreurs métier intentionnelles (AppError)
  //    Levées explicitement dans les services avec un code HTTP précis.
  // ------------------------------------------------------------------
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
    });
    return;
  }

  // ------------------------------------------------------------------
  // 3. Erreurs Prisma / PostgreSQL interprétables
  // ------------------------------------------------------------------
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 : violation de contrainte UNIQUE
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        code: 'DUPLICATE_KEY',
        message: 'Cette ressource existe déjà',
      });
      return;
    }
    // P2025 : enregistrement introuvable (findUniqueOrThrow, updateOrThrow…)
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Ressource introuvable',
      });
      return;
    }
    // P2003 : violation de clé étrangère (référence vers un enregistrement absent)
    if (err.code === 'P2003') {
      res.status(409).json({
        success: false,
        code: 'FOREIGN_KEY_VIOLATION',
        message: 'Référence vers une ressource inexistante',
      });
      return;
    }
  }

  // ------------------------------------------------------------------
  // 4. Erreur inconnue — ne jamais exposer la stack en production
  // ------------------------------------------------------------------
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Erreur interne du serveur',
  });
}

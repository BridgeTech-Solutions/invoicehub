/**
 * @module core/middleware/audit
 * Journalisation automatique des mutations pour la conformité SYSCOHADA.
 *
 * Ce middleware intercepte les requêtes mutantes (POST, PUT, PATCH, DELETE)
 * et crée une entrée dans la table `audit_logs` **après** l'envoi de la réponse,
 * ce qui garantit que seules les opérations abouties sont loggées.
 *
 * La table `audit_logs` est protégée au niveau base de données (règles PG
 * empêchant UPDATE/DELETE) — l'audit est donc immuable.
 *
 * Utilisation :
 * ```ts
 * router.post('/invoices', authenticate, auditMiddleware('invoices'), handler)
 * ```
 */
import { Request, Response, NextFunction } from 'express';
import { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from './requestLogger';

/** Correspondance méthode HTTP → action d'audit par défaut */
const METHOD_TO_ACTION: Record<string, AuditAction> = {
  POST:   'CREATE',
  PUT:    'UPDATE',
  PATCH:  'UPDATE',
  DELETE: 'SOFT_DELETE',
};

/**
 * Fabrique de middleware d'audit automatique.
 *
 * Le log est créé de façon asynchrone via l'événement `finish` de la réponse,
 * donc il n'impacte pas la latence perçue par le client. Les échecs de log
 * sont absorbés silencieusement (avec warning) pour ne pas bloquer l'API.
 *
 * @param tableName - Nom de la table concernée (ex: `'invoices'`, `'clients'`)
 * @param action    - Action d'audit explicite ; si omis, déduit de la méthode HTTP
 * @returns Middleware Express
 */
export function auditMiddleware(tableName: string, action?: AuditAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const resolvedAction = action ?? METHOD_TO_ACTION[req.method];

    if (!resolvedAction) {
      return next();
    }

    // Capturer l'état avant modification (pour PUT/PATCH/DELETE)
    let oldData: Record<string, unknown> | null = null;
    const recordId = (req.params['id'] as string | undefined) ?? null;

    if (recordId && ['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      try {
        // Lecture générique via Prisma — le tableName est le nom du modèle Prisma en camelCase
        const model = (prisma as unknown as Record<string, { findUnique?: (args: unknown) => Promise<unknown> }>)[tableName];
        if (model?.findUnique) {
          oldData = await model.findUnique({ where: { id: recordId } }) as Record<string, unknown> | null;
        }
      } catch {
        // Non critique
      }
    }

    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      const userId = req.user?.id ?? null;

      prisma.auditLog
        .create({
          data: {
            userId,
            userEmail:     req.user?.email ?? null,
            userRole:      req.user?.role ?? null,
            action:        resolvedAction,
            entityType:    tableName,
            entityId:      recordId,
            previousState: (oldData ?? undefined) as Prisma.InputJsonValue | undefined,
            newState:      (req.body && Object.keys(req.body).length > 0 ? req.body : undefined) as Prisma.InputJsonValue | undefined,
            ipAddress:     (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? req.socket.remoteAddress ?? null,
            userAgent:     req.get('user-agent') ?? null,
          },
        })
        .catch((err: Error) => {
          logger.warn('Audit log failed', { error: err.message, table: tableName });
        });
    });

    next();
  };
}

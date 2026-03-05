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
import { AuditAction } from '@prisma/client';
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
  return (req: Request, res: Response, next: NextFunction): void => {
    const resolvedAction = action ?? METHOD_TO_ACTION[req.method];

    // Ne rien faire pour les requêtes GET ou OPTIONS
    if (!resolvedAction) {
      return next();
    }

    res.on('finish', () => {
      // Ne log que les requêtes ayant abouti (codes 2xx)
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      const userId  = req.user?.id ?? null;
      const recordId = req.params['id'] ?? null;

      prisma.auditLog
        .create({
          data: {
            userId,
            action: resolvedAction,
            tableName,
            recordId,
            // Le corps de la requête est loggé comme `newData` (peut contenir des mises à jour)
            newData: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
            ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
            userAgent: req.get('user-agent') ?? null,
          },
        })
        .catch((err: Error) => {
          // Dégradation silencieuse : l'audit ne doit jamais faire planter l'API
          logger.warn('Audit log failed', { error: err.message, table: tableName });
        });
    });

    next();
  };
}

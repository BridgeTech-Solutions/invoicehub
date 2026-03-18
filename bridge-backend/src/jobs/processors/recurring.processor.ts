/**
 * @module jobs/processors/recurring
 * Cron quotidien : génération automatique des factures récurrentes.
 *
 * Logique :
 *  - Récupère tous les gabarits actifs dont `nextInvoiceDate <= aujourd'hui`
 *    et dont la date de fin n'est pas dépassée
 *  - Génère une facture pour chaque gabarit via `recurringService.generate()`
 *  - La prochaine date est automatiquement calculée et mise à jour dans le service
 */
import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { recurringService } from '../../modules/recurring/recurring.service';
import { notificationQueue } from '../queues';
import { logger } from '../../core/middleware/requestLogger';
import type { RecurringJobData } from '../queues';

export async function processRecurringJob(_job: Job<RecurringJobData>): Promise<void> {
  const now = new Date();

  const dueTemplates = await prisma.recurringInvoiceTemplate.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      nextInvoiceDate: { lte: now },
      OR: [
        { endDate: null },
        { endDate: { gte: now } },
      ],
    },
    select: { id: true, createdById: true, client: { select: { name: true } } },
  });

  for (const template of dueTemplates) {
    try {
      const invoice = await recurringService.generate(template.id, template.createdById);

      await notificationQueue.add('notification', {
        userId: template.createdById,
        type: 'invoice_issued',
        title: `Facture récurrente générée : ${invoice.number}`,
        message: `Une facture récurrente a été générée automatiquement pour ${template.client.name}.`,
        data: { invoiceId: invoice.id, invoiceNumber: invoice.number },
      });

      logger.info(`[Recurring] Facture générée : ${invoice.number}`, { templateId: template.id });
    } catch (err) {
      // Ne pas interrompre les autres gabarits si l'un échoue
      logger.error(`[Recurring] Echec génération gabarit ${template.id}`, {
        error: (err as Error).message,
      });
    }
  }
}

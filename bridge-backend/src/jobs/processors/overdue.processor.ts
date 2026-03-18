/**
 * @module jobs/processors/overdue
 * Cron quotidien : détection des documents en retard ou expirés.
 *
 * Traitements :
 *  1. Factures `issued` / `partially_paid` dont la date d'échéance est passée
 *     → statut `overdue` + entrée dans invoice_status_history
 *  2. Proformas `sent` dont la date de validité est passée
 *     → statut `expired` + entrée dans proforma_status_history
 */
import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { notificationQueue } from '../queues';
import type { OverdueJobData } from '../queues';

export async function processOverdueJob(_job: Job<OverdueJobData>): Promise<void> {
  const now = new Date();

  // ── 1. Factures en retard ──────────────────────────────────────────────────
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ['issued', 'partially_paid'] },
      dueDate: { lt: now },
    },
    select: { id: true, number: true, status: true, createdById: true, client: { select: { name: true } } },
  });

  for (const inv of overdueInvoices) {
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: inv.id },
        data: { status: 'overdue' },
      }),
      prisma.invoiceStatusHistory.create({
        data: {
          invoiceId: inv.id,
          previousStatus: inv.status,
          newStatus: 'overdue',
          // Pas de changedById — action système automatique
        },
      }),
    ]);

    // Notification au créateur de la facture
    await notificationQueue.add('notification', {
      userId: inv.createdById,
      type: 'invoice_overdue',
      title: `Facture en retard : ${inv.number}`,
      message: `La facture ${inv.number} pour ${inv.client.name} est en retard de paiement.`,
      data: { invoiceId: inv.id, invoiceNumber: inv.number },
    });
  }

  // ── 2. Proformas expirées ──────────────────────────────────────────────────
  const expiredProformas = await prisma.proforma.findMany({
    where: {
      deletedAt: null,
      status: 'sent',
      validUntil: { lt: now },
    },
    select: { id: true, number: true, status: true, createdById: true, client: { select: { name: true } } },
  });

  for (const pf of expiredProformas) {
    await prisma.$transaction([
      prisma.proforma.update({
        where: { id: pf.id },
        data: { status: 'expired' },
      }),
      prisma.proformaStatusHistory.create({
        data: {
          proformaId: pf.id,
          previousStatus: pf.status,
          newStatus: 'expired',
        },
      }),
    ]);

    await notificationQueue.add('notification', {
      userId: pf.createdById,
      type: 'proforma_expired',
      title: `Proforma expirée : ${pf.number}`,
      message: `La proforma ${pf.number} pour ${pf.client.name} a expiré.`,
      data: { proformaId: pf.id, proformaNumber: pf.number },
    });
  }
}

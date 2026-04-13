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
          changedById: inv.createdById, // action système — attribué au créateur
        },
      }),
    ]);

    // Notification au créateur de la facture
    await notificationQueue.add('notification' as string, {
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
          changedById: pf.createdById, // action système — attribué au créateur
        },
      }),
    ]);

    await notificationQueue.add('notification' as string, {
      userId: pf.createdById,
      type: 'proforma_expired',
      title: `Proforma expirée : ${pf.number}`,
      message: `La proforma ${pf.number} pour ${pf.client.name} a expiré.`,
      data: { proformaId: pf.id, proformaNumber: pf.number },
    });
  }

  // ── 3. Alerte J-3 avant expiration des proformas ──────────────────────────
  // Proformas `sent` dont la validité expire dans les 3 prochains jours
  const in3Days = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);
  in3Days.setHours(23, 59, 59, 999);

  const expiringProformas = await prisma.proforma.findMany({
    where: {
      deletedAt: null,
      status: 'sent',
      validUntil: { gte: now, lte: in3Days },
    },
    select: {
      id: true, number: true, validUntil: true, createdById: true,
      client: { select: { name: true } },
    },
  });

  // Déduplication : récupère les proformas déjà alertées dans les 4 derniers jours
  const alreadyAlerted = expiringProformas.length > 0
    ? await prisma.notification.findMany({
        where: {
          type: 'proforma_expired',
          createdAt: { gte: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000) },
        },
        select: { data: true },
      })
    : [];

  const alreadyAlertedIds = new Set(
    alreadyAlerted
      .map(n => (n.data as Record<string, unknown> | null)?.['proformaId'])
      .filter(Boolean),
  );

  for (const pf of expiringProformas) {
    if (alreadyAlertedIds.has(pf.id)) continue; // alerte déjà envoyée

    const daysLeft = Math.ceil((new Date(pf.validUntil).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const expiryLabel = daysLeft <= 1 ? 'demain' : `dans ${daysLeft} jours`;

    await notificationQueue.add('notification' as string, {
      userId: pf.createdById,
      type: 'proforma_expired',
      title: `Proforma expire ${expiryLabel} : ${pf.number}`,
      message: `La proforma ${pf.number} pour ${pf.client.name} expire ${expiryLabel} (${new Date(pf.validUntil).toLocaleDateString('fr-FR')}). Relancez le client si nécessaire.`,
      data: {
        proformaId:     pf.id,
        proformaNumber: pf.number,
        clientName:     pf.client.name,
        validUntil:     pf.validUntil,
        daysLeft,
      },
    });
  }
}

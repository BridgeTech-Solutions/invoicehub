import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import type { OverdueJobData, NotificationJobData } from '../job-types';

@Processor('overdue')
export class OverdueProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notification') private readonly notificationQueue: Queue<NotificationJobData>,
  ) {
    super();
  }

  async process(_job: Job<OverdueJobData>): Promise<void> {
    const now = new Date();

    // 1. Factures en retard
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ['issued', 'partially_paid'] },
        dueDate: { lt: now },
      },
      select: { id: true, number: true, status: true, createdById: true, totalTtc: true, dueDate: true, client: { select: { name: true } } },
    });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3001';

    for (const inv of overdueInvoices) {
      const daysOverdue = Math.max(1, Math.ceil((now.getTime() - new Date(inv.dueDate).getTime()) / (24 * 60 * 60 * 1000)));
      await this.prisma.$transaction([
        this.prisma.invoice.update({ where: { id: inv.id }, data: { status: 'overdue' } }),
        this.prisma.invoiceStatusHistory.create({
          data: { invoiceId: inv.id, previousStatus: inv.status, newStatus: 'overdue', changedById: inv.createdById },
        }),
      ]);

      await this.notificationQueue.add('notification', {
        userId:  inv.createdById,
        type:    'invoice_overdue',
        title:   `Facture en retard : ${inv.number}`,
        message: `La facture ${inv.number} pour ${inv.client.name} est en retard de paiement.`,
        data:    {
          invoiceId:     inv.id,
          invoiceNumber: inv.number,
          clientName:    inv.client.name,
          totalTtc:      Number(inv.totalTtc).toLocaleString('fr-FR'),
          daysOverdue:   String(daysOverdue),
          invoiceLink:   `${appUrl}/invoices/${inv.id}`,
        },
      });
    }

    // 2. Proformas expirées
    const expiredProformas = await this.prisma.proforma.findMany({
      where: { deletedAt: null, status: 'sent', validUntil: { lt: now } },
      select: { id: true, number: true, status: true, createdById: true, totalTtc: true, validUntil: true, client: { select: { name: true } } },
    });

    for (const pf of expiredProformas) {
      await this.prisma.$transaction([
        this.prisma.proforma.update({ where: { id: pf.id }, data: { status: 'expired' } }),
        this.prisma.proformaStatusHistory.create({
          data: { proformaId: pf.id, previousStatus: pf.status, newStatus: 'expired', changedById: pf.createdById },
        }),
      ]);

      await this.notificationQueue.add('notification', {
        userId:  pf.createdById,
        type:    'proforma_expired',
        title:   `Proforma expirée : ${pf.number}`,
        message: `La proforma ${pf.number} pour ${pf.client.name} a expiré.`,
        data:    {
          proformaId:     pf.id,
          proformaNumber: pf.number,
          clientName:     pf.client.name,
          totalTtc:       Number(pf.totalTtc).toLocaleString('fr-FR'),
          validUntil:     new Date(pf.validUntil).toLocaleDateString('fr-FR'),
          proformaLink:   `${appUrl}/proformas/${pf.id}`,
        },
      });
    }

    // 3. Alerte J-3 avant expiration des proformas
    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);
    in3Days.setHours(23, 59, 59, 999);

    const expiringProformas = await this.prisma.proforma.findMany({
      where: { deletedAt: null, status: 'sent', validUntil: { gte: now, lte: in3Days } },
      select: { id: true, number: true, validUntil: true, totalTtc: true, createdById: true, client: { select: { name: true } } },
    });

    const alreadyAlerted = expiringProformas.length > 0
      ? await this.prisma.notification.findMany({
          where: { type: 'proforma_expired', createdAt: { gte: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000) } },
          select: { data: true },
        })
      : [];

    const alreadyAlertedIds = new Set(
      alreadyAlerted.map(n => (n.data as Record<string, unknown> | null)?.['proformaId']).filter(Boolean),
    );

    for (const pf of expiringProformas) {
      if (alreadyAlertedIds.has(pf.id)) continue;
      const daysLeft  = Math.ceil((new Date(pf.validUntil).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const expiryLabel = daysLeft <= 1 ? 'demain' : `dans ${daysLeft} jours`;

      await this.notificationQueue.add('notification', {
        userId:  pf.createdById,
        type:    'proforma_expired',
        title:   `Proforma expire ${expiryLabel} : ${pf.number}`,
        message: `La proforma ${pf.number} pour ${pf.client.name} expire ${expiryLabel}. Relancez le client si nécessaire.`,
        data:    {
          proformaId:     pf.id,
          proformaNumber: pf.number,
          clientName:     pf.client.name,
          totalTtc:       Number(pf.totalTtc).toLocaleString('fr-FR'),
          validUntil:     new Date(pf.validUntil).toLocaleDateString('fr-FR'),
          proformaLink:   `${appUrl}/proformas/${pf.id}`,
          daysLeft:       String(daysLeft),
        },
      });
    }
  }
}

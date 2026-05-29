import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import type { ReminderJobData, NotificationJobData, EmailJobData } from '../job-types';

interface EscalationLevel {
  daysOverdue: number;
  label: string;
  notifyCreator: boolean;
  notifyManagers: boolean;
  sendEmail: boolean;
}

interface CheckLevel {
  daysSince: number;
  level: number;
  notifyManagers: boolean;
  sendEmail: boolean;
}

const DEFAULT_ESCALATION = {
  levels: [
    { daysOverdue: 0,  label: 'Douce',    notifyCreator: true, notifyManagers: false, sendEmail: false },
    { daysOverdue: 7,  label: 'Ferme',    notifyCreator: true, notifyManagers: false, sendEmail: true  },
    { daysOverdue: 15, label: 'Urgente',  notifyCreator: true, notifyManagers: true,  sendEmail: true  },
    { daysOverdue: 30, label: 'Critique', notifyCreator: true, notifyManagers: true,  sendEmail: true  },
  ] as EscalationLevel[],
};

const DEFAULT_CHECK_LEVELS: CheckLevel[] = [
  { daysSince: 3,  level: 1, notifyManagers: false, sendEmail: false },
  { daysSince: 7,  level: 2, notifyManagers: false, sendEmail: true  },
  { daysSince: 15, level: 3, notifyManagers: true,  sendEmail: true  },
];

const DEFAULT_DRAFT_CHECK_LEVELS: CheckLevel[] = [
  { daysSince: 1, level: 1, notifyManagers: false, sendEmail: false },
  { daysSince: 3, level: 2, notifyManagers: false, sendEmail: false },
  { daysSince: 7, level: 3, notifyManagers: true,  sendEmail: true  },
];

@Processor('reminder')
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notification') private readonly notificationQueue: Queue<NotificationJobData>,
    @InjectQueue('email') private readonly emailQueue: Queue<EmailJobData>,
  ) {
    super();
  }

  async process(_job: Job<ReminderJobData>): Promise<void> {
    const now = new Date();

    // Récupérer la config escalade depuis company_settings
    const settings = await this.prisma.companySettings.findFirst();
    const reminderEscalation = (settings as any)?.reminderEscalation ?? {};
    const escalationConfig = reminderEscalation.levels?.length ? reminderEscalation : DEFAULT_ESCALATION;
    const checkLevels: CheckLevel[]      = reminderEscalation.checkLevels      ?? DEFAULT_CHECK_LEVELS;
    const draftCheckLevels: CheckLevel[] = reminderEscalation.draftCheckLevels ?? DEFAULT_DRAFT_CHECK_LEVELS;

    // Managers pour notifications urgentes
    const managers = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'active', role: { name: { in: ['admin', 'manager'] } } },
      select: { id: true, email: true, firstName: true },
    });

    await Promise.all([
      this._processOverdueEscalation(now, escalationConfig.levels, managers),
      this._processIssuedChecks(now, checkLevels, managers),
      this._processProformaChecks(now, checkLevels),
      this._processDraftChecks(now, draftCheckLevels, managers),
    ]);
  }

  private async _processOverdueEscalation(
    now: Date,
    levels: EscalationLevel[],
    managers: { id: string; email: string; firstName: string }[],
  ) {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: { deletedAt: null, status: 'overdue' },
      select: {
        id: true, number: true, dueDate: true, totalTtc: true,
        reminderEscalationLevel: true, createdById: true,
        client: { select: { name: true } },
        createdBy: { select: { id: true, email: true, firstName: true } },
      },
    });

    for (const inv of overdueInvoices) {
      const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
      const nextLevel = levels.find(l =>
        l.daysOverdue <= daysOverdue && l.daysOverdue > (levels[inv.reminderEscalationLevel - 1]?.daysOverdue ?? -1),
      );
      if (!nextLevel || inv.reminderEscalationLevel >= levels.indexOf(nextLevel) + 1) continue;

      const newLevel = levels.indexOf(nextLevel) + 1;
      await this.prisma.invoice.update({ where: { id: inv.id }, data: { reminderEscalationLevel: newLevel } });

      if (nextLevel.notifyCreator) {
        await this.notificationQueue.add('notification', {
          userId:  inv.createdById,
          type:    'invoice_overdue',
          title:   `[${nextLevel.label}] Facture en retard J+${daysOverdue} : ${inv.number}`,
          message: `La facture ${inv.number} (${inv.client.name}) est en retard de ${daysOverdue} jour(s).`,
          data:    { invoiceId: inv.id, invoiceNumber: inv.number, level: nextLevel.label },
        });
      }

      if (nextLevel.notifyManagers) {
        for (const mgr of managers) {
          if (mgr.id === inv.createdById) continue;
          await this.notificationQueue.add('notification', {
            userId:  mgr.id,
            type:    'invoice_overdue',
            title:   `[${nextLevel.label}] Facture en retard J+${daysOverdue} : ${inv.number}`,
            message: `La facture ${inv.number} (${inv.client.name}) est en retard de ${daysOverdue} jour(s).`,
            data:    { invoiceId: inv.id, invoiceNumber: inv.number, level: nextLevel.label },
          });
        }
      }
    }
  }

  private async _processIssuedChecks(now: Date, levels: CheckLevel[], managers: { id: string }[]) {
    const issuedInvoices = await this.prisma.invoice.findMany({
      where: { deletedAt: null, status: 'issued' },
      select: { id: true, number: true, issueDate: true, reminderEscalationLevel: true, createdById: true, clientId: true },
    });

    for (const inv of issuedInvoices) {
      if (!inv.issueDate) continue;
      const daysSince = Math.floor((now.getTime() - new Date(inv.issueDate).getTime()) / 86_400_000);
      const level = levels.find(l => l.daysSince <= daysSince && l.level > inv.reminderEscalationLevel);
      if (!level) continue;

      await this.prisma.invoice.update({ where: { id: inv.id }, data: { reminderEscalationLevel: level.level } });
      await this.notificationQueue.add('notification', {
        userId:  inv.createdById,
        type:    'invoice_overdue',
        title:   `Vérification paiement J+${daysSince} : ${inv.number}`,
        message: `La facture ${inv.number} est émise depuis ${daysSince} jours. Avez-vous confirmé le paiement ?`,
        data:    { invoiceId: inv.id, invoiceNumber: inv.number, action: 'confirm_payment' },
      });
    }
  }

  private async _processProformaChecks(now: Date, levels: CheckLevel[]) {
    const sentProformas = await this.prisma.proforma.findMany({
      where: { deletedAt: null, status: 'sent' },
      select: { id: true, number: true, lastSentAt: true, reminderCount: true, createdById: true, clientId: true },
    });

    for (const pf of sentProformas) {
      if (!pf.lastSentAt) continue;
      const daysSince = Math.floor((now.getTime() - new Date(pf.lastSentAt).getTime()) / 86_400_000);
      const level = levels.find(l => l.daysSince <= daysSince && l.level > pf.reminderCount);
      if (!level) continue;

      await this.prisma.proforma.update({ where: { id: pf.id }, data: { reminderCount: level.level } });
      await this.notificationQueue.add('notification', {
        userId:  pf.createdById,
        type:    'proforma_expired',
        title:   `Vérification statut J+${daysSince} : ${pf.number}`,
        message: `La proforma ${pf.number} est envoyée depuis ${daysSince} jours. Avez-vous eu une réponse ?`,
        data:    { proformaId: pf.id, proformaNumber: pf.number, action: 'confirm_proforma_status' },
      });
    }
  }

  private async _processDraftChecks(now: Date, levels: CheckLevel[], managers: { id: string }[]) {
    const draftDocs = await this.prisma.invoice.findMany({
      where: { deletedAt: null, status: 'draft' },
      select: { id: true, number: true, createdAt: true, draftReminderLevel: true, createdById: true, client: { select: { name: true } } },
    });

    for (const doc of draftDocs) {
      const daysSince = Math.floor((now.getTime() - new Date(doc.createdAt).getTime()) / 86_400_000);
      const level = levels.find(l => l.daysSince <= daysSince && l.level > doc.draftReminderLevel);
      if (!level) continue;

      await this.prisma.invoice.update({ where: { id: doc.id }, data: { draftReminderLevel: level.level } });
      await this.notificationQueue.add('notification', {
        userId:  doc.createdById,
        type:    'system',
        title:   `Brouillon en attente J+${daysSince} : ${doc.number}`,
        message: `La facture ${doc.number} (${doc.client.name}) est en brouillon depuis ${daysSince} jours.`,
        data:    { invoiceId: doc.id, invoiceNumber: doc.number, action: 'confirm_invoice_draft_sent' },
      });
    }
  }
}

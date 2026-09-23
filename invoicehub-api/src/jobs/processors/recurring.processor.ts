import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpensesService } from '../../modules/expenses/expenses.service';
import type { RecurringJobData, NotificationJobData } from '../job-types';

@Processor('recurring')
export class RecurringProcessor extends WorkerHost {
  private readonly logger = new Logger(RecurringProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
    @InjectQueue('notification') private readonly notificationQueue: Queue<NotificationJobData>,
  ) {
    super();
  }

  async process(_job: Job<RecurringJobData>): Promise<void> {
    const now = new Date();

    // 1. Dépenses récurrentes : génère les occurrences dues (brouillons à relire).
    try {
      const { generated } = await this.expensesService.generateDueRecurringExpenses();
      if (generated > 0) this.logger.log(`[Recurring] ${generated} dépense(s) récurrente(s) générée(s).`);
    } catch (err) {
      this.logger.error(`[Recurring] Echec génération dépenses récurrentes : ${(err as Error).message}`);
    }

    // 2. Factures récurrentes : notification (génération auto non encore implémentée).
    const dueTemplates = await this.prisma.recurringInvoiceTemplate.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        nextInvoiceDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      select: { id: true, createdById: true, client: { select: { name: true } } },
    });

    for (const template of dueTemplates) {
      try {
        this.logger.log(`[Recurring] Template facture à traiter : ${template.id}`);
        await this.notificationQueue.add('notification', {
          userId:  template.createdById,
          type:    'system',
          title:   'Facture récurrente à générer',
          message: `Un gabarit récurrent est dû pour ${template.client.name}.`,
          data:    { templateId: template.id },
        });
      } catch (err) {
        this.logger.error(`[Recurring] Echec gabarit ${template.id}: ${(err as Error).message}`);
      }
    }
  }
}

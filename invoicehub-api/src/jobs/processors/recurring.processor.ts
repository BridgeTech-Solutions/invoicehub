import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpensesService } from '../../modules/expenses/expenses.service';
import { RecurringService } from '../../modules/recurring/recurring.service';
import { broadcastNotification } from '../../lib/broadcast';
import type { RecurringJobData, NotificationJobData } from '../job-types';

@Processor('recurring')
export class RecurringProcessor extends WorkerHost {
  private readonly logger = new Logger(RecurringProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
    private readonly recurringService: RecurringService,
    @InjectQueue('notification') private readonly notificationQueue: Queue<NotificationJobData>,
  ) {
    super();
  }

  async process(_job: Job<RecurringJobData>): Promise<void> {
    // 1. Dépenses récurrentes : génère les occurrences dues (brouillons à relire).
    try {
      const { generated } = await this.expensesService.generateDueRecurringExpenses();
      if (generated > 0) this.logger.log(`[Recurring] ${generated} dépense(s) récurrente(s) générée(s).`);
    } catch (err) {
      this.logger.error(`[Recurring] Echec génération dépenses récurrentes : ${(err as Error).message}`);
    }

    // 2. Factures récurrentes : génère les brouillons dus (auto-génération réelle,
    //    plus une simple notification), puis prévient les gestionnaires de factures.
    try {
      const { generated, templates } = await this.recurringService.generateDueTemplates();
      if (generated > 0) {
        this.logger.log(`[Recurring] ${generated}/${templates} facture(s) récurrente(s) générée(s) en brouillon.`);
        await broadcastNotification(this.prisma as any, this.notificationQueue, {
          type:    'system',
          title:   'Factures récurrentes générées',
          message: `${generated} facture(s) récurrente(s) créée(s) en brouillon — à relire et émettre.`,
          data:    { generated },
        }, { permission: 'invoices:read' });
      }
    } catch (err) {
      this.logger.error(`[Recurring] Echec génération factures récurrentes : ${(err as Error).message}`);
    }
  }
}

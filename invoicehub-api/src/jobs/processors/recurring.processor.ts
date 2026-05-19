import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import type { RecurringJobData, NotificationJobData } from '../job-types';

@Processor('recurring')
export class RecurringProcessor extends WorkerHost {
  private readonly logger = new Logger(RecurringProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notification') private readonly notificationQueue: Queue<NotificationJobData>,
  ) {
    super();
  }

  async process(_job: Job<RecurringJobData>): Promise<void> {
    const now = new Date();

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
        // RecurringService sera injecté en Phase 4 — pour l'instant log uniquement
        this.logger.log(`[Recurring] Template à traiter : ${template.id}`);

        await this.notificationQueue.add('notification', {
          userId:  template.createdById,
          type:    'invoice_issued',
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

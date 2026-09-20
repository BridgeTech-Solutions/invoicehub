import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { sweepAccountingOutbox } from '../../lib/accounting-outbox';
import { ACCOUNTING_OUTBOX_QUEUE } from '../constants';

/**
 * Rejoue les événements comptables en attente (outbox) jusqu'à ce que l'écriture
 * existe. Déclenché périodiquement par le CronScheduler. Traite par lots pour ne
 * pas monopoliser la base ; le lot suivant sera pris au tick d'après.
 */
@Processor(ACCOUNTING_OUTBOX_QUEUE)
export class AccountingOutboxProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountingOutboxProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const res = await sweepAccountingOutbox(this.prisma, 100);
    if (res.processed > 0) {
      this.logger.log(
        `Outbox comptable : ${res.processed} traité(s) — ${res.done} ok, ${res.retry} à réessayer, ${res.failed} en échec.`,
      );
    }
  }
}

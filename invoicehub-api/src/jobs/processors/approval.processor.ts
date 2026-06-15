import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import type { ApprovalJobData, NotificationJobData } from '../job-types';

@Processor('approval')
export class ApprovalProcessor extends WorkerHost {
  private readonly logger = new Logger(ApprovalProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notification') private readonly notificationQueue: Queue<NotificationJobData>,
  ) {
    super();
  }

  async process(job: Job<ApprovalJobData>): Promise<void> {
    if (job.data.type === 'check-expired') {
      await this._checkExpiredApprovals();
    }
  }

  private async _checkExpiredApprovals() {
    const now = new Date();
    const expired = await this.prisma.approvalRequest.findMany({
      where: { status: 'pending', expiresAt: { lt: now } },
      select: {
        id: true, requestedById: true, documentNumber: true, documentType: true,
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3001';

    for (const req of expired) {
      await this.prisma.approvalRequest.update({
        where: { id: req.id },
        data:  { status: 'expired' },
      });

      await this.notificationQueue.add('notification', {
        userId:  req.requestedById,
        type:    'approval_expired',
        title:   `Demande d'approbation expirée`,
        message: `La demande pour le document "${req.documentNumber ?? req.id}" a expiré sans réponse.`,
        data:    {
          requestId:      req.id,
          requesterName:  `${req.requestedBy?.firstName ?? ''} ${req.requestedBy?.lastName ?? ''}`.trim(),
          documentType:   req.documentType ?? '',
          documentNumber: req.documentNumber ?? '',
          appUrl,
        },
      });

      this.logger.log(`[Approval] Demande expirée : ${req.id}`);
    }
  }
}

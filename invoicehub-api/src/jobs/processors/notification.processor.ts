import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../gateway/events.gateway';
import { renderEmailTemplate, setMailerPrisma } from '../../lib/mailer';
import type { NotificationJobData, EmailJobData } from '../job-types';

@Processor('notification')
export class NotificationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: EventsGateway,
    @InjectQueue('email') private readonly emailQueue: Queue<EmailJobData>,
  ) {
    super();
    // Initialise le singleton mailer avec l'instance Prisma injectée pour
    // permettre le rendu des templates email stockés en base.
    setMailerPrisma(prisma as any);
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { userId, type, title, message, data } = job.data;

    // 1. Créer la notification in-app
    await this.prisma.notification.create({
      data: {
        userId,
        type: type as NotificationStatus,
        title,
        message,
        data: (data ?? {}) as any,
      },
    });

    // 2. Émettre en temps réel
    this.gateway.emitToUser(userId, 'notification:new', { type, title, message, data });

    // 3. Vérifier les préférences
    const setting = await this.prisma.notificationSetting.findFirst({
      where: { userId, type: type as NotificationStatus },
    });

    if (setting?.enabled === false) return;

    const channel = setting?.channel ?? 'both';
    if (channel !== 'email' && channel !== 'both') return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    if (!user) return;

    const variables: Record<string, string> = {
      userName:     user.firstName,
      userFullName: `${user.firstName} ${user.lastName ?? ''}`.trim(),
      companyName:  'Bridge Technologies Solutions',
      ...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [k, String(v)])),
    };

    const rendered = await renderEmailTemplate(type, variables);

    await this.emailQueue.add('email', {
      to:      user.email,
      subject: rendered?.subject ?? title,
      html:    rendered?.html ?? `<p>Bonjour ${user.firstName},</p><p>${message}</p>`,
    });
  }
}

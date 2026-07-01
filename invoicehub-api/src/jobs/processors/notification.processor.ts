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
      // Base absolue pour rendre cliquables les liens relatifs (data.documentLink)
      appUrl:       process.env.APP_URL ?? 'http://localhost:3001',
      ...Object.fromEntries(Object.entries(data ?? {}).map(([k, v]) => [k, String(v)])),
    };

    // 'system' est un type de notification générique (proforma créée, brouillon,
    // annulation…). Le template email de type 'system' est en réalité l'email de
    // réinitialisation de mot de passe — on ne doit donc PAS l'utiliser ici : on
    // bascule sur le rendu générique (titre + message).
    const rendered = type === 'system' ? null : await renderEmailTemplate(type, variables);

    // Rendu de secours (type sans template, ex. 'system' : proforma créée,
    // brouillon, annulation…). Si la notification concerne un document, on ajoute
    // toujours un lien cliquable vers celui-ci — jamais un email sans contexte.
    const esc = (s: string) =>
      String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
      );
    const docLink = (data as any)?.documentLink
      ? `${variables.appUrl}${(data as any).documentLink}`
      : null;
    const fallbackHtml =
      `<p>Bonjour ${esc(user.firstName)},</p><p>${esc(message)}</p>` +
      (docLink
        ? `<p><a href="${esc(docLink)}" style="color:#2D7DD2;font-weight:600;">Voir le document</a></p>`
        : '');

    await this.emailQueue.add('email', {
      to:      user.email,
      // Toujours identifier l'origine InvoiceHub dans l'objet, même en fallback.
      subject: rendered?.subject ?? `[InvoiceHub] ${title}`,
      html:    rendered?.html ?? fallbackHtml,
    });
  }
}

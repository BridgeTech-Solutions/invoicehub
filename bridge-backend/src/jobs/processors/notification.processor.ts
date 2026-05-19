/**
 * @module jobs/processors/notification
 * Traitement des jobs de notification.
 *
 * Pour chaque job :
 *  1. Crée la notification in-app (table `notifications`)
 *  2. Consulte les `notification_settings` de l'utilisateur
 *  3. Si le canal configuré inclut l'email, enqueue un job email
 *
 * Si l'utilisateur n'a pas de paramètre pour ce type de notification,
 * la valeur par défaut est `in_app` (pas d'email automatique).
 */
import { Job } from 'bullmq';
import { NotificationStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { emailQueue } from '../queues';
import { emitToUser } from '../../lib/socket';
import { DashboardService } from '../../modules/dashboard/dashboard.service';
import { renderEmailTemplate } from '../../lib/mailer';
import type { NotificationJobData } from '../queues';

export async function processNotificationJob(job: Job<NotificationJobData>): Promise<void> {
  const { userId, type, title, message, data } = job.data;

  // 1. Créer la notification in-app (entityId stocké dans data JSON)
  await NotificationsService.create(
    userId,
    type as NotificationStatus,
    title,
    message,
    data ?? {},
  );

  // 2. Émettre en temps réel via Socket.io
  emitToUser(userId, 'notification:new', { type, title, message, data });

  // 3. Invalider le cache dashboard si événement financier
  const financialEvents = ['invoice_issued', 'invoice_paid', 'invoice_partially_paid', 'payment_registered', 'system'];
  if (financialEvents.includes(type)) {
    await DashboardService.invalidateCache();
  }

  // 2. Vérifier les préférences de l'utilisateur pour ce type
  const setting = await prisma.notificationSetting.findFirst({
    where: { userId, type: type as NotificationStatus },
  });

  // Si l'utilisateur a désactivé ce type de notification, ne pas envoyer d'email
  if (setting?.enabled === false) return;

  // Par défaut : both (aligné sur getSettings() et l'UI). Si channel = 'email' ou 'both', envoyer un email.
  const channel = setting?.channel ?? 'both';

  if (channel === 'email' || channel === 'both') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    if (user) {
      // Variables disponibles pour les templates : champs de data convertis en string + userName
      const variables: Record<string, string> = {
        userName:    user.firstName,
        userFullName: `${user.firstName} ${user.lastName ?? ''}`.trim(),
        companyName: 'Bridge Technologies Solutions',
        ...Object.fromEntries(
          Object.entries(data ?? {}).map(([k, v]) => [k, String(v)]),
        ),
      };

      const rendered = await renderEmailTemplate(type, variables);

      // Construit un lien vers le document si l'ID est disponible dans data
      const rawData = data ?? {};
      const docUrl =
        rawData.invoiceId  ? `${env.APP_URL}/invoices/${rawData.invoiceId}` :
        rawData.proformaId ? `${env.APP_URL}/proformas/${rawData.proformaId}` :
        null;

      const fallbackHtml = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0f2d4a;padding:16px 24px;border-radius:8px 8px 0 0;">
            <h2 style="color:#fff;margin:0;font-size:18px;">${title}</h2>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
            <p>Bonjour ${user.firstName},</p>
            <p>${message}</p>
            ${docUrl ? `
            <div style="text-align:center;margin:24px 0;">
              <a href="${docUrl}" style="background:#2D7DD2;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;">
                Voir le document
              </a>
            </div>` : ''}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
            <p style="color:#6b7280;font-size:12px;margin:0;">InvoiceHub — Bridge Technologies Solutions</p>
          </div>
        </div>
      `;

      await emailQueue.add('email' as string, {
        to:      user.email,
        subject: rendered?.subject ?? title,
        html:    rendered?.html ?? fallbackHtml,
      });
    }
  }
}

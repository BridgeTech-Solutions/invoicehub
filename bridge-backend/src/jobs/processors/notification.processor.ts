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
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { emailQueue } from '../queues';
import { emitToUser } from '../../lib/socket';
import { DashboardService } from '../../modules/dashboard/dashboard.service';
import type { NotificationJobData } from '../queues';

export async function processNotificationJob(job: Job<NotificationJobData>): Promise<void> {
  const { userId, type, title, message, data } = job.data;

  // Extraire l'entityId depuis data (invoiceId, proformaId ou userId selon le type)
  const entityId = (data?.invoiceId ?? data?.proformaId ?? data?.userId) as string | undefined;

  // 1. Créer la notification in-app
  await NotificationsService.create(
    userId,
    type as NotificationStatus,
    title,
    message,
    data ?? {},
    entityId,
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

  // Par défaut : in_app uniquement. Si channel = 'email' ou 'both', envoyer un email.
  const channel = setting?.channel ?? 'in_app';

  if (channel === 'email' || channel === 'both') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (user) {
      await emailQueue.add('email' as string, {
        to: user.email,
        subject: title,
        html: `
          <p>Bonjour ${user.firstName},</p>
          <p>${message}</p>
          <hr/>
          <p><small>InvoiceHub — Bridge Technologies Solutions</small></p>
        `,
      });
    }
  }
}

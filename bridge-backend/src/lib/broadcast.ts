/**
 * @module lib/broadcast
 * Helper pour envoyer une notification in-app à tous les utilisateurs actifs.
 *
 * Utilisé pour les événements métier importants (facture émise, proforma envoyée,
 * paiement enregistré) qui concernent toute l'équipe BTS.
 */
import { prisma } from '../config/database';
import { notificationQueue } from '../jobs/queues';
import type { NotificationJobData } from '../jobs/queues';

type BroadcastPayload = Omit<NotificationJobData, 'userId'>;

/**
 * Envoie une notification in-app à tous les utilisateurs actifs de l'application.
 * Exclut optionnellement l'auteur de l'action (excludeUserId) pour éviter
 * de notifier quelqu'un de sa propre action.
 */
export async function broadcastNotification(
  payload: BroadcastPayload,
  options: { excludeUserId?: string } = {},
): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      status:    'active',
      deletedAt: null,
      ...(options.excludeUserId ? { id: { not: options.excludeUserId } } : {}),
    },
    select: { id: true },
  });

  await Promise.all(
    users.map((u) =>
      notificationQueue.add('notification', { userId: u.id, ...payload }),
    ),
  );
}

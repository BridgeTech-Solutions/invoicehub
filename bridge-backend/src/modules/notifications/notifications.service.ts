import { Prisma, NotificationStatus } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';

export class NotificationsService {
  async list(userId: string, page = 1, limit = 20, unreadOnly = false) {
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly && { isRead: false }),
    };

    const [total, data, unreadCount] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit), unreadCount };
  }

  async markRead(id: string, userId: string): Promise<void> {
    const notif = await prisma.notification.findFirst({ where: { id, userId } });
    if (!notif) throw AppError.notFound('Notification introuvable');

    await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /** Crée une notification in-app pour un utilisateur */
  static async create(
    userId: string,
    type: NotificationStatus,
    title: string,
    message: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    await prisma.notification.create({
      data: { userId, type, title, message, data },
    }).catch(() => {/* Non critique */});
  }
}

export const notificationsService = new NotificationsService();

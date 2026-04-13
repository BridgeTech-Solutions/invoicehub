import { Prisma, NotificationStatus, NotificationChannel } from '@prisma/client';
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

  /** Retourne les préférences de notification de l'utilisateur (tous les types) */
  async getSettings(userId: string) {
    const allTypes = Object.values(NotificationStatus);
    const saved = await prisma.notificationSetting.findMany({ where: { userId } });
    const savedMap = new Map(saved.map(s => [s.type, s]));

    // Retourne un objet pour chaque type (avec valeurs par défaut si non configuré)
    return allTypes.map(type => ({
      type,
      channel: savedMap.get(type)?.channel ?? 'both' as NotificationChannel,
      enabled: savedMap.get(type)?.enabled ?? true,
    }));
  }

  /** Met à jour les préférences de notification (upsert par type) */
  async updateSettings(
    userId: string,
    settings: Array<{ type: NotificationStatus; channel: NotificationChannel; enabled: boolean }>,
  ) {
    await prisma.$transaction(
      settings.map(s =>
        prisma.notificationSetting.upsert({
          where: { userId_type: { userId, type: s.type } },
          create:  { userId, type: s.type, channel: s.channel, enabled: s.enabled },
          update:  { channel: s.channel, enabled: s.enabled },
        }),
      ),
    );
    return this.getSettings(userId);
  }

  /**
   * Désactive toutes les notifications pour un utilisateur en un seul appel.
   * Conserve les préférences de canal existantes (email, in-app, both).
   */
  async disableAll(userId: string) {
    const allTypes = Object.values(NotificationStatus);
    const saved = await prisma.notificationSetting.findMany({ where: { userId } });
    const savedMap = new Map(saved.map(s => [s.type, s]));

    await prisma.$transaction(
      allTypes.map(type =>
        prisma.notificationSetting.upsert({
          where: { userId_type: { userId, type } },
          create:  { userId, type, channel: 'both', enabled: false },
          update:  { enabled: false, channel: savedMap.get(type)?.channel ?? 'both' },
        }),
      ),
    );
    return this.getSettings(userId);
  }

  /** Réactive toutes les notifications pour un utilisateur en un seul appel. */
  async enableAll(userId: string) {
    const allTypes = Object.values(NotificationStatus);
    const saved = await prisma.notificationSetting.findMany({ where: { userId } });
    const savedMap = new Map(saved.map(s => [s.type, s]));

    await prisma.$transaction(
      allTypes.map(type =>
        prisma.notificationSetting.upsert({
          where: { userId_type: { userId, type } },
          create:  { userId, type, channel: 'both', enabled: true },
          update:  { enabled: true, channel: savedMap.get(type)?.channel ?? 'both' },
        }),
      ),
    );
    return this.getSettings(userId);
  }

  /** Crée une notification in-app pour un utilisateur */
  static async create(
    userId: string,
    type: NotificationStatus,
    title: string,
    message: string,
    data: Record<string, unknown> = {},
    entityId?: string,
  ): Promise<void> {
    await prisma.notification.create({
      data: { userId, type, title, message, data: data as object, ...(entityId ? { entityId } : {}) },
    }).catch(() => {/* Non critique */});
  }
}

export const notificationsService = new NotificationsService();

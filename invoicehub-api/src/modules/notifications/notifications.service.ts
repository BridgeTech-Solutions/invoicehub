import { Injectable } from '@nestjs/common';
import { Prisma, NotificationStatus, NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, page = 1, limit = 20, unreadOnly = false) {
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly && { isRead: false }),
    };

    const [total, data, unreadCount] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit), unreadCount };
  }

  async markRead(id: string, userId: string): Promise<void> {
    const notif = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notif) throw AppError.notFound('Notification introuvable');
    await this.prisma.notification.update({
      where: { id },
      data:  { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true, readAt: new Date() },
    });
  }

  async getSettings(userId: string) {
    const allTypes = Object.values(NotificationStatus);
    const saved    = await this.prisma.notificationSetting.findMany({ where: { userId } });
    const savedMap = new Map(saved.map(s => [s.type, s]));

    return allTypes.map(type => ({
      type,
      channel: savedMap.get(type)?.channel ?? ('both' as NotificationChannel),
      enabled: savedMap.get(type)?.enabled ?? true,
    }));
  }

  async updateSettings(
    userId: string,
    settings: Array<{ type: NotificationStatus; channel: NotificationChannel; enabled: boolean }>,
  ) {
    await this.prisma.$transaction(
      settings.map(s =>
        this.prisma.notificationSetting.upsert({
          where:  { userId_type: { userId, type: s.type } },
          create: { userId, type: s.type, channel: s.channel, enabled: s.enabled },
          update: { channel: s.channel, enabled: s.enabled },
        }),
      ),
    );
    return this.getSettings(userId);
  }

  async disableAll(userId: string) {
    const allTypes = Object.values(NotificationStatus);
    const saved    = await this.prisma.notificationSetting.findMany({ where: { userId } });
    const savedMap = new Map(saved.map(s => [s.type, s]));

    await this.prisma.$transaction(
      allTypes.map(type =>
        this.prisma.notificationSetting.upsert({
          where:  { userId_type: { userId, type } },
          create: { userId, type, channel: 'both', enabled: false },
          update: { enabled: false, channel: savedMap.get(type)?.channel ?? 'both' },
        }),
      ),
    );
    return this.getSettings(userId);
  }

  async enableAll(userId: string) {
    const allTypes = Object.values(NotificationStatus);
    const saved    = await this.prisma.notificationSetting.findMany({ where: { userId } });
    const savedMap = new Map(saved.map(s => [s.type, s]));

    await this.prisma.$transaction(
      allTypes.map(type =>
        this.prisma.notificationSetting.upsert({
          where:  { userId_type: { userId, type } },
          create: { userId, type, channel: 'both', enabled: true },
          update: { enabled: true, channel: savedMap.get(type)?.channel ?? 'both' },
        }),
      ),
    );
    return this.getSettings(userId);
  }

  async create(
    userId: string,
    type: NotificationStatus,
    title: string,
    message: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, type, title, message, data: data as object },
    }).catch(err => {
      console.error('[NotificationsService.create] Erreur silencieuse :', err?.message);
    });
  }
}

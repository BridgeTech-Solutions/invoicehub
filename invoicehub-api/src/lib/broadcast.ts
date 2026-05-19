import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import type { NotificationJobData } from '../jobs/job-types';

type BroadcastPayload = Omit<NotificationJobData, 'userId'>;

export async function broadcastNotification(
  prisma: PrismaClient,
  notificationQueue: Queue<NotificationJobData>,
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
    users.map((u: { id: string }) =>
      notificationQueue.add('notification', { userId: u.id, ...payload }),
    ),
  );
}

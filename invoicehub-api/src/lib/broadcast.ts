import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import type { NotificationJobData } from '../jobs/job-types';

type BroadcastPayload = Omit<NotificationJobData, 'userId'>;

export interface BroadcastOptions {
  excludeUserId?: string;
  /** Notifie seulement les utilisateurs dont le rôle inclut cette permission
   *  (ou 'module:*' ou '*'). Si omis, notifie tous les actifs. */
  permission?: string;
}

function _hasPerm(perms: string[], required: string): boolean {
  if (perms.includes('*')) return true;
  if (perms.includes(required)) return true;
  const [module] = required.split(':');
  return perms.includes(`${module}:*`);
}

export async function broadcastNotification(
  prisma: PrismaClient,
  notificationQueue: Queue<NotificationJobData>,
  payload: BroadcastPayload,
  options: BroadcastOptions = {},
): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      status:    'active',
      deletedAt: null,
      ...(options.excludeUserId ? { id: { not: options.excludeUserId } } : {}),
    },
    select: {
      id:   true,
      role: { select: { permissions: true } },
    },
  });

  const targets = options.permission
    ? users.filter(u => _hasPerm((u.role?.permissions ?? []) as string[], options.permission!))
    : users;

  await Promise.all(
    targets.map(u => notificationQueue.add('notification', { userId: u.id, ...payload })),
  );
}

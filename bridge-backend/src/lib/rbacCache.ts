import { redisConnection } from '../config/redis';

export async function invalidateUserRbacCache(userId: string): Promise<void> {
  await redisConnection.del(`rbac:user:${userId}`);
}

export async function invalidateRoleRbacCache(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const keys = userIds.map((id) => `rbac:user:${id}`);
  await redisConnection.del(...keys);
}

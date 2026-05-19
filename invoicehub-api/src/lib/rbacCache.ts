import { default as IORedis } from 'ioredis';
import type { Redis } from 'ioredis';

let _redis: Redis | null = null;

export function setRbacCacheRedis(r: Redis) {
  _redis = r;
}

export async function invalidateUserRbacCache(userId: string): Promise<void> {
  await _redis?.del(`rbac:user:${userId}`);
}

export async function invalidateRoleRbacCache(userIds: string[]): Promise<void> {
  if (userIds.length === 0 || !_redis) return;
  const keys = userIds.map(id => `rbac:user:${id}`);
  await _redis.del(...keys);
}

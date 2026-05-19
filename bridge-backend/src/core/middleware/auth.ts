import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../lib/jwt';
import { prisma } from '../../config/database';
import { redisConnection } from '../../config/redis';
import { AppError } from '../errors/AppError';

const RBAC_TTL = 300; // 5 minutes

interface CachedRbac {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  firstName: string;
  lastName: string;
}

async function loadUserRbac(userId: string): Promise<CachedRbac | null> {
  const cacheKey = `rbac:user:${userId}`;

  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as CachedRbac;
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, status: 'active' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      roleId: true,
      role: { select: { name: true, permissions: true } },
    },
  });

  if (!user || !user.role) return null;

  const data: CachedRbac = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleId: user.roleId,
    roleName: user.role.name,
    permissions: user.role.permissions,
  };

  await redisConnection.setex(cacheKey, RBAC_TTL, JSON.stringify(data));
  return data;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Token d\'authentification manquant'));
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    const user = await loadUserRbac(payload.sub);

    if (!user) {
      return next(AppError.unauthorized('Compte introuvable ou suspendu'));
    }

    req.user = user;
    next();
  } catch {
    next(AppError.unauthorized('Token invalide ou expiré'));
  }
}

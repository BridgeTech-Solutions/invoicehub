import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { hashPassword, comparePassword } from '../../lib/bcrypt';
import { AppError } from '../../core/errors/AppError';
import { env } from '../../config/env';
import { notificationQueue } from '../../jobs/queues';
import { logger } from '../../core/middleware/requestLogger';
import type { CreateUserInput, UpdateUserInput, UpdateMeInput, ChangePasswordInput, ListUsersInput } from './users.schema';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  mustChangePassword: true,
  twoFactorEnabled: true,
  language: true,
  timezone: true,
  theme: true,
  emailNotifications: true,
  invoiceNotifications: true,
  avatarPath: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** Convertit un chemin filesystem (absolu ou relatif) en URL HTTP publique du backend. */
function toAvatarUrl(avatarPath: string | null): string | null {
  if (!avatarPath) return null;
  const rel = path.isAbsolute(avatarPath)
    ? path.relative(process.cwd(), avatarPath).replace(/\\/g, '/')
    : avatarPath.replace(/\\/g, '/');
  return `${env.BACKEND_URL}/${rel}`;
}

/** Remplace avatarPath par avatarUrl dans la réponse. */
function formatUser<T extends { avatarPath: string | null }>(user: T) {
  const { avatarPath, ...rest } = user;
  return { ...rest, avatarUrl: toAvatarUrl(avatarPath) };
}

export class UsersService {
  async list(input: ListUsersInput) {
    const { page, limit, role, status, search } = input;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(role && { role }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data: users.map(formatUser), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw AppError.notFound('Utilisateur introuvable');
    return formatUser(user);
  }

  async create(input: CreateUserInput, createdById: string) {
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw AppError.conflict('Un utilisateur avec cet email existe déjà');

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        role: input.role,
        passwordHash,
        status: 'active',
        mustChangePassword: true,
        createdById,
      },
      select: USER_SELECT,
    });

    logger.info(`Utilisateur créé : ${user.email} (${user.role}) par ${createdById}`);

    // Notifier les admins qu'un nouveau compte a été créé
    const admins = await prisma.user.findMany({
      where: { role: 'admin', status: 'active', deletedAt: null },
      select: { id: true },
    });
    for (const admin of admins) {
      if (admin.id === createdById) continue; // pas d'auto-notification
      void notificationQueue.add('notification', {
        userId: admin.id,
        type: 'user_created',
        title: 'Nouveau compte utilisateur',
        message: `${user.firstName} ${user.lastName} (${user.role}) a rejoint l'équipe.`,
        data: { userId: user.id },
      });
    }

    return formatUser(user);
  }

  async update(id: string, input: UpdateUserInput) {
    const oldUser = await this.findById(id);
    
    // Si le rôle change, révoquer tous les tokens pour forcer la reconnexion
    if (input.role && input.role !== oldUser.role) {
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'role_changed' },
      });
      logger.info(`Tokens révoqués pour ${oldUser.email} : changement de rôle ${oldUser.role} → ${input.role}`);
    }

    // Si le statut passe à suspendu, révoquer tous les tokens
    if (input.status === 'suspended' && oldUser.status !== 'suspended') {
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'account_suspended' },
      });
      logger.info(`Tokens révoqués pour ${oldUser.email} : compte suspendu`);
    }

    const user = await prisma.user.update({
      where: { id },
      data: input,
      select: USER_SELECT,
    });

    logger.info(`Utilisateur modifié : ${user.email} (${Object.keys(input).join(', ')})`);
    return formatUser(user);
  }

  async updateMe(userId: string, input: UpdateMeInput) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: input,
      select: USER_SELECT,
    });
    return formatUser(user);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await comparePassword(input.currentPassword, user.passwordHash);
    if (!valid) throw AppError.badRequest('Mot de passe actuel incorrect');

    const passwordHash = await hashPassword(input.newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });

    logger.info(`Mot de passe changé pour : ${user.email}`);

    // Révoquer tous les refresh tokens sauf la session courante
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'password_change' },
    });
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.findById(id);
    
    // Archiver l'utilisateur
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'suspended' },
    });

    // Révoquer TOUS les refresh tokens de cet utilisateur
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'user_deleted' },
    });

    logger.info(`Utilisateur archivé : ${user.email}`);
  }

  async reactivate(id: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { email: true },
    });
    if (!user) throw AppError.notFound('Utilisateur archivé introuvable');

    await prisma.user.update({
      where: { id },
      data: { deletedAt: null, status: 'active' },
    });

    logger.info(`Utilisateur réactivé : ${user.email}`);
  }
}

export const usersService = new UsersService();

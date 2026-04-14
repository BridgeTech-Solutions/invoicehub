import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { hashPassword, comparePassword } from '../../lib/bcrypt';
import { AppError } from '../../core/errors/AppError';
import { env } from '../../config/env';
import { notificationQueue, emailQueue } from '../../jobs/queues';
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

    // Génère un mot de passe aléatoire temporaire (ne sera pas communiqué car l'activation forcera le reset)
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await hashPassword(tempPassword);

    const user = await prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        role: input.role,
        passwordHash,
        status: 'pending_activation',
        mustChangePassword: true,
        createdById,
      },
      select: USER_SELECT,
    });

    logger.info(`Utilisateur créé : ${user.email} (${user.role}) par ${createdById}`);

    // Génération du token d'activation (réutilise la logique de PasswordResetToken)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // 24 heures pour l'activation

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    const activationUrl = `${env.APP_URL}/reset-password?token=${rawToken}`;

    // Email de bienvenue avec lien d'activation
    void emailQueue.add('email', {
      to: user.email,
      subject: 'Bienvenue sur InvoiceHub — Activez votre compte',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <h2 style="color:#0f2d4a">Bienvenue sur InvoiceHub</h2>
          <p>Bonjour <strong>${user.firstName} ${user.lastName}</strong>,</p>
          <p>Votre compte a été créé sur la plateforme InvoiceHub de Bridge Technologies Solutions.</p>
          <p>Pour commencer à utiliser votre compte, vous devez d'abord l'activer en choisissant votre mot de passe.</p>
          
          <p style="margin:24px 0">
            <a href="${activationUrl}" style="display:inline-block;padding:12px 24px;background:#2D7DD2;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
              Activer mon compte
            </a>
          </p>
          
          <p style="font-size:13px;color:#718096">
            Ce lien est valable pendant 24 heures. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.
          </p>
          
          <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px">
            <tr>
              <td style="padding:8px 12px;background:#f5f7fa;border:1px solid #e2e8f0;font-weight:bold;width:120px">Email</td>
              <td style="padding:8px 12px;border:1px solid #e2e8f0">${user.email}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f5f7fa;border:1px solid #e2e8f0;font-weight:bold">Rôle</td>
              <td style="padding:8px 12px;border:1px solid #e2e8f0;text-transform:capitalize">${user.role}</td>
            </tr>
          </table>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
          <p style="font-size:12px;color:#718096">InvoiceHub — Bridge Technologies Solutions</p>
        </div>
      `,
    });

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

  async resetPassword(id: string, newPassword: string): Promise<void> {
    const user = await this.findById(id);
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });
    // Révoquer tous les tokens pour forcer une reconnexion
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'password_reset_by_admin' },
    });
    logger.info(`Mot de passe réinitialisé par admin pour : ${user.email}`);
  }

  async reactivate(id: string): Promise<void> {
    // Gère deux cas :
    // 1. Archivé via softDelete (deletedAt != null, status = suspended)
    // 2. Suspendu via PUT /:id (deletedAt = null, status = suspended)
    const user = await prisma.user.findFirst({
      where: {
        id,
        OR: [
          { deletedAt: { not: null } },
          { status: 'suspended' },
        ],
      },
      select: { email: true },
    });
    if (!user) throw AppError.notFound('Utilisateur suspendu ou archivé introuvable');

    await prisma.user.update({
      where: { id },
      data: { deletedAt: null, status: 'active' },
    });

    logger.info(`Utilisateur réactivé : ${user.email}`);
  }

  async uploadAvatar(userId: string, filePath: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });
    if (user?.avatarPath && fs.existsSync(user.avatarPath)) {
      fs.unlinkSync(user.avatarPath);
    }
    await prisma.user.update({ where: { id: userId }, data: { avatarPath: filePath } });
  }

  async deleteAvatar(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });
    if (user?.avatarPath && fs.existsSync(user.avatarPath)) {
      fs.unlinkSync(user.avatarPath);
    }
    await prisma.user.update({ where: { id: userId }, data: { avatarPath: null } });
  }

  async getActivity(id: string) {
    return prisma.auditLog.findMany({
      where:   { userId: id },
      orderBy: { createdAt: 'desc' },
      take:    30,
    });
  }
}

export const usersService = new UsersService();

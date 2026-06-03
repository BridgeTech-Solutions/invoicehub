import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword, comparePassword } from '../../lib/bcrypt';
import { toRelativeUpload, resolveUpload } from '../../lib/uploads';
import { AppError } from '../../common/errors/app-error';
import type { EmailJobData, NotificationJobData } from '../../jobs/job-types';
import type {
  CreateUserInput,
  UpdateUserInput,
  UpdateMeInput,
  ChangePasswordInput,
  ListUsersInput,
} from './users.schema';

const USER_SELECT = {
  id:         true,
  firstName:  true,
  lastName:   true,
  email:      true,
  phone:      true,
  roleId:     true,
  role:       { select: { name: true, permissions: true } },
  status:     true,
  mustChangePassword:   true,
  twoFactorEnabled:     true,
  language:   true,
  timezone:   true,
  theme:      true,
  emailNotifications:   true,
  invoiceNotifications: true,
  avatarPath: true,
  lastLoginAt: true,
  createdAt:  true,
  updatedAt:  true,
};

function toAvatarUrl(avatarPath: string | null): string | null {
  if (!avatarPath) return null;
  const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3000';
  const rel = path.isAbsolute(avatarPath)
    ? path.relative(process.cwd(), avatarPath).replace(/\\/g, '/')
    : avatarPath.replace(/\\/g, '/');
  return `${backendUrl}/${rel}`;
}

function formatUser(user: any) {
  const { avatarPath, role, ...rest } = user;
  return {
    ...rest,
    role:        (role as any)?.name ?? 'employee',
    permissions: (role as any)?.permissions ?? [],
    avatarUrl:   toAvatarUrl(avatarPath as string | null),
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('email')        private readonly emailQueue: Queue<EmailJobData>,
    @InjectQueue('notification') private readonly notificationQueue: Queue<NotificationJobData>,
  ) {}

  async list(input: ListUsersInput) {
    const { page, limit, role, status, search } = input;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status === 'suspended') {
      where['status']    = 'suspended';
      where['deletedAt'] = { not: null };
    } else {
      where['deletedAt'] = null;
      if (status) where['status'] = status;
    }
    if (role) where['role'] = { is: { name: role } };
    if (search) {
      where['OR'] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
        { email:     { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where: where as any }),
      this.prisma.user.findMany({
        where:   where as any,
        select:  USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { data: users.map(formatUser), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where:  { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw AppError.notFound('Utilisateur introuvable');
    return formatUser(user);
  }

  async create(input: CreateUserInput, createdById: string) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw AppError.conflict('Un utilisateur avec cet email existe déjà');

    const tempPassword  = crypto.randomBytes(16).toString('hex');
    const passwordHash  = input.password ? await hashPassword(input.password) : await hashPassword(tempPassword);

    const user = await this.prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName:  input.lastName,
        email:     input.email,
        phone:     input.phone,
        role:      { connect: { name: input.role } },
        passwordHash,
        status:            'pending_activation' as any,
        mustChangePassword: true,
        createdBy: createdById ? { connect: { id: createdById } } : undefined,
      } as any,
      select: USER_SELECT,
    });

    const roleName = user.role?.name ?? input.role;
    this.logger.log(`Utilisateur créé : ${user.email} (${roleName}) par ${createdById}`);

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const appUrl        = process.env['APP_URL'] ?? 'http://localhost:3001';
    const activationUrl = `${appUrl}/reset-password?token=${rawToken}`;

    void this.emailQueue.add('email', {
      to:      user.email,
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
          <p style="font-size:13px;color:#718096">Ce lien est valable pendant 24 heures.</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px">
            <tr>
              <td style="padding:8px 12px;background:#f5f7fa;border:1px solid #e2e8f0;font-weight:bold;width:120px">Email</td>
              <td style="padding:8px 12px;border:1px solid #e2e8f0">${user.email}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f5f7fa;border:1px solid #e2e8f0;font-weight:bold">Rôle</td>
              <td style="padding:8px 12px;border:1px solid #e2e8f0;text-transform:capitalize">${roleName}</td>
            </tr>
          </table>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
          <p style="font-size:12px;color:#718096">InvoiceHub — Bridge Technologies Solutions</p>
        </div>
      `,
    });

    const admins = await this.prisma.user.findMany({
      where:  { role: { is: { name: 'admin' } }, status: 'active', deletedAt: null } as any,
      select: { id: true },
    });
    for (const admin of admins) {
      if (admin.id === createdById) continue;
      void this.notificationQueue.add('notification', {
        userId:  admin.id,
        type:    'user_created',
        title:   'Nouveau compte utilisateur',
        message: `${user.firstName} ${user.lastName} (${roleName}) a rejoint l'équipe.`,
        data:    { userId: user.id },
      });
    }

    return formatUser(user);
  }

  async update(id: string, input: UpdateUserInput) {
    const oldUser = await this.findById(id);

    if (input.role && input.role !== oldUser.role) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data:  { revokedAt: new Date(), revokeReason: 'role_changed' },
      });
      this.logger.log(`Tokens révoqués pour ${oldUser.email} : changement de rôle ${oldUser.role} → ${input.role}`);
    }

    if (input.status === 'suspended' && oldUser.status !== 'suspended') {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data:  { revokedAt: new Date(), revokeReason: 'account_suspended' },
      });
      this.logger.log(`Tokens révoqués pour ${oldUser.email} : compte suspendu`);
    }

    const { role, ...rest } = input;
    const updateData: Record<string, unknown> = { ...rest };
    if (role) updateData['role'] = { connect: { name: role } };

    const user = await this.prisma.user.update({
      where:  { id },
      data:   updateData as any,
      select: USER_SELECT,
    });

    this.logger.log(`Utilisateur modifié : ${user.email} (${Object.keys(input).join(', ')})`);
    return formatUser(user);
  }

  async updateMe(userId: string, input: UpdateMeInput) {
    const user = await this.prisma.user.update({
      where:  { id: userId },
      data:   input,
      select: USER_SELECT,
    });
    return formatUser(user);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user  = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await comparePassword(input.currentPassword, user.passwordHash);
    if (!valid) throw AppError.badRequest('Mot de passe actuel incorrect');

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data:  { passwordHash, mustChangePassword: false },
    });

    this.logger.log(`Mot de passe changé pour : ${user.email}`);

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date(), revokeReason: 'password_change' },
    });
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.findById(id);

    await this.prisma.user.update({
      where: { id },
      data:  { deletedAt: new Date(), status: 'suspended' },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data:  { revokedAt: new Date(), revokeReason: 'user_deleted' },
    });

    this.logger.log(`Utilisateur archivé : ${user.email}`);
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    const user         = await this.findById(id);
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id },
      data:  { passwordHash, mustChangePassword: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data:  { revokedAt: new Date(), revokeReason: 'password_reset_by_admin' },
    });
    this.logger.log(`Mot de passe réinitialisé par admin pour : ${user.email}`);
  }

  async reactivate(id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where:  { id, OR: [{ deletedAt: { not: null } }, { status: 'suspended' }] },
      select: { email: true },
    });
    if (!user) throw AppError.notFound('Utilisateur suspendu ou archivé introuvable');

    await this.prisma.user.update({
      where: { id },
      data:  { deletedAt: null, status: 'active' },
    });

    this.logger.log(`Utilisateur réactivé : ${user.email}`);
  }

  async uploadAvatar(userId: string, filePath: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });
    // Supprime l'ancien avatar (résout relatif récent ou absolu hérité)
    if (user?.avatarPath) {
      const oldAbs = resolveUpload(user.avatarPath);
      if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
    }
    // Stocke un chemin RELATIF (portable), pas le chemin absolu de multer
    await this.prisma.user.update({ where: { id: userId }, data: { avatarPath: toRelativeUpload(filePath) } });
  }

  async deleteAvatar(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });
    if (user?.avatarPath) {
      const oldAbs = resolveUpload(user.avatarPath);
      if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
    }
    await this.prisma.user.update({ where: { id: userId }, data: { avatarPath: null } });
  }

  async getActivity(id: string) {
    return this.prisma.auditLog.findMany({
      where:   { userId: id },
      orderBy: { createdAt: 'desc' },
      take:    30,
    });
  }
}

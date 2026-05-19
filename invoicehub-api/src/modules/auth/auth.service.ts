import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { comparePassword, hashPassword } from '../../lib/bcrypt';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiry,
} from '../../lib/jwt';
import {
  generateTotpSecret,
  getTotpUri,
  generateQrCode,
  verifyTotpToken,
} from '../../lib/totp';
import { AppError } from '../../common/errors/app-error';
import type { EmailJobData } from '../../jobs/job-types';
import type { LoginInput } from './auth.schema';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('email') private readonly emailQueue: Queue<EmailJobData>,
  ) {}

  async login(input: LoginInput, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where:   { email: input.email },
      include: { role: true },
    });

    const logAttempt = async (success: boolean, failureReason?: string) => {
      await this.prisma.loginHistory.create({
        data: {
          userId:        user?.id ?? null,
          email:         input.email,
          ipAddress:     ip ?? null,
          userAgent:     userAgent ?? null,
          success,
          failureReason: failureReason ?? null,
        },
      });
    };

    if (!user || user.deletedAt) {
      await logAttempt(false, 'user_not_found');
      throw AppError.unauthorized('Email ou mot de passe incorrect');
    }

    if (user.status === 'suspended') {
      await logAttempt(false, 'account_suspended');
      throw AppError.unauthorized("Compte suspendu. Contactez l'administrateur");
    }

    if (user.status === 'pending_activation') {
      await logAttempt(false, 'account_pending_activation');
      throw AppError.unauthorized('Compte non activé. Veuillez utiliser le lien reçu par email pour définir votre mot de passe');
    }

    if (user.lockedAt) {
      await logAttempt(false, 'account_locked');
      throw AppError.unauthorized('Compte verrouillé suite à trop de tentatives. Réinitialisez votre mot de passe');
    }

    const passwordValid = await comparePassword(input.password, user.passwordHash);
    if (!passwordValid) {
      const attempts = user.failedLoginAttempts + 1;
      const company  = await this.prisma.companySettings.findFirst({ select: { maxLoginAttempts: true } });
      const maxAttempts = company?.maxLoginAttempts ?? 5;
      const shouldLock  = attempts >= maxAttempts;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lastFailedLoginAt:   new Date(),
          lockedAt:   shouldLock ? new Date() : undefined,
          lockReason: shouldLock ? 'too_many_attempts' : undefined,
        },
      });

      await logAttempt(false, 'bad_password');
      throw AppError.unauthorized('Email ou mot de passe incorrect');
    }

    if (user.twoFactorEnabled) {
      if (!input.totpToken) {
        throw AppError.unauthorized('Code 2FA requis', 'TOTP_REQUIRED');
      }

      const totpValid = user.twoFactorSecret && verifyTotpToken(input.totpToken, user.twoFactorSecret);

      if (!totpValid) {
        const inputHash  = crypto.createHash('sha256').update(input.totpToken.toUpperCase()).digest('hex');
        const backupIndex = user.twoFactorBackupCodes.indexOf(inputHash);

        if (backupIndex === -1) {
          await logAttempt(false, 'bad_totp');
          throw AppError.unauthorized('Code 2FA invalide');
        }

        const newCodes = [...user.twoFactorBackupCodes];
        newCodes.splice(backupIndex, 1);
        await this.prisma.user.update({
          where: { id: user.id },
          data:  { twoFactorBackupCodes: newCodes },
        });
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lastFailedLoginAt:   null,
        lockedAt:    null,
        lockReason:  null,
        lastLoginAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await logAttempt(true);

    const { accessToken, refreshToken } = await this.issueTokens(user.id, ip, userAgent);

    return {
      accessToken,
      refreshToken,
      user: {
        id:                user.id,
        email:             user.email,
        firstName:         user.firstName,
        lastName:          user.lastName,
        role:              user.role?.name ?? 'employee',
        mustChangePassword: user.mustChangePassword,
        twoFactorEnabled:  user.twoFactorEnabled,
      },
    };
  }

  async refresh(refreshToken: string, ip?: string, userAgent?: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized('Refresh token invalide ou expiré');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored    = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw AppError.unauthorized('Refresh token révoqué ou expiré');
    }

    const company = await this.prisma.companySettings.findFirst({ select: { sessionTimeoutMinutes: true } });
    const timeoutMinutes = company?.sessionTimeoutMinutes ?? 0;
    if (timeoutMinutes > 0) {
      const idleMs = Date.now() - stored.lastActivityAt.getTime();
      if (idleMs > timeoutMinutes * 60 * 1000) {
        await this.prisma.refreshToken.update({
          where: { id: stored.id },
          data:  { revokedAt: new Date(), revokeReason: 'session_timeout' },
        });
        throw AppError.unauthorized('Session expirée pour inactivité', 'SESSION_TIMEOUT');
      }
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data:  { revokedAt: new Date(), revokeReason: 'rotation' },
    });

    const user = await this.prisma.user.findFirst({
      where:   { id: payload.sub, deletedAt: null, status: 'active' },
      include: { role: true },
    });

    if (!user) throw AppError.unauthorized('Utilisateur introuvable ou inactif');

    const tokens = await this.issueTokens(user.id, ip, userAgent);

    return {
      ...tokens,
      user: { id: user.id, email: user.email, role: user.role?.name ?? 'employee' },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data:  { revokedAt: new Date(), revokeReason: 'logout' },
    });
  }

  async enableTwoFactor(userId: string) {
    const user   = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = generateTotpSecret();
    const uri    = getTotpUri(user.email, secret);
    const qrCode = await generateQrCode(uri);

    await this.prisma.user.update({
      where: { id: userId },
      data:  { twoFactorSecret: secret },
    });

    return { secret, qrCode };
  }

  async verifyAndActivateTwoFactor(userId: string, token: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret || !verifyTotpToken(token, user.twoFactorSecret)) {
      throw AppError.badRequest('Code TOTP invalide');
    }

    const { plain, hashed } = this.generateBackupCodes();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled:    true,
        twoFactorEnabledAt:  new Date(),
        twoFactorBackupCodes: hashed,
      },
    });

    return { backupCodes: plain };
  }

  async disableTwoFactor(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.twoFactorSecret || !verifyTotpToken(token, user.twoFactorSecret)) {
      throw AppError.badRequest('Code TOTP invalide');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled:    false,
        twoFactorSecret:     null,
        twoFactorEnabledAt:  null,
        twoFactorBackupCodes: [],
      },
    });
  }

  async regenerateBackupCodes(userId: string, totpToken: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw AppError.badRequest("Le 2FA n'est pas activé sur ce compte");
    }

    if (!verifyTotpToken(totpToken, user.twoFactorSecret)) {
      throw AppError.unauthorized('Code TOTP invalide');
    }

    const { plain, hashed } = this.generateBackupCodes();

    await this.prisma.user.update({
      where: { id: userId },
      data:  { twoFactorBackupCodes: hashed },
    });

    return { backupCodes: plain };
  }

  async forgotPassword(email: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return;

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data:  { usedAt: new Date() },
    });

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt, ipAddress: ip ?? null },
    });

    const appUrl  = process.env['APP_URL'] ?? 'http://localhost:3001';
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    await this.emailQueue.add('email', {
      to:      user.email,
      subject: 'Réinitialisation de votre mot de passe — InvoiceHub BTS',
      html: `
        <p>Bonjour ${user.firstName},</p>
        <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe (valable 1 heure) :</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      `,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash  = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where:   { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!resetToken) throw AppError.badRequest('Token invalide ou expiré');

    const passwordHash = await hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data:  {
          passwordHash,
          status:             'active',
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedAt:   null,
          lockReason: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data:  { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data:  { revokedAt: new Date(), revokeReason: 'password_change' },
      }),
    ]);
  }

  async listSessions(userId: string, currentTokenHash?: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where:   { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map(s => ({
      id:         s.id,
      deviceName: s.deviceName ?? 'Appareil inconnu',
      deviceInfo: s.deviceInfo,
      ipAddress:  s.ipAddress,
      createdAt:  s.createdAt,
      expiresAt:  s.expiresAt,
      current:    currentTokenHash ? s.tokenHash === currentTokenHash : false,
    }));
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!session) throw AppError.notFound('Session introuvable');

    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data:  { revokedAt: new Date(), revokeReason: 'manual_revoke' },
    });
  }

  async revokeAllSessions(userId: string, currentTokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, tokenHash: { not: currentTokenHash } },
      data:  { revokedAt: new Date(), revokeReason: 'revoke_all' },
    });
  }

  // ---------------------------------------------------------------------------

  private async issueTokens(userId: string, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where:  { id: userId },
      select: { email: true, role: { select: { name: true } } },
    });

    const accessToken  = signAccessToken({ sub: userId, email: user.email, role: user.role?.name ?? 'employee' });
    const refreshToken = signRefreshToken(userId);
    const tokenHash    = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt:      getRefreshTokenExpiry(),
        ipAddress:      ip ?? null,
        deviceInfo:     userAgent ? { userAgent } : {},
        deviceName:     userAgent ? userAgent.slice(0, 255) : undefined,
        lastActivityAt: new Date(),
      },
    });

    return { accessToken, refreshToken };
  }

  private generateBackupCodes(): { plain: string[]; hashed: string[] } {
    const plain  = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
    const hashed = plain.map(c => crypto.createHash('sha256').update(c).digest('hex'));
    return { plain, hashed };
  }
}

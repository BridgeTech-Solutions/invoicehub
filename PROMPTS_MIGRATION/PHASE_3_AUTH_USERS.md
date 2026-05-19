# PHASE 3 — AUTH & USERS

## Contexte

Tu migres une API Express/TypeScript vers NestJS. Les phases 1 et 2 ont posé :
- Infrastructure : PrismaModule, RedisModule, JwtAuthGuard (global), RbacGuard (global),
  ResponseInterceptor, AllExceptionsFilter, ZodValidationPipe, JobsModule, EventsGateway
- Modules simples : tax-rates, offices, roles, email-templates, notifications, guide

Cette phase migre les deux modules les plus importants : **Auth** et **Users**.
Ce sont les modules les plus complexes individuellement : Auth gère la sécurité complète
du système, Users gère les comptes et l'upload d'avatars.

Répertoire NestJS cible : `bridge-nestjs/src/`

---

## Analyse globale avant de coder

### Spécificités Auth (à ne pas rater)

| Route Express | Middleware | En NestJS |
|---|---|---|
| `POST /auth/login` | aucun | `@Public()` |
| `POST /auth/refresh` | aucun | `@Public()` |
| `POST /auth/logout` | aucun | `@Public()` (token expiré possible) |
| `POST /auth/forgot-password` | aucun | `@Public()` |
| `POST /auth/reset-password` | aucun | `@Public()` |
| `POST /auth/2fa/enable` | `authenticate` | protégé (défaut) |
| `POST /auth/2fa/verify` | `authenticate` | protégé (défaut) |
| `POST /auth/2fa/disable` | `authenticate` | protégé (défaut) |
| `POST /auth/2fa/backup-codes` | `authenticate` | protégé (défaut) |
| `GET /auth/sessions` | `authenticate` | protégé (défaut) |
| `DELETE /auth/sessions` | `authenticate` | protégé (défaut) |
| `DELETE /auth/sessions/:id` | `authenticate` | protégé (défaut) |

**Pourquoi logout est @Public()** : l'utilisateur peut vouloir se déconnecter même
si son access token est expiré. Il fournit son refresh token pour le révoquer.
Sans `@Public()`, le JwtAuthGuard bloquerait la requête avant d'atteindre le handler.

**`listSessions` utilise un header** : `X-Refresh-Token` (pas de body sur un GET).
Utiliser `@Headers('x-refresh-token')` pour le récupérer.

**Réponses custom sur 2FA** : `verifyTwoFactor` et `regenerateBackupCodes` retournent
une structure avec un champ `warning` à afficher une seule fois à l'utilisateur. Utiliser
`@SkipResponseWrapper()` pour construire la réponse manuellement.

### Spécificités Users (à ne pas rater)

| Groupe | Routes | Permission |
|---|---|---|
| Profil personnel | `/me`, `/me/password`, `/me/avatar` | aucune (tout utilisateur auth) |
| CRUD admin | `/`, `/:id`, `/:id/reactivate`, `/:id/reset-password`, `/:id/activity` | `users:manage` |

**Ordre des routes CRITIQUE** : `/me` doit être défini **avant** `/:id` dans le controller.
Si `/:id` passe en premier, NestJS interprète `"me"` comme un UUID et le service lève une 404.

**`list()` est une réponse paginée aplatie** : Express fait `res.json({ success: true, ...result })`
où `result = { data: [...], total, page, limit, totalPages }`. Avec le `ResponseInterceptor`,
retourner l'objet le nicherait sous `data`. → `@SkipResponseWrapper()` + retour manuel.

**Avatar upload** : `diskStorage` multer avec UUID comme nom de fichier.
En cas d'erreur dans le handler après l'upload → supprimer le fichier du disque.

**Logger** : remplacer le logger Express custom par le `Logger` NestJS natif.

**Injection queues** : `AuthService` injecte `emailQueue`. `UsersService` injecte
`emailQueue` + `notificationQueue`. Ces queues doivent être enregistrées dans chaque
module qui les utilise via `BullModule.registerQueue()`.

---

## MODULE 1 — Auth

### Fichiers à créer

```
src/modules/auth/
├── auth.module.ts
├── auth.service.ts
├── auth.controller.ts
└── auth.schema.ts
```

### `auth.schema.ts`

```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email:     z.string().email('Email invalide'),
  password:  z.string().min(1, 'Mot de passe requis'),
  totpToken: z.string().optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

export const resetPasswordSchema = z.object({
  token:       z.string().min(1, 'Token requis'),
  newPassword: z.string()
    .min(8, 'Le mot de passe doit faire au moins 8 caractères')
    .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
});

export const verifyTotpSchema  = z.object({ token: z.string().length(6, 'Code TOTP à 6 chiffres') });
export const disableTotpSchema = z.object({ token: z.string().length(6, 'Code TOTP à 6 chiffres') });

export type LoginInput         = z.infer<typeof loginSchema>;
export type RefreshInput       = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

### `auth.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue }       from 'bullmq';
import { ConfigService } from '@nestjs/config';
import crypto            from 'crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppError }      from '../../core/errors/app-error';
import { comparePassword, hashPassword } from '../../lib/bcrypt';
import { signAccessToken, signRefreshToken, verifyRefreshToken, getRefreshTokenExpiry } from '../../lib/jwt';
import { generateTotpSecret, getTotpUri, generateQrCode, verifyTotpToken } from '../../lib/totp';
import type { LoginInput } from './auth.schema';

export const EMAIL_QUEUE = 'email';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  // ── Login ─────────────────────────────────────────────────────────────────────

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
      throw AppError.unauthorized('Compte suspendu. Contactez l\'administrateur');
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
      const attempts  = user.failedLoginAttempts + 1;
      const company   = await this.prisma.companySettings.findFirst({ select: { maxLoginAttempts: true } });
      const maxAttempts = company?.maxLoginAttempts ?? 5;
      const shouldLock  = attempts >= maxAttempts;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lastFailedLoginAt:   new Date(),
          lockedAt:   shouldLock ? new Date()              : undefined,
          lockReason: shouldLock ? 'too_many_attempts'     : undefined,
        },
      });
      await logAttempt(false, 'bad_password');
      throw AppError.unauthorized('Email ou mot de passe incorrect');
    }

    // 2FA : vérification TOTP ou backup code
    if (user.twoFactorEnabled) {
      if (!input.totpToken) {
        throw AppError.unauthorized('Code 2FA requis', 'TOTP_REQUIRED');
      }

      const totpValid = user.twoFactorSecret && verifyTotpToken(input.totpToken, user.twoFactorSecret);

      if (!totpValid) {
        // Fallback backup code (hash SHA-256, usage unique)
        const inputHash    = crypto.createHash('sha256').update(input.totpToken.toUpperCase()).digest('hex');
        const backupIndex  = user.twoFactorBackupCodes.indexOf(inputHash);

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

    // Connexion réussie : reset compteurs anti-brute-force
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lastFailedLoginAt:   null,
        lockedAt:            null,
        lockReason:          null,
        lastLoginAt:         new Date(),
        lastActivityAt:      new Date(),
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

  // ── Refresh token ─────────────────────────────────────────────────────────────

  async refresh(refreshToken: string, ip?: string, userAgent?: string) {
    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(refreshToken) as { sub: string };
    } catch {
      throw AppError.unauthorized('Refresh token invalide ou expiré');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored    = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw AppError.unauthorized('Refresh token révoqué ou expiré');
    }

    // Vérification timeout d'inactivité
    const company        = await this.prisma.companySettings.findFirst({ select: { sessionTimeoutMinutes: true } });
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

    // Rotation : révoque l'ancien token
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
    return { ...tokens, user: { id: user.id, email: user.email, role: user.role?.name ?? 'employee' } };
  }

  // ── Logout ────────────────────────────────────────────────────────────────────

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data:  { revokedAt: new Date(), revokeReason: 'logout' },
    });
  }

  // ── 2FA ───────────────────────────────────────────────────────────────────────

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
      data:  { twoFactorEnabled: true, twoFactorEnabledAt: new Date(), twoFactorBackupCodes: hashed },
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
      data:  { twoFactorEnabled: false, twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorBackupCodes: [] },
    });
  }

  async regenerateBackupCodes(userId: string, totpToken: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw AppError.badRequest('Le 2FA n\'est pas activé sur ce compte');
    }
    if (!verifyTotpToken(totpToken, user.twoFactorSecret)) {
      throw AppError.unauthorized('Code TOTP invalide');
    }

    const { plain, hashed } = this.generateBackupCodes();
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorBackupCodes: hashed } });

    return { backupCodes: plain };
  }

  // ── Forgot / Reset password ───────────────────────────────────────────────────

  async forgotPassword(email: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return; // réponse identique pour éviter l'énumération

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

    const appUrl   = this.config.get<string>('APP_URL');
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
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!resetToken) throw AppError.badRequest('Token invalide ou expiré');

    const passwordHash = await hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data:  { passwordHash, status: 'active', mustChangePassword: false,
                 failedLoginAttempts: 0, lockedAt: null, lockReason: null },
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

  // ── Sessions ──────────────────────────────────────────────────────────────────

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

  // ── Méthodes privées ──────────────────────────────────────────────────────────

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
```

### `auth.controller.ts`

```typescript
import { Controller, Post, Get, Delete, Body, Param, Ip, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import crypto from 'crypto';
import { AuthService }         from './auth.service';
import { Public }              from '../../core/decorators/public.decorator';
import { GetUser }             from '../../core/decorators/get-user.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import type { JwtUser }        from '../../core/guards/jwt-auth.guard';
import {
  loginSchema, refreshSchema, forgotPasswordSchema,
  resetPasswordSchema, verifyTotpSchema, disableTotpSchema,
} from './auth.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Routes publiques (@Public bypass JwtAuthGuard global) ─────────────────────

  @Post('login')
  @Public()
  async login(
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const input = loginSchema.parse(body);
    return this.authService.login(input, ip, userAgent);
  }

  @Post('refresh')
  @Public()
  async refresh(
    @Body() body: unknown,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const { refreshToken } = refreshSchema.parse(body);
    return this.authService.refresh(refreshToken, ip, userAgent);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: unknown) {
    const { refreshToken } = refreshSchema.parse(body);
    await this.authService.logout(refreshToken);
    return { message: 'Déconnexion réussie' };
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: unknown, @Ip() ip: string) {
    const { email } = forgotPasswordSchema.parse(body);
    await this.authService.forgotPassword(email, ip);
    return { message: 'Si cet email existe, un lien de réinitialisation a été envoyé' };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: unknown) {
    const { token, newPassword } = resetPasswordSchema.parse(body);
    await this.authService.resetPassword(token, newPassword);
    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  // ── Routes 2FA (protégées — JwtAuthGuard actif) ───────────────────────────────

  @Post('2fa/enable')
  async enableTwoFactor(@GetUser() user: JwtUser) {
    return this.authService.enableTwoFactor(user.id);
  }

  // @SkipResponseWrapper car la réponse inclut un champ "warning" et "message" en dehors de "data"
  // que l'utilisateur doit voir clairement affiché une seule fois (jamais ré-affichable)
  @Post('2fa/verify')
  @SkipResponseWrapper()
  async verifyTwoFactor(@GetUser() user: JwtUser, @Body() body: unknown) {
    const { token } = verifyTotpSchema.parse(body);
    const result    = await this.authService.verifyAndActivateTwoFactor(user.id, token);
    return {
      success: true,
      message: '2FA activé avec succès',
      data: {
        backupCodes: result.backupCodes,
        warning:     'Sauvegardez ces codes de secours en lieu sûr. Ils ne seront plus affichés.',
      },
    };
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async disableTwoFactor(@GetUser() user: JwtUser, @Body() body: unknown) {
    const { token } = disableTotpSchema.parse(body);
    await this.authService.disableTwoFactor(user.id, token);
    return { message: '2FA désactivé' };
  }

  @Post('2fa/backup-codes')
  @SkipResponseWrapper()
  async regenerateBackupCodes(@GetUser() user: JwtUser, @Body() body: unknown) {
    const { token } = disableTotpSchema.parse(body);
    const result    = await this.authService.regenerateBackupCodes(user.id, token);
    return {
      success: true,
      data: {
        backupCodes: result.backupCodes,
        warning:     'Les anciens codes ont été invalidés. Sauvegardez ces nouveaux codes en lieu sûr.',
      },
    };
  }

  // ── Sessions (protégées) ──────────────────────────────────────────────────────

  @Get('sessions')
  async listSessions(
    @GetUser() user: JwtUser,
    @Headers('x-refresh-token') rawToken?: string,
  ) {
    // Le refresh token est transmis via header (GET n'a pas de body)
    const currentHash = rawToken
      ? crypto.createHash('sha256').update(rawToken).digest('hex')
      : undefined;
    return this.authService.listSessions(user.id, currentHash);
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  async revokeAllSessions(@GetUser() user: JwtUser, @Body() body: unknown) {
    const { refreshToken } = refreshSchema.parse(body);
    const currentHash      = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.authService.revokeAllSessions(user.id, currentHash);
    return { message: 'Toutes les autres sessions ont été révoquées' };
  }

  // ⚠️ ORDRE : DELETE 'sessions' (sans param) AVANT DELETE 'sessions/:id'
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  async revokeSession(@Param('id') sessionId: string, @GetUser() user: JwtUser) {
    await this.authService.revokeSession(sessionId, user.id);
    return { message: 'Session révoquée' };
  }
}
```

### `auth.module.ts`

```typescript
import { Module }         from '@nestjs/common';
import { BullModule }     from '@nestjs/bullmq';
import { PrismaModule }   from '../../core/prisma/prisma.module';
import { AuthService, EMAIL_QUEUE } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    PrismaModule,
    // BullModule.registerQueue est idempotent : safe même si EMAIL_QUEUE est aussi dans JobsModule
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  providers:   [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
```

---

## MODULE 2 — Users

### Fichiers à créer

```
src/modules/users/
├── users.module.ts
├── users.service.ts
├── users.controller.ts
└── users.schema.ts
```

### `users.schema.ts`

```typescript
import { z } from 'zod';

export const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  email:     z.string().email(),
  phone:     z.string().max(50).optional(),
  role:      z.enum(['admin', 'commercial', 'employee']).default('employee'),
  password:  z.string().min(8)
    .regex(/[A-Z]/, 'Doit contenir une majuscule')
    .regex(/[0-9]/, 'Doit contenir un chiffre')
    .optional(),
});

export const updateUserSchema = z.object({
  firstName:            z.string().min(1).max(100).optional(),
  lastName:             z.string().min(1).max(100).optional(),
  phone:                z.string().max(50).optional().nullable(),
  role:                 z.enum(['admin', 'commercial', 'employee']).optional(),
  status:               z.enum(['active', 'suspended', 'pending_activation']).optional(),
  language:             z.enum(['fr', 'en']).optional(),
  timezone:             z.string().optional(),
  theme:                z.enum(['light', 'dark', 'system']).optional(),
  emailNotifications:   z.boolean().optional(),
  invoiceNotifications: z.boolean().optional(),
});

export const updateMeSchema = z.object({
  firstName:            z.string().min(1).max(100).optional(),
  lastName:             z.string().min(1).max(100).optional(),
  phone:                z.string().max(50).optional().nullable(),
  language:             z.enum(['fr', 'en']).optional(),
  timezone:             z.string().optional(),
  theme:                z.enum(['light', 'dark', 'system']).optional(),
  emailNotifications:   z.boolean().optional(),
  invoiceNotifications: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8)
    .regex(/[A-Z]/, 'Doit contenir une majuscule')
    .regex(/[0-9]/, 'Doit contenir un chiffre'),
});

export const listUsersSchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(100).default(20),
  role:   z.enum(['admin', 'commercial', 'employee']).optional(),
  status: z.enum(['active', 'suspended', 'pending_activation']).optional(),
  search: z.string().optional(),
});

export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8)
    .regex(/[A-Z]/, 'Doit contenir une majuscule')
    .regex(/[0-9]/, 'Doit contenir un chiffre'),
});

export type CreateUserInput       = z.infer<typeof createUserSchema>;
export type UpdateUserInput       = z.infer<typeof updateUserSchema>;
export type UpdateMeInput         = z.infer<typeof updateMeSchema>;
export type ChangePasswordInput   = z.infer<typeof changePasswordSchema>;
export type ListUsersInput        = z.infer<typeof listUsersSchema>;
```

### `users.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue }        from '@nestjs/bullmq';
import { Queue }              from 'bullmq';
import { ConfigService }      from '@nestjs/config';
import crypto  from 'crypto';
import fs      from 'fs';
import path    from 'path';
import { PrismaService }      from '../../core/prisma/prisma.service';
import { AppError }           from '../../core/errors/app-error';
import { hashPassword, comparePassword } from '../../lib/bcrypt';
import type { CreateUserInput, UpdateUserInput, UpdateMeInput, ChangePasswordInput, ListUsersInput } from './users.schema';

export const EMAIL_QUEUE        = 'email';
export const NOTIFICATION_QUEUE = 'notification';

const USER_SELECT = {
  id:                   true,
  firstName:            true,
  lastName:             true,
  email:                true,
  phone:                true,
  roleId:               true,
  role:                 { select: { name: true } },
  status:               true,
  mustChangePassword:   true,
  twoFactorEnabled:     true,
  language:             true,
  timezone:             true,
  theme:                true,
  emailNotifications:   true,
  invoiceNotifications: true,
  avatarPath:           true,
  lastLoginAt:          true,
  createdAt:            true,
  updatedAt:            true,
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
    @InjectQueue(EMAIL_QUEUE)        private readonly emailQueue:        Queue,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly notificationQueue: Queue,
  ) {}

  // ── Liste paginée ─────────────────────────────────────────────────────────────

  async list(input: ListUsersInput) {
    const { page, limit, role, status, search } = input;
    const skip  = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status === 'suspended') {
      where['status']    = 'suspended';
      where['deletedAt'] = { not: null };
    } else {
      where['deletedAt'] = null;
      if (status) where['status'] = status;
    }
    if (role)   where['role']   = { is: { name: role } };
    if (search) where['OR'] = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName:  { contains: search, mode: 'insensitive' } },
      { email:     { contains: search, mode: 'insensitive' } },
    ];

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

    return { data: users.map(u => this.formatUser(u)), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: USER_SELECT });
    if (!user) throw AppError.notFound('Utilisateur introuvable');
    return this.formatUser(user);
  }

  async create(input: CreateUserInput, createdById: string) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw AppError.conflict('Un utilisateur avec cet email existe déjà');

    const tempPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = input.password
      ? await hashPassword(input.password)
      : await hashPassword(tempPassword);

    const user = await this.prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName:  input.lastName,
        email:     input.email,
        phone:     input.phone,
        role:      { connect: { name: input.role } },
        passwordHash,
        status:          'pending_activation' as any,
        mustChangePassword: true,
        createdBy: createdById ? { connect: { id: createdById } } : undefined,
      } as any,
      select: USER_SELECT,
    });

    const roleName = (user.role as any)?.name ?? input.role;
    this.logger.log(`Utilisateur créé : ${user.email} (${roleName}) par ${createdById}`);

    // Token d'activation (24h)
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const appUrl        = this.config.get<string>('APP_URL');
    const activationUrl = `${appUrl}/reset-password?token=${rawToken}`;

    void this.emailQueue.add('email', {
      to:      user.email,
      subject: 'Bienvenue sur InvoiceHub — Activez votre compte',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
          <h2 style="color:#0f2d4a">Bienvenue sur InvoiceHub</h2>
          <p>Bonjour <strong>${user.firstName} ${user.lastName}</strong>,</p>
          <p>Votre compte a été créé sur InvoiceHub. Activez-le en choisissant votre mot de passe.</p>
          <p style="margin:24px 0">
            <a href="${activationUrl}" style="display:inline-block;padding:12px 24px;background:#2D7DD2;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
              Activer mon compte
            </a>
          </p>
          <p style="font-size:13px;color:#718096">Ce lien est valable pendant 24 heures.</p>
        </div>
      `,
    });

    // Notifier les autres admins (fire & forget)
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

    return this.formatUser(user);
  }

  async update(id: string, input: UpdateUserInput) {
    const oldUser = await this.findById(id);

    // Changement de rôle → révoquer toutes les sessions (permissions changées)
    if (input.role && input.role !== oldUser.roleName) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data:  { revokedAt: new Date(), revokeReason: 'role_changed' },
      });
      this.logger.log(`Tokens révoqués pour ${oldUser.email} : changement de rôle ${oldUser.roleName} → ${input.role}`);
    }

    // Suspension → révoquer toutes les sessions
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
    return this.formatUser(user);
  }

  async updateMe(userId: string, input: UpdateMeInput) {
    const user = await this.prisma.user.update({
      where:  { id: userId },
      data:   input,
      select: USER_SELECT,
    });
    return this.formatUser(user);
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

  async adminResetPassword(id: string, newPassword: string): Promise<void> {
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
    if (user?.avatarPath && fs.existsSync(user.avatarPath)) {
      fs.unlinkSync(user.avatarPath);
    }
    await this.prisma.user.update({ where: { id: userId }, data: { avatarPath: filePath } });
  }

  async deleteAvatar(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });
    if (user?.avatarPath && fs.existsSync(user.avatarPath)) {
      fs.unlinkSync(user.avatarPath);
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

  // ── Helpers privés ────────────────────────────────────────────────────────────

  private toAvatarUrl(avatarPath: string | null): string | null {
    if (!avatarPath) return null;
    const backendUrl = this.config.get<string>('BACKEND_URL');
    const rel = path.isAbsolute(avatarPath)
      ? path.relative(process.cwd(), avatarPath).replace(/\\/g, '/')
      : avatarPath.replace(/\\/g, '/');
    return `${backendUrl}/${rel}`;
  }

  private formatUser(user: any) {
    const { avatarPath, role, ...rest } = user;
    return {
      ...rest,
      roleName:  role?.name ?? 'employee',
      avatarUrl: this.toAvatarUrl(avatarPath as string | null),
    };
  }
}
```

### `users.controller.ts`

```typescript
import {
  Controller, Get, Post, Put, Delete, Param, Body, Query,
  UseInterceptors, UploadedFile, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage }     from 'multer';
import { v4 as uuidv4 }   from 'uuid';
import path                from 'path';
import fs                  from 'fs';
import { UsersService }    from './users.service';
import { Permission }      from '../../core/decorators/permission.decorator';
import { GetUser }         from '../../core/decorators/get-user.decorator';
import { SkipResponseWrapper } from '../../core/decorators/skip-response-wrapper.decorator';
import type { JwtUser }    from '../../core/guards/jwt-auth.guard';
import {
  createUserSchema, updateUserSchema, updateMeSchema,
  changePasswordSchema, listUsersSchema, adminResetPasswordSchema,
} from './users.schema';

// Dossier avatars créé au démarrage du module
const AVATAR_DIR = path.resolve(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarMulterOptions = {
  storage: diskStorage({
    destination: (_req: any, _file: any, cb: Function) => cb(null, AVATAR_DIR),
    filename:    (_req: any, file: Express.Multer.File, cb: Function) =>
      cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  }),
  limits:     { fileSize: 2 * 1024 * 1024 },  // 2 Mo
  fileFilter: (_req: any, file: Express.Multer.File, cb: Function) => {
    ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Format non accepté. Utilisez PNG, JPEG ou WebP.'));
  },
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── /me routes (AVANT /:id — sinon "me" est interprété comme un UUID) ─────────

  @Get('me')
  async me(@GetUser() user: JwtUser) {
    return this.usersService.findById(user.id);
  }

  @Put('me')
  async updateMe(@GetUser() user: JwtUser, @Body() body: unknown) {
    return this.usersService.updateMe(user.id, updateMeSchema.parse(body));
  }

  @Put('me/password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@GetUser() user: JwtUser, @Body() body: unknown) {
    await this.usersService.changePassword(user.id, changePasswordSchema.parse(body));
    return { message: 'Mot de passe modifié avec succès' };
  }

  @Put('me/avatar')
  @UseInterceptors(FileInterceptor('file', avatarMulterOptions))
  async uploadAvatar(
    @GetUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier reçu');
    try {
      await this.usersService.uploadAvatar(user.id, file.path);
      return null;
    } catch (err) {
      // Cleanup : supprimer le fichier uploadé si la mise en base échoue
      fs.unlink(file.path, () => {});
      throw err;
    }
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.OK)
  async deleteAvatar(@GetUser() user: JwtUser) {
    await this.usersService.deleteAvatar(user.id);
    return { message: 'Avatar supprimé' };
  }

  // ── CRUD admin (users:manage) — routes /:id APRÈS /me ─────────────────────────

  // @SkipResponseWrapper car la réponse est une pagination aplatie à la racine :
  // { success: true, data: [...], total, page, limit, totalPages }
  // Le ResponseInterceptor l'emboîterait sous "data" → structure incorrecte
  @Get()
  @SkipResponseWrapper()
  @Permission('users:manage')
  async list(@Query() query: unknown) {
    const parsed = listUsersSchema.parse(query);
    const result = await this.usersService.list(parsed);
    return { success: true, ...result };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permission('users:manage')
  async create(@Body() body: unknown, @GetUser() user: JwtUser) {
    return this.usersService.create(createUserSchema.parse(body), user.id);
  }

  @Get(':id')
  @Permission('users:manage')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Put(':id')
  @Permission('users:manage')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.usersService.update(id, updateUserSchema.parse(body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Permission('users:manage')
  async remove(@Param('id') id: string) {
    await this.usersService.softDelete(id);
    return { message: 'Utilisateur archivé' };
  }

  @Post(':id/reactivate')
  @Permission('users:manage')
  async reactivate(@Param('id') id: string) {
    await this.usersService.reactivate(id);
    return { message: 'Utilisateur réactivé' };
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Permission('users:manage')
  async resetPassword(@Param('id') id: string, @Body() body: unknown) {
    const { newPassword } = adminResetPasswordSchema.parse(body);
    await this.usersService.adminResetPassword(id, newPassword);
    return { message: "Mot de passe réinitialisé — l'utilisateur devra le changer à sa prochaine connexion" };
  }

  @Get(':id/activity')
  @Permission('users:manage')
  getActivity(@Param('id') id: string) {
    return this.usersService.getActivity(id);
  }
}
```

### `users.module.ts`

```typescript
import { Module }          from '@nestjs/common';
import { BullModule }      from '@nestjs/bullmq';
import { MulterModule }    from '@nestjs/platform-express';
import { PrismaModule }    from '../../core/prisma/prisma.module';
import { UsersService, EMAIL_QUEUE, NOTIFICATION_QUEUE } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [
    PrismaModule,
    MulterModule,
    BullModule.registerQueue(
      { name: EMAIL_QUEUE },
      { name: NOTIFICATION_QUEUE },
    ),
  ],
  providers:   [UsersService],
  controllers: [UsersController],
  exports:     [UsersService],  // exporté pour usage futur (Phase 4 : invoices envoient des notifications)
})
export class UsersModule {}
```

---

## Mise à jour AppModule

```typescript
// src/app.module.ts — ajouter dans imports[]
import { AuthModule }  from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    // Infrastructure (Phase 1)
    ConfigModule.forRoot({ isGlobal: true, validate: cfg => envSchema.parse(cfg) }),
    ScheduleModule.forRoot(),
    PrismaModule, RedisModule, EventsModule, JobsModule, HealthModule,
    // Modules simples (Phase 2)
    TaxRatesModule, OfficesModule, RolesModule,
    EmailTemplatesModule, NotificationsModule, GuideModule,
    // Auth & Users (Phase 3)
    AuthModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_GUARD,       useClass: JwtAuthGuard },
    { provide: APP_GUARD,       useClass: RbacGuard },
    { provide: APP_FILTER,      useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_PIPE,        useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
```

---

## Vérifications post-migration

### 1. Trust proxy dans main.ts (important pour `@Ip()`)

```typescript
// src/main.ts — ajouter avant app.listen()
app.getHttpAdapter().getInstance().set('trust proxy', 1);
// → req.ip retourne l'IP réelle derrière nginx/cloudflare
```

### 2. Servir les fichiers statiques (avatars + vidéos)

```typescript
// src/main.ts — ajouter après NestFactory.create
import { NestExpressApplication } from '@nestjs/platform-express';
import path from 'path';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.useStaticAssets(path.resolve(process.cwd(), 'uploads'), { prefix: '/uploads' });
// → GET /uploads/avatars/{uuid}.jpg et /uploads/videos/{section}.mp4 fonctionnent
```

### 3. Variables d'environnement requises

```
APP_URL=http://localhost:3001        # frontend URL (liens activation/reset)
BACKEND_URL=http://localhost:3000    # backend URL (construction URL avatar)
```

Vérifier que `envSchema` dans `config/env.config.ts` valide bien ces deux variables.

### 4. Packages requis

```bash
pnpm add uuid
pnpm add -D @types/uuid @types/multer
```

---

## Récapitulatif des pièges par module

| Module | Piège | Solution |
|---|---|---|
| Auth | logout/refresh bloqués si token expiré | `@Public()` sur ces routes |
| Auth | `listSessions` sans body sur GET | `@Headers('x-refresh-token')` |
| Auth | Réponse backup codes avec `warning` | `@SkipResponseWrapper()` + retour manuel |
| Auth | `DELETE sessions` vs `DELETE sessions/:id` | Définir sans param avant avec param |
| Users | `/me` interprété comme UUID | Définir toutes routes `/me` avant `/:id` |
| Users | Pagination `list()` aplatie | `@SkipResponseWrapper()` + spread manuel |
| Users | Fichier avatar orphelin en cas d'erreur DB | try/catch + `fs.unlink(file.path)` |
| Users | `toAvatarUrl` utilise `env.BACKEND_URL` | Injecter `ConfigService` dans UsersService |
| Users | Logger Express custom → NestJS `Logger` | `new Logger(UsersService.name)` |
| Both | BullQueue non reconnu | `BullModule.registerQueue()` dans chaque module qui injecte |

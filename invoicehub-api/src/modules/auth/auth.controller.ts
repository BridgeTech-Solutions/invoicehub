import * as crypto from 'crypto';
import {
  Controller, Post, Get, Delete, Body, Param,
  Ip, Headers, HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyTotpSchema,
  disableTotpSchema,
} from './auth.schema';
import type {
  LoginInput,
  RefreshInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyTotpInput,
  DisableTotpInput,
} from './auth.schema';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  // ── Routes publiques ──────────────────────────────────────────────────────

  @Post('login')
  @Public()
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.svc.login(body, ip, userAgent);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.svc.refresh(body.refreshToken, ip, userAgent);
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    await this.svc.logout(body.refreshToken);
    return { success: true, message: 'Déconnexion réussie' };
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(200)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Ip() ip: string,
  ) {
    await this.svc.forgotPassword(body.email, ip);
    return { success: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé' };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(200)
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    await this.svc.resetPassword(body.token, body.newPassword);
    return { success: true, message: 'Mot de passe réinitialisé avec succès' };
  }

  // ── Routes protégées — 2FA ────────────────────────────────────────────────

  @Post('2fa/enable')
  enable2fa(@CurrentUser() user: JwtPayload) {
    return this.svc.enableTwoFactor(user.sub);
  }

  @Post('2fa/verify')
  async verify2fa(
    @Body(new ZodValidationPipe(verifyTotpSchema)) body: VerifyTotpInput,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.svc.verifyAndActivateTwoFactor(user.sub, body.token);
    return {
      success: true,
      message: '2FA activé avec succès',
      data: {
        backupCodes: result.backupCodes,
        warning: 'Sauvegardez ces codes de secours en lieu sûr. Ils ne seront plus affichés.',
      },
    };
  }

  @Post('2fa/disable')
  async disable2fa(
    @Body(new ZodValidationPipe(disableTotpSchema)) body: DisableTotpInput,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.svc.disableTwoFactor(user.sub, body.token);
    return { success: true, message: '2FA désactivé' };
  }

  @Post('2fa/backup-codes')
  async regenerateBackupCodes(
    @Body(new ZodValidationPipe(disableTotpSchema)) body: DisableTotpInput,
    @CurrentUser() user: JwtPayload,
  ) {
    const result = await this.svc.regenerateBackupCodes(user.sub, body.token);
    return {
      success: true,
      data: {
        backupCodes: result.backupCodes,
        warning: 'Les anciens codes ont été invalidés. Sauvegardez ces nouveaux codes en lieu sûr.',
      },
    };
  }

  // ── Routes protégées — Sessions ───────────────────────────────────────────

  @Get('sessions')
  async listSessions(
    @CurrentUser() user: JwtPayload,
    @Headers('x-refresh-token') rawToken?: string,
  ) {
    const currentHash = rawToken
      ? crypto.createHash('sha256').update(rawToken).digest('hex')
      : undefined;
    return this.svc.listSessions(user.sub, currentHash);
  }

  @Delete('sessions')
  async revokeAllSessions(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @CurrentUser() user: JwtPayload,
  ) {
    const currentHash = crypto.createHash('sha256').update(body.refreshToken).digest('hex');
    await this.svc.revokeAllSessions(user.sub, currentHash);
    return { success: true, message: 'Toutes les autres sessions ont été révoquées' };
  }

  @Delete('sessions/:id')
  async revokeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.svc.revokeSession(sessionId, user.sub);
    return { success: true, message: 'Session révoquée' };
  }
}

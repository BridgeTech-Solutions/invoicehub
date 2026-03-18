import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from './auth.service';
import {
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyTotpSchema,
  disableTotpSchema,
} from './auth.schema';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = loginSchema.parse(req.body);
      const ip = req.ip ?? undefined;
      const userAgent = req.get('user-agent') ?? undefined;
      const result = await authService.login(input, ip, userAgent);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      const ip = req.ip ?? undefined;
      const userAgent = req.get('user-agent') ?? undefined;
      const result = await authService.refresh(refreshToken, ip, userAgent);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      await authService.logout(refreshToken);
      res.json({ success: true, message: 'Déconnexion réussie' });
    } catch (err) {
      next(err);
    }
  }

  async enableTwoFactor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.enableTwoFactor(req.user!.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async verifyTwoFactor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, secret } = verifyTotpSchema.parse(req.body);
      const result = await authService.verifyAndActivateTwoFactor(req.user!.id, token, secret);
      res.json({
        success: true,
        message: '2FA activé avec succès',
        data: {
          backupCodes: result.backupCodes,
          warning: 'Sauvegardez ces codes de secours en lieu sûr. Ils ne seront plus affichés.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async regenerateBackupCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = disableTotpSchema.parse(req.body); // même schéma : { token: string }
      const result = await authService.regenerateBackupCodes(req.user!.id, token);
      res.json({
        success: true,
        data: {
          backupCodes: result.backupCodes,
          warning: 'Les anciens codes ont été invalidés. Sauvegardez ces nouveaux codes en lieu sûr.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async disableTwoFactor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = disableTotpSchema.parse(req.body);
      await authService.disableTwoFactor(req.user!.id, token);
      res.json({ success: true, message: '2FA désactivé' });
    } catch (err) {
      next(err);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      await authService.forgotPassword(email, req.ip ?? undefined);
      res.json({ success: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé' });
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(req.body);
      await authService.resetPassword(token, newPassword);
      res.json({ success: true, message: 'Mot de passe réinitialisé avec succès' });
    } catch (err) {
      next(err);
    }
  }

  async listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Extraire le hash du refresh token courant depuis le body si fourni
      const body = z.object({ refreshToken: z.string().optional() }).safeParse(req.body);
      const currentHash = body.success && body.data.refreshToken
        ? crypto.createHash('sha256').update(body.data.refreshToken).digest('hex')
        : undefined;
      const data = await authService.listSessions(req.user!.id, currentHash);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.revokeSession(req.params['id']!, req.user!.id);
      res.json({ success: true, message: 'Session révoquée' });
    } catch (err) {
      next(err);
    }
  }

  async revokeAllSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      const currentHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await authService.revokeAllSessions(req.user!.id, currentHash);
      res.json({ success: true, message: 'Toutes les autres sessions ont été révoquées' });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();

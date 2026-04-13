/**
 * @module modules/auth/auth.service
 * Logique métier d'authentification et de sécurité des comptes.
 *
 * Responsabilités :
 *  - Authentification email + mot de passe avec protection anti-brute-force
 *  - Gestion du 2FA TOTP (génération, activation, désactivation)
 *  - Codes de secours 2FA (backup codes) — fallback si l'appareil TOTP est perdu
 *  - Émission et rotation des tokens JWT (access + refresh)
 *  - Réinitialisation sécurisée du mot de passe par email
 *
 * Sécurité :
 *  - Les tokens de réinitialisation et refresh tokens sont stockés sous forme
 *    de hash SHA-256 (jamais en clair en base de données)
 *  - Les backup codes sont stockés sous forme de hash SHA-256 (usage unique)
 *  - La réponse à "forgot password" est identique que l'email existe ou non
 *    (évite l'énumération d'utilisateurs)
 *  - Le compte est verrouillé après N tentatives échouées (configurable)
 */
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { comparePassword, hashPassword } from '../../lib/bcrypt';
import { signAccessToken, signRefreshToken, verifyRefreshToken, getRefreshTokenExpiry } from '../../lib/jwt';
import { generateTotpSecret, getTotpUri, generateQrCode, verifyTotpToken } from '../../lib/totp';
import { emailQueue } from '../../jobs/queues';
import { AppError } from '../../core/errors/AppError';
import { env } from '../../config/env';
import type { LoginInput } from './auth.schema';

export class AuthService {
  /**
   * Authentifie un utilisateur par email + mot de passe (et TOTP si activé).
   *
   * Flux de sécurité :
   * 1. Vérifie l'existence et le statut du compte
   * 2. Contrôle le verrouillage anti-brute-force
   * 3. Compare le mot de passe (bcrypt)
   * 4. Vérifie le code TOTP si le 2FA est activé (ou un backup code en fallback)
   * 5. Réinitialise les compteurs d'échec et émet les tokens
   *
   * @param input     - Email, mot de passe et code TOTP optionnel
   * @param ip        - Adresse IP du client (loggée dans login_history)
   * @param userAgent - User-Agent du client (loggé dans login_history)
   * @returns Access token, refresh token et données publiques de l'utilisateur
   * @throws `401` - Identifiants invalides, compte suspendu/verrouillé, TOTP incorrect
   * @throws `401 TOTP_REQUIRED` - Code 2FA attendu mais non fourni
   */
  async login(input: LoginInput, ip?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });

    /** Enregistre la tentative de connexion (succès ou échec) dans login_history */
    const logAttempt = async (success: boolean, failureReason?: string) => {
      await prisma.loginHistory.create({
        data: {
          userId: user?.id ?? null,
          email: input.email,
          ipAddress: ip ?? null,
          userAgent: userAgent ?? null,
          success,
          failureReason: failureReason ?? null,
        },
      });
    };

    if (!user || user.deletedAt) {
      await logAttempt(false, 'user_not_found');
      // Message générique — ne pas révéler si l'email existe ou non
      throw AppError.unauthorized('Email ou mot de passe incorrect');
    }

    if (user.status === 'suspended') {
      await logAttempt(false, 'account_suspended');
      throw AppError.unauthorized('Compte suspendu. Contactez l\'administrateur');
    }

    if (user.lockedAt) {
      await logAttempt(false, 'account_locked');
      throw AppError.unauthorized('Compte verrouillé suite à trop de tentatives. Réinitialisez votre mot de passe');
    }

    const passwordValid = await comparePassword(input.password, user.passwordHash);
    if (!passwordValid) {
      const attempts = user.failedLoginAttempts + 1;
      const company = await prisma.companySettings.findFirst({ select: { maxLoginAttempts: true } });
      const maxAttempts = company?.maxLoginAttempts ?? 5;
      const shouldLock = attempts >= maxAttempts;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lastFailedLoginAt: new Date(),
          lockedAt: shouldLock ? new Date() : undefined,
          lockReason: shouldLock ? 'too_many_attempts' : undefined,
        },
      });

      await logAttempt(false, 'bad_password');
      throw AppError.unauthorized('Email ou mot de passe incorrect');
    }

    // Vérification du code TOTP si le 2FA est activé sur ce compte
    if (user.twoFactorEnabled) {
      if (!input.totpToken) {
        // Code spécial : le frontend doit afficher le champ de saisie TOTP
        throw AppError.unauthorized('Code 2FA requis', 'TOTP_REQUIRED');
      }

      const totpValid = user.twoFactorSecret && verifyTotpToken(input.totpToken, user.twoFactorSecret);

      if (!totpValid) {
        // Fallback : vérification du backup code (hash SHA-256 de la saisie en majuscules)
        const inputHash = crypto.createHash('sha256').update(input.totpToken.toUpperCase()).digest('hex');
        const backupIndex = user.twoFactorBackupCodes.indexOf(inputHash);

        if (backupIndex === -1) {
          await logAttempt(false, 'bad_totp');
          throw AppError.unauthorized('Code 2FA invalide');
        }

        // Backup code valide : le consommer (usage unique)
        const newCodes = [...user.twoFactorBackupCodes];
        newCodes.splice(backupIndex, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: newCodes },
        });
      }
    }

    // Connexion réussie : réinitialise les compteurs anti-brute-force
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        lockedAt: null,
        lockReason: null,
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
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    };
  }

  /**
   * Échange un refresh token valide contre de nouveaux access + refresh tokens.
   * Implémente la **rotation** des refresh tokens : l'ancien est révoqué à chaque
   * appel, ce qui permet de détecter les réutilisations (vol de token).
   *
   * @param refreshToken - Token brut reçu du client
   * @param ip           - IP pour le nouveau token (audit)
   * @param userAgent    - User-Agent pour le nouveau token (audit)
   * @returns Nouveaux tokens et données minimales de l'utilisateur
   * @throws `401` - Token invalide, expiré, révoqué ou utilisateur inactif
   */
  async refresh(refreshToken: string, ip?: string, userAgent?: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized('Refresh token invalide ou expiré');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw AppError.unauthorized('Refresh token révoqué ou expiré');
    }

    // Vérification du timeout d'inactivité (sessionTimeoutMinutes depuis company_settings)
    const company = await prisma.companySettings.findFirst({
      select: { sessionTimeoutMinutes: true },
    });
    const timeoutMinutes = company?.sessionTimeoutMinutes ?? 0;
    if (timeoutMinutes > 0) {
      const idleMs = Date.now() - stored.lastActivityAt.getTime();
      if (idleMs > timeoutMinutes * 60 * 1000) {
        // Révoquer le token silencieusement avant de rejeter
        await prisma.refreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: new Date(), revokeReason: 'session_timeout' },
        });
        throw AppError.unauthorized('Session expirée pour inactivité', 'SESSION_TIMEOUT');
      }
    }

    // Rotation : l'ancien token est révoqué avant d'en émettre un nouveau
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), revokeReason: 'rotation' },
    });

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'active' },
    });

    if (!user) {
      throw AppError.unauthorized('Utilisateur introuvable ou inactif');
    }

    const tokens = await this.issueTokens(user.id, ip, userAgent);

    return {
      ...tokens,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /**
   * Révoque le refresh token fourni (déconnexion).
   * Si le token est déjà révoqué ou inconnu, l'opération est silencieuse.
   *
   * @param refreshToken - Token brut à révoquer
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'logout' },
    });
  }

  /**
   * Première étape du 2FA : génère un secret TOTP et retourne le QR code
   * à afficher à l'utilisateur pour qu'il scanne avec son application authenticator.
   *
   * Le secret est stocké temporairement en base mais le 2FA n'est pas encore actif
   * (`two_factor_enabled = false`) — il faut appeler `verifyAndActivateTwoFactor()`
   * avec un code valide pour confirmer l'enrôlement.
   *
   * @param userId - UUID de l'utilisateur connecté
   * @returns Secret TOTP (base32) et QR code en data URL (image/png base64)
   */
  async enableTwoFactor(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = generateTotpSecret();
    const uri = getTotpUri(user.email, secret);
    const qrCode = await generateQrCode(uri);

    // Stocke le secret en attente de confirmation — non encore activé
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    });

    return { secret, qrCode };
  }

  /**
   * Deuxième étape du 2FA : valide le code TOTP pour confirmer l'enrôlement,
   * active définitivement le 2FA et génère les **codes de secours** (backup codes).
   *
   * Les backup codes sont affichés **une seule fois** — l'utilisateur doit les
   * sauvegarder. En base, seuls les hash SHA-256 sont stockés.
   *
   * @param userId - UUID de l'utilisateur
   * @param token  - Code à 6 chiffres généré par l'application authenticator
   * @param secret - Secret TOTP reçu lors de `enableTwoFactor()`
   * @returns Les 8 backup codes en clair (à afficher une seule fois)
   * @throws `400` - Code TOTP invalide
   */
  async verifyAndActivateTwoFactor(userId: string, token: string): Promise<{ backupCodes: string[] }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret || !verifyTotpToken(token, user.twoFactorSecret)) {
      throw AppError.badRequest('Code TOTP invalide');
    }

    const { plain, hashed } = this.generateBackupCodes();

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
        twoFactorBackupCodes: hashed,
      },
    });

    return { backupCodes: plain };
  }

  /**
   * Désactive le 2FA après vérification d'un code TOTP valide.
   * Exige le code pour éviter qu'un attaquant ayant volé la session puisse désactiver le 2FA.
   * Efface également tous les backup codes.
   *
   * @param userId - UUID de l'utilisateur
   * @param token  - Code TOTP actuel (preuve de possession de l'appareil)
   * @throws `400` - Code TOTP invalide
   */
  async disableTwoFactor(userId: string, token: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.twoFactorSecret || !verifyTotpToken(token, user.twoFactorSecret)) {
      throw AppError.badRequest('Code TOTP invalide');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorEnabledAt: null,
        twoFactorBackupCodes: [],
      },
    });
  }

  /**
   * Régénère les backup codes 2FA après vérification d'un code TOTP valide.
   * Les anciens codes sont immédiatement invalidés.
   *
   * À utiliser lorsque l'utilisateur a perdu ses backup codes ou souhaite
   * en générer de nouveaux pour des raisons de sécurité.
   *
   * @param userId    - UUID de l'utilisateur connecté
   * @param totpToken - Code TOTP actuel (preuve de possession de l'appareil)
   * @returns Les 8 nouveaux backup codes en clair (affichés une seule fois)
   * @throws `400` - 2FA non activé, ou code TOTP invalide
   */
  async regenerateBackupCodes(userId: string, totpToken: string): Promise<{ backupCodes: string[] }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw AppError.badRequest('Le 2FA n\'est pas activé sur ce compte');
    }

    if (!verifyTotpToken(totpToken, user.twoFactorSecret)) {
      throw AppError.unauthorized('Code TOTP invalide');
    }

    const { plain, hashed } = this.generateBackupCodes();

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: hashed },
    });

    return { backupCodes: plain };
  }

  /**
   * Initie une réinitialisation de mot de passe par email.
   *
   * Génère un token aléatoire de 32 octets (256 bits), stocke son hash SHA-256
   * en base avec une expiration d'1 heure, puis envoie le lien par email.
   *
   * La réponse HTTP est identique que l'email existe ou non pour éviter
   * l'énumération des comptes (timing attack mitigation).
   *
   * @param email - Adresse email soumise par l'utilisateur
   * @param ip    - IP de la demande (loggée pour audit de sécurité)
   */
  async forgotPassword(email: string, ip?: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });

    // Ne pas révéler si l'email existe dans le système
    if (!user || user.deletedAt) return;

    // Invalider les tokens de reset précédents encore actifs
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = crypto.randomBytes(32).toString('hex'); // 256 bits d'entropie
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 heure

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: ip ?? null,
      },
    });

    // Le token brut est envoyé dans le lien — seul le hash est stocké en base
    const resetUrl = `${env.APP_URL}/reset-password?token=${rawToken}`;

    await emailQueue.add('email', {
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe — InvoiceHub BTS',
      html: `
        <p>Bonjour ${user.firstName},</p>
        <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe (valable 1 heure) :</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      `,
    });
  }

  /**
   * Réinitialise le mot de passe à partir d'un token valide.
   *
   * Dans une transaction atomique :
   * 1. Vérifie que le token est valide, non utilisé et non expiré
   * 2. Met à jour le mot de passe (bcrypt)
   * 3. Marque le token comme utilisé (usage unique)
   * 4. Révoque tous les refresh tokens actifs (force la reconnexion)
   *
   * @param token       - Token brut extrait de l'URL du lien email
   * @param newPassword - Nouveau mot de passe en clair (sera hashé)
   * @throws `400` - Token invalide, déjà utilisé ou expiré
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!resetToken) {
      throw AppError.badRequest('Token invalide ou expiré');
    }

    const passwordHash = await hashPassword(newPassword);

    // Transaction : le mot de passe, le token et les sessions sont mis à jour atomiquement
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedAt: null,
          lockReason: null,
        },
      }),
      // Marquer le token comme utilisé (usage unique)
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Révoquer toutes les sessions actives (force la reconnexion)
      prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'password_change' },
      }),
    ]);
  }

  /** Liste les sessions actives (refresh tokens non révoqués, non expirés) */
  async listSessions(userId: string, currentTokenHash?: string) {
    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map(s => ({
      id: s.id,
      deviceName: s.deviceName ?? 'Appareil inconnu',
      deviceInfo: s.deviceInfo,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: currentTokenHash ? s.tokenHash === currentTokenHash : false,
    }));
  }

  /** Révoque une session spécifique (appartenant à l'utilisateur) */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await prisma.refreshToken.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!session) throw AppError.notFound('Session introuvable');

    await prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokeReason: 'manual_revoke' },
    });
  }

  /** Révoque toutes les sessions sauf la courante */
  async revokeAllSessions(userId: string, currentTokenHash: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        tokenHash: { not: currentTokenHash },
      },
      data: { revokedAt: new Date(), revokeReason: 'revoke_all' },
    });
  }

  // ---------------------------------------------------------------------------
  // Méthodes privées
  // ---------------------------------------------------------------------------

  /**
   * Émet une paire access + refresh tokens et persiste le refresh token en base.
   * Le refresh token est stocké sous forme de hash SHA-256 pour éviter
   * toute exploitation en cas de compromission de la base.
   *
   * @param userId    - UUID de l'utilisateur
   * @param ip        - IP pour l'audit
   * @param userAgent - User-Agent pour l'audit
   * @returns Les deux tokens bruts à transmettre au client
   */
  private async issueTokens(userId: string, ip?: string, userAgent?: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, role: true },
    });

    const accessToken  = signAccessToken({ sub: userId, email: user.email, role: user.role });
    const refreshToken = signRefreshToken(userId);
    const tokenHash    = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: getRefreshTokenExpiry(),
        ipAddress: ip ?? null,
        deviceInfo: userAgent ? { userAgent } : {},
        deviceName: userAgent ? userAgent.slice(0, 255) : undefined,
        lastActivityAt: new Date(),
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Génère 8 codes de secours aléatoires (4 octets = 8 caractères hexadécimaux chacun).
   * Retourne les codes en clair (à montrer une fois à l'utilisateur) et leurs hash SHA-256
   * (à stocker en base de données).
   *
   * Entropie par code : 4 octets = 32 bits ≈ 4 milliards de combinaisons.
   */
  private generateBackupCodes(): { plain: string[]; hashed: string[] } {
    const plain = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    const hashed = plain.map(c =>
      crypto.createHash('sha256').update(c).digest('hex')
    );
    return { plain, hashed };
  }
}

export const authService = new AuthService();

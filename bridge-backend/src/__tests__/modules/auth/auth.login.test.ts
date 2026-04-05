/**
 * Tests unitaires — AuthService.login
 *
 * Couvre : login correct, mauvais MDP, brute-force, 2FA TOTP,
 * backup codes, compte suspendu/verrouillé.
 * Toutes les dépendances externes (Prisma, queues, bcrypt) sont mockées.
 */

// ── Mocks (déclarés avant les imports) ───────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    loginHistory: { create: jest.fn() },
    companySettings: { findFirst: jest.fn() },
    refreshToken: { create: jest.fn(), deleteMany: jest.fn() },
  },
}));

jest.mock('../../../jobs/queues', () => ({
  emailQueue: { add: jest.fn() },
  notificationQueue: { add: jest.fn() },
}));

jest.mock('../../../lib/bcrypt', () => ({
  comparePassword: jest.fn(),
  hashPassword: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { AuthService } from '../../../modules/auth/auth.service';
import { prisma } from '../../../config/database';
import { comparePassword } from '../../../lib/bcrypt';
import { generateTotpSecret, verifyTotpToken } from '../../../lib/totp';
import { authenticator } from 'otplib';

const authService = new AuthService();

const mockFindUnique    = prisma.user.findUnique as jest.Mock;
const mockFindUniqueOrThrow = prisma.user.findUniqueOrThrow as jest.Mock;
const mockUpdate        = prisma.user.update as jest.Mock;
const mockLogHistory    = prisma.loginHistory.create as jest.Mock;
const mockCompany       = prisma.companySettings.findFirst as jest.Mock;
const mockCompare       = comparePassword as jest.Mock;
const mockRefreshCreate = prisma.refreshToken.create as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_USER = {
  id: 'user-id-abc',
  email: 'admin@bts.cm',
  passwordHash: '$2b$12$hashed',
  role: 'admin',
  firstName: 'Admin',
  lastName: 'BTS',
  status: 'active',
  deletedAt: null,
  lockedAt: null,
  failedLoginAttempts: 0,
  lastFailedLoginAt: null,
  mustChangePassword: false,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  twoFactorBackupCodes: [],
};

function setupSuccessfulLogin(overrides: any = {}) {
  const user = { ...BASE_USER, ...overrides };
  mockFindUnique.mockResolvedValue(user);
  mockFindUniqueOrThrow.mockResolvedValue({ email: user.email, role: user.role });
  mockCompare.mockResolvedValue(true);
  mockCompany.mockResolvedValue({ maxLoginAttempts: 5, sessionTimeoutMinutes: 0 });
  mockUpdate.mockResolvedValue(user);
  mockLogHistory.mockResolvedValue({});
  mockRefreshCreate.mockResolvedValue({ id: 'rt-id', tokenHash: 'hash', expiresAt: new Date() });
  return user;
}

// ── Tests : login correct ─────────────────────────────────────────────────────

describe('AuthService.login — succès', () => {
  it('retourne accessToken + refreshToken + données user', async () => {
    setupSuccessfulLogin();
    const result = await authService.login(
      { email: 'admin@bts.cm', password: 'MotDePasse!123' },
      '127.0.0.1', 'Jest',
    );
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.email).toBe('admin@bts.cm');
    expect(result.user.role).toBe('admin');
  });

  it('réinitialise les compteurs après connexion réussie', async () => {
    setupSuccessfulLogin({ failedLoginAttempts: 3 });
    await authService.login({ email: 'admin@bts.cm', password: 'correct' }, '127.0.0.1', 'Jest');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 0, lockedAt: null }),
      }),
    );
  });

  it('enregistre la tentative comme succès dans loginHistory', async () => {
    setupSuccessfulLogin();
    await authService.login({ email: 'admin@bts.cm', password: 'correct' }, '1.2.3.4', 'Chrome');
    expect(mockLogHistory).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: true }) }),
    );
  });
});

// ── Tests : identifiants invalides ────────────────────────────────────────────

describe('AuthService.login — identifiants invalides', () => {
  it('retourne 401 si l\'utilisateur n\'existe pas', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockLogHistory.mockResolvedValue({});
    await expect(
      authService.login({ email: 'inconnu@bts.cm', password: 'test' }, '127.0.0.1', 'Jest'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('retourne 401 si utilisateur soft-deleted', async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_USER, deletedAt: new Date() });
    mockLogHistory.mockResolvedValue({});
    await expect(
      authService.login({ email: 'admin@bts.cm', password: 'correct' }, '127.0.0.1', 'Jest'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('retourne 401 si mot de passe incorrect', async () => {
    mockFindUnique.mockResolvedValue(BASE_USER);
    mockCompare.mockResolvedValue(false);
    mockCompany.mockResolvedValue({ maxLoginAttempts: 5 });
    mockUpdate.mockResolvedValue(BASE_USER);
    mockLogHistory.mockResolvedValue({});
    await expect(
      authService.login({ email: 'admin@bts.cm', password: 'mauvais' }, '127.0.0.1', 'Jest'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('incrémente failedLoginAttempts après mauvais mot de passe', async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_USER, failedLoginAttempts: 2 });
    mockCompare.mockResolvedValue(false);
    mockCompany.mockResolvedValue({ maxLoginAttempts: 5 });
    mockUpdate.mockResolvedValue(BASE_USER);
    mockLogHistory.mockResolvedValue({});
    await authService.login({ email: 'admin@bts.cm', password: 'mauvais' }, '127.0.0.1', 'Jest').catch(() => {});
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginAttempts: 3 }),
      }),
    );
  });
});

// ── Tests : compte suspendu / verrouillé ──────────────────────────────────────

describe('AuthService.login — compte bloqué', () => {
  it('retourne 401 si compte suspendu', async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_USER, status: 'suspended' });
    mockLogHistory.mockResolvedValue({});
    await expect(
      authService.login({ email: 'admin@bts.cm', password: 'correct' }, '127.0.0.1', 'Jest'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('retourne 401 si compte verrouillé (lockedAt défini)', async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_USER, lockedAt: new Date() });
    mockLogHistory.mockResolvedValue({});
    await expect(
      authService.login({ email: 'admin@bts.cm', password: 'correct' }, '127.0.0.1', 'Jest'),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('verrouille le compte après maxLoginAttempts tentatives échouées', async () => {
    mockFindUnique.mockResolvedValue({ ...BASE_USER, failedLoginAttempts: 4 }); // 4 → 5e tentative
    mockCompare.mockResolvedValue(false);
    mockCompany.mockResolvedValue({ maxLoginAttempts: 5 });
    mockUpdate.mockResolvedValue(BASE_USER);
    mockLogHistory.mockResolvedValue({});
    await authService.login({ email: 'admin@bts.cm', password: 'mauvais' }, '127.0.0.1', 'Jest').catch(() => {});
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedLoginAttempts: 5,
          lockedAt: expect.any(Date),
          lockReason: 'too_many_attempts',
        }),
      }),
    );
  });
});

// ── Tests : 2FA TOTP ──────────────────────────────────────────────────────────

describe('AuthService.login — 2FA TOTP', () => {
  const totpSecret = generateTotpSecret();

  it('retourne 401 TOTP_REQUIRED si 2FA activé et token absent', async () => {
    setupSuccessfulLogin({ twoFactorEnabled: true, twoFactorSecret: totpSecret });
    await expect(
      authService.login({ email: 'admin@bts.cm', password: 'correct' }, '127.0.0.1', 'Jest'),
    ).rejects.toMatchObject({ statusCode: 401, code: 'TOTP_REQUIRED' });
  });

  it('accepte un code TOTP valide', async () => {
    setupSuccessfulLogin({ twoFactorEnabled: true, twoFactorSecret: totpSecret });
    const validCode = authenticator.generate(totpSecret);
    const result = await authService.login(
      { email: 'admin@bts.cm', password: 'correct', totpToken: validCode },
      '127.0.0.1', 'Jest',
    );
    expect(result.accessToken).toBeDefined();
  });

  it('retourne 401 si code TOTP invalide', async () => {
    setupSuccessfulLogin({ twoFactorEnabled: true, twoFactorSecret: totpSecret, twoFactorBackupCodes: [] });
    await expect(
      authService.login(
        { email: 'admin@bts.cm', password: 'correct', totpToken: '000000' },
        '127.0.0.1', 'Jest',
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('accepte un backup code valide (hash SHA-256)', async () => {
    const backupCode = 'ABCD-EFGH';
    const hash = crypto.createHash('sha256').update(backupCode.toUpperCase()).digest('hex');
    setupSuccessfulLogin({
      twoFactorEnabled: true,
      twoFactorSecret: totpSecret,
      twoFactorBackupCodes: [hash],
    });
    const result = await authService.login(
      { email: 'admin@bts.cm', password: 'correct', totpToken: backupCode },
      '127.0.0.1', 'Jest',
    );
    expect(result.accessToken).toBeDefined();
    // Le backup code doit être consommé (retiré de la liste)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ twoFactorBackupCodes: [] }),
      }),
    );
  });

  it('rejette un backup code déjà utilisé (absent de la liste)', async () => {
    setupSuccessfulLogin({
      twoFactorEnabled: true,
      twoFactorSecret: totpSecret,
      twoFactorBackupCodes: [], // Liste vide = tous consommés
    });
    await expect(
      authService.login(
        { email: 'admin@bts.cm', password: 'correct', totpToken: 'USED-CODE' },
        '127.0.0.1', 'Jest',
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

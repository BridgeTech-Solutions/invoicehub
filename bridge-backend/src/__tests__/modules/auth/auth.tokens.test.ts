/**
 * Tests unitaires — AuthService.refresh (rotation des tokens)
 *
 * Vérifie que le refresh token est bien rotaté (ancien révoqué, nouveau émis),
 * et que les tokens invalides/révoqués/expirés sont rejetés.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    loginHistory: { create: jest.fn() },
    companySettings: { findFirst: jest.fn() },
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
import { signRefreshToken } from '../../../lib/jwt';

const authService = new AuthService();

const mockRefreshFindUnique = prisma.refreshToken.findUnique as jest.Mock;
const mockRefreshUpdate     = prisma.refreshToken.update as jest.Mock;
const mockRefreshCreate     = prisma.refreshToken.create as jest.Mock;
const mockUserFindFirst     = prisma.user.findFirst as jest.Mock;
const mockUserFindUniqueOrThrow = prisma.user.findUniqueOrThrow as jest.Mock;
const mockUserUpdate        = prisma.user.update as jest.Mock;
const mockCompany           = prisma.companySettings.findFirst as jest.Mock;

const ACTIVE_USER = {
  id: 'user-uuid-abc',
  email: 'admin@bts.cm',
  role: 'admin',
  firstName: 'Admin',
  lastName: 'BTS',
  status: 'active',
  deletedAt: null,
  mustChangePassword: false,
  twoFactorEnabled: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthService.refresh', () => {

  describe('token invalide', () => {
    it('lève 401 si le token est une chaîne aléatoire', async () => {
      await expect(authService.refresh('pas-un-token')).rejects.toMatchObject({ statusCode: 401 });
    });

    it('lève 401 si le token est signé avec une mauvaise clé', async () => {
      const jwt = require('jsonwebtoken');
      const fakeToken = jwt.sign({ sub: 'user-id', type: 'refresh' }, 'wrong-key');
      await expect(authService.refresh(fakeToken)).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('token absent ou révoqué en base', () => {
    it('lève 401 si le token n\'est pas trouvé en base', async () => {
      const token = signRefreshToken(ACTIVE_USER.id);
      mockRefreshFindUnique.mockResolvedValue(null);
      await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('lève 401 si le token est révoqué (revokedAt défini)', async () => {
      const token = signRefreshToken(ACTIVE_USER.id);
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      mockRefreshFindUnique.mockResolvedValue({
        id: 'rt-id', tokenHash, revokedAt: new Date(), expiresAt: new Date(Date.now() + 1_000_000),
        userId: ACTIVE_USER.id, lastActivityAt: new Date(),
      });
      await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('lève 401 si le token est expiré en base (expiresAt passé)', async () => {
      const token = signRefreshToken(ACTIVE_USER.id);
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      mockRefreshFindUnique.mockResolvedValue({
        id: 'rt-id', tokenHash, revokedAt: null,
        expiresAt: new Date(Date.now() - 1000), // Dans le passé
        userId: ACTIVE_USER.id, lastActivityAt: new Date(),
      });
      await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('rotation réussie', () => {
    function setupValidRefresh(token: string) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      mockRefreshFindUnique.mockResolvedValue({
        id: 'rt-id', tokenHash, revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        userId: ACTIVE_USER.id, lastActivityAt: new Date(),
      });
      mockCompany.mockResolvedValue({ sessionTimeoutMinutes: 0 });
      mockUserFindFirst.mockResolvedValue(ACTIVE_USER);
      mockUserFindUniqueOrThrow.mockResolvedValue({ email: ACTIVE_USER.email, role: ACTIVE_USER.role });
      mockUserUpdate.mockResolvedValue(ACTIVE_USER);
      mockRefreshUpdate.mockResolvedValue({});
      mockRefreshCreate.mockResolvedValue({ id: 'rt-new', tokenHash: 'new-hash', expiresAt: new Date() });
    }

    it('retourne un nouvel accessToken + refreshToken', async () => {
      const token = signRefreshToken(ACTIVE_USER.id);
      setupValidRefresh(token);
      const result = await authService.refresh(token);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('révoque l\'ancien token (revokedAt défini)', async () => {
      const token = signRefreshToken(ACTIVE_USER.id);
      setupValidRefresh(token);
      await authService.refresh(token);
      expect(mockRefreshUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('crée un nouveau token en base', async () => {
      const token = signRefreshToken(ACTIVE_USER.id);
      setupValidRefresh(token);
      await authService.refresh(token);
      expect(mockRefreshCreate).toHaveBeenCalled();
    });

    it('lève 401 si l\'utilisateur est inactif malgré un token valide', async () => {
      const token = signRefreshToken(ACTIVE_USER.id);
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      mockRefreshFindUnique.mockResolvedValue({
        id: 'rt-id', tokenHash, revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        userId: ACTIVE_USER.id, lastActivityAt: new Date(),
      });
      mockCompany.mockResolvedValue({ sessionTimeoutMinutes: 0 });
      mockUserFindFirst.mockResolvedValue(null); // User supprimé ou suspendu
      await expect(authService.refresh(token)).rejects.toMatchObject({ statusCode: 401 });
    });
  });
});

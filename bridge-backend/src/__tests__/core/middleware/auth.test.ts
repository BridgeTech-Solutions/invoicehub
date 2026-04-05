/**
 * Tests unitaires — core/middleware/authenticate
 *
 * Vérifie que le middleware JWT injecte req.user correctement
 * et rejette les tokens invalides / comptes inactifs.
 * Prisma est entièrement mocké — pas de DB nécessaire.
 */
import { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../../core/middleware/auth';
import { signAccessToken } from '../../../lib/jwt';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from '../../../config/database';
const mockFindFirst = prisma.user.findFirst as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTIVE_USER = {
  id: 'user-uuid-1234',
  email: 'admin@bts.cm',
  role: 'admin',
  firstName: 'Admin',
  lastName: 'BTS',
};

function makeReq(authHeader?: string): Partial<Request> {
  return { headers: { authorization: authHeader } };
}

function callMiddleware(req: Partial<Request>): Promise<void> {
  return new Promise((resolve, reject) => {
    const next: NextFunction = (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    };
    authenticate(req as Request, {} as Response, next);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('authenticate — token absent', () => {
  it('rejette si Authorization header absent → 401', async () => {
    await expect(callMiddleware(makeReq())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejette si header ne commence pas par "Bearer " → 401', async () => {
    await expect(callMiddleware(makeReq('Basic abc123'))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejette si header est juste "Bearer " (token vide) → 401', async () => {
    await expect(callMiddleware(makeReq('Bearer '))).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('authenticate — token invalide', () => {
  it('rejette un token forgé (mauvaise signature) → 401', async () => {
    await expect(callMiddleware(makeReq('Bearer faux.token.signe'))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejette un token expiré → 401', async () => {
    // Signe avec expiration 0s → immédiatement expiré
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { sub: ACTIVE_USER.id, email: ACTIVE_USER.email, role: 'admin', type: 'access' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '0s' },
    );
    await new Promise(r => setTimeout(r, 10));
    await expect(callMiddleware(makeReq(`Bearer ${expired}`))).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('authenticate — token valide', () => {
  beforeEach(() => {
    mockFindFirst.mockResolvedValue(ACTIVE_USER);
  });

  it('appelle next() sans erreur avec un token valide', async () => {
    const token = signAccessToken({ sub: ACTIVE_USER.id, email: ACTIVE_USER.email, role: 'admin' });
    await expect(callMiddleware(makeReq(`Bearer ${token}`))).resolves.toBeUndefined();
  });

  it('injecte req.user avec les bonnes propriétés', async () => {
    const token = signAccessToken({ sub: ACTIVE_USER.id, email: ACTIVE_USER.email, role: 'admin' });
    const req = makeReq(`Bearer ${token}`) as Request;
    await callMiddleware(req);
    expect(req.user).toMatchObject({
      id: ACTIVE_USER.id,
      email: ACTIVE_USER.email,
      role: ACTIVE_USER.role,
    });
  });

  it('interroge prisma avec le bon userId', async () => {
    const token = signAccessToken({ sub: ACTIVE_USER.id, email: ACTIVE_USER.email, role: 'admin' });
    await callMiddleware(makeReq(`Bearer ${token}`));
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ACTIVE_USER.id, deletedAt: null, status: 'active' }),
      }),
    );
  });
});

describe('authenticate — compte inactif', () => {
  it('rejette si user introuvable en DB → 401', async () => {
    mockFindFirst.mockResolvedValue(null);
    const token = signAccessToken({ sub: 'inexistant-id', email: 'x@bts.cm', role: 'admin' });
    await expect(callMiddleware(makeReq(`Bearer ${token}`))).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejette si user supprimé (findFirst retourne null) → 401', async () => {
    mockFindFirst.mockResolvedValue(null); // La query filtre deletedAt: null, donc null = supprimé
    const token = signAccessToken({ sub: ACTIVE_USER.id, email: ACTIVE_USER.email, role: 'admin' });
    await expect(callMiddleware(makeReq(`Bearer ${token}`))).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('introuvable'),
    });
  });
});

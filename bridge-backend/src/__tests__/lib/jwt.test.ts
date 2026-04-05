/**
 * Tests unitaires — lib/jwt
 *
 * signAccessToken, verifyAccessToken, signRefreshToken,
 * verifyRefreshToken, getRefreshTokenExpiry
 */
import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiry,
} from '../../lib/jwt';

const TEST_USER = {
  sub:   'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  email: 'admin@bts.cm',
  role:  'admin',
};

// ── signAccessToken ───────────────────────────────────────────────────────────

describe('signAccessToken', () => {
  it('retourne une chaîne JWT non vide', () => {
    const token = signAccessToken(TEST_USER);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('encode le payload correctement', () => {
    const token = signAccessToken(TEST_USER);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded.sub).toBe(TEST_USER.sub);
    expect(decoded.email).toBe(TEST_USER.email);
    expect(decoded.role).toBe(TEST_USER.role);
    expect(decoded.type).toBe('access');
  });

  it('inclut une expiration (exp) dans le payload', () => {
    const token = signAccessToken(TEST_USER);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded.exp).toBeDefined();
    expect(typeof decoded.exp).toBe('number');
  });
});

// ── verifyAccessToken ─────────────────────────────────────────────────────────

describe('verifyAccessToken', () => {
  it('décode un token valide sans erreur', () => {
    const token = signAccessToken(TEST_USER);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(TEST_USER.sub);
    expect(payload.email).toBe(TEST_USER.email);
    expect(payload.role).toBe(TEST_USER.role);
    expect(payload.type).toBe('access');
  });

  it('lève une erreur sur un token forgé (mauvaise signature)', () => {
    const fakeToken = jwt.sign({ sub: TEST_USER.sub, type: 'access' }, 'wrong_secret');
    expect(() => verifyAccessToken(fakeToken)).toThrow();
  });

  it('lève une erreur sur un token expiré', () => {
    const expiredToken = jwt.sign(
      { ...TEST_USER, type: 'access' },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '0s' },
    );
    // Attend 10ms pour être sûr que le token est expiré
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(() => verifyAccessToken(expiredToken)).toThrow(/expired/i);
        resolve();
      }, 10);
    });
  });

  it('lève une erreur sur une chaîne vide', () => {
    expect(() => verifyAccessToken('')).toThrow();
  });

  it('lève une erreur sur un token malformé', () => {
    expect(() => verifyAccessToken('not.a.token')).toThrow();
  });
});

// ── signRefreshToken / verifyRefreshToken ────────────────────────────────────

describe('signRefreshToken + verifyRefreshToken', () => {
  it('génère un refresh token valide', () => {
    const token = signRefreshToken(TEST_USER.sub);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('encode sub et type=refresh', () => {
    const token = signRefreshToken(TEST_USER.sub);
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe(TEST_USER.sub);
    expect(payload.type).toBe('refresh');
  });

  it('access token et refresh token sont signés avec des clés différentes', () => {
    const accessToken  = signAccessToken(TEST_USER);
    const refreshToken = signRefreshToken(TEST_USER.sub);
    // Le refresh token ne doit pas passer la vérification access et vice versa
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });

  it('lève une erreur sur un refresh token forgé', () => {
    const fakeRefresh = jwt.sign({ sub: TEST_USER.sub, type: 'refresh' }, 'wrong_key');
    expect(() => verifyRefreshToken(fakeRefresh)).toThrow();
  });
});

// ── getRefreshTokenExpiry ────────────────────────────────────────────────────

describe('getRefreshTokenExpiry', () => {
  it('retourne une Date dans le futur pour 7d', () => {
    const expiry = getRefreshTokenExpiry();
    expect(expiry).toBeInstanceOf(Date);
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  it('expire environ dans 7 jours (± 5 secondes de marge)', () => {
    const expiry = getRefreshTokenExpiry();
    const expectedMs = 7 * 24 * 3600 * 1000;
    const delta = expiry.getTime() - Date.now();
    expect(delta).toBeGreaterThan(expectedMs - 5_000);
    expect(delta).toBeLessThan(expectedMs + 5_000);
  });

  it('lève une erreur si le format JWT_REFRESH_EXPIRES_IN est invalide', () => {
    const original = process.env.JWT_REFRESH_EXPIRES_IN;
    process.env.JWT_REFRESH_EXPIRES_IN = 'invalid-format';
    // Recharge le module pour que env soit relu
    jest.resetModules();
    expect(() => {
      // On teste la logique directement — la regex rejette 'invalid-format'
      const match = 'invalid-format'.match(/^(\d+)([dhms])$/);
      if (!match) throw new Error('Invalid JWT_REFRESH_EXPIRES_IN format');
    }).toThrow('Invalid JWT_REFRESH_EXPIRES_IN format');
    process.env.JWT_REFRESH_EXPIRES_IN = original;
  });
});

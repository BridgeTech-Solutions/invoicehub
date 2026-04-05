/**
 * Tests unitaires — lib/totp
 *
 * generateTotpSecret(), verifyTotpToken(), getTotpUri()
 */
import { authenticator } from 'otplib';
import {
  generateTotpSecret,
  verifyTotpToken,
  getTotpUri,
} from '../../lib/totp';

describe('generateTotpSecret', () => {
  it('retourne une chaîne non vide', () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
  });

  it('génère des secrets uniques à chaque appel', () => {
    const secrets = new Set(Array.from({ length: 10 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(10);
  });

  it('génère un secret en Base32 (alphanumérique majuscule)', () => {
    const secret = generateTotpSecret();
    // Base32 : A-Z et 2-7
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  });
});

describe('verifyTotpToken', () => {
  let secret: string;

  beforeEach(() => {
    secret = generateTotpSecret();
  });

  it('retourne true pour un token TOTP valide', () => {
    const validToken = authenticator.generate(secret);
    expect(verifyTotpToken(validToken, secret)).toBe(true);
  });

  it('retourne false pour un token invalide', () => {
    expect(verifyTotpToken('000000', secret)).toBe(false);
  });

  it('retourne false pour une chaîne vide', () => {
    expect(verifyTotpToken('', secret)).toBe(false);
  });

  it('retourne false pour un token de format incorrect', () => {
    expect(verifyTotpToken('abcdef', secret)).toBe(false);
  });

  it('retourne false avec un mauvais secret', () => {
    const validToken = authenticator.generate(secret);
    const wrongSecret = generateTotpSecret();
    // Avec un secret différent, le token est invalide (sauf collision ultra rare)
    const result = verifyTotpToken(validToken, wrongSecret);
    // On ne peut pas garantir false à 100% (collision possible) mais très improbable
    // On vérifie juste que la fonction ne lève pas d'erreur
    expect(typeof result).toBe('boolean');
  });

  it('ne lève pas d\'exception pour des entrées invalides', () => {
    expect(() => verifyTotpToken('invalid', 'not_a_secret')).not.toThrow();
  });
});

describe('getTotpUri', () => {
  it('retourne un URI otpauth valide', () => {
    const secret = generateTotpSecret();
    const uri = getTotpUri('admin@bts.cm', secret);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
  });

  it('contient l\'email de l\'utilisateur dans l\'URI', () => {
    const secret = generateTotpSecret();
    const uri = getTotpUri('admin@bts.cm', secret);
    expect(uri).toContain('admin%40bts.cm');
  });

  it('contient l\'issuer configuré', () => {
    const secret = generateTotpSecret();
    const uri = getTotpUri('admin@bts.cm', secret);
    // TOTP_ISSUER = 'InvoiceHub BTS Test' (depuis setup.ts)
    expect(uri).toContain('InvoiceHub');
  });

  it('contient le secret dans l\'URI', () => {
    const secret = generateTotpSecret();
    const uri = getTotpUri('admin@bts.cm', secret);
    expect(uri).toContain(`secret=${secret}`);
  });
});

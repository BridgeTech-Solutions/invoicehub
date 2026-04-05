/**
 * Tests unitaires — lib/bcrypt
 *
 * hashPassword(), comparePassword()
 */
import { hashPassword, comparePassword } from '../../lib/bcrypt';

describe('hashPassword', () => {
  it('retourne un hash différent du mot de passe original', async () => {
    const password = 'MonMotDePasse!123';
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
  });

  it('génère un hash bcrypt (commence par $2b$)', async () => {
    const hash = await hashPassword('test');
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it('génère des hashes différents pour le même mot de passe (salt aléatoire)', async () => {
    const hash1 = await hashPassword('meme_password');
    const hash2 = await hashPassword('meme_password');
    expect(hash1).not.toBe(hash2);
  });

  it('accepte un mot de passe vide', async () => {
    const hash = await hashPassword('');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe('comparePassword', () => {
  it('retourne true pour le bon mot de passe', async () => {
    const password = 'MonMotDePasse!123';
    const hash = await hashPassword(password);
    const result = await comparePassword(password, hash);
    expect(result).toBe(true);
  });

  it('retourne false pour un mauvais mot de passe', async () => {
    const hash = await hashPassword('correct_password');
    const result = await comparePassword('wrong_password', hash);
    expect(result).toBe(false);
  });

  it('retourne false pour un hash complètement différent', async () => {
    const hash1 = await hashPassword('password_A');
    const result = await comparePassword('password_B', hash1);
    expect(result).toBe(false);
  });

  it('retourne false si le hash est invalide', async () => {
    const result = await comparePassword('password', 'not_a_valid_hash');
    expect(result).toBe(false);
  });

  it('fonctionne après plusieurs hashages du même password', async () => {
    const password = 'StablePassword';
    const hash = await hashPassword(password);
    // Doit toujours être true, quelle que soit l'itération
    for (let i = 0; i < 3; i++) {
      expect(await comparePassword(password, hash)).toBe(true);
    }
  });
});

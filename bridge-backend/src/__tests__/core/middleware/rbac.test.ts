/**
 * Tests unitaires — core/middleware/rbac
 *
 * authorize(...roles) — vérification de la hiérarchie des rôles RBAC.
 * Pas de DB nécessaire : req.user est injecté manuellement.
 */
import { Request, Response, NextFunction } from 'express';
import { authorize } from '../../../core/middleware/rbac';
import { AppError } from '../../../core/errors/AppError';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(role?: string): Partial<Request> {
  return role
    ? { user: { id: 'test-id', email: 'test@bts.cm', roleId: 'role-id', roleName: role, permissions: [], firstName: 'Test', lastName: 'User' } }
    : {};
}

const mockRes = {} as Response;

function callMiddleware(role: string | undefined, ...allowedRoles: string[]) {
  return new Promise<void>((resolve, reject) => {
    const next: NextFunction = (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    };
    authorize(...(allowedRoles as ('admin' | 'commercial' | 'employee')[]))(
      makeReq(role) as Request,
      mockRes,
      next,
    );
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('authorize — rôle absent (req.user non injecté)', () => {
  it('appelle next(401) si req.user est absent', async () => {
    await expect(callMiddleware(undefined, 'admin')).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe('authorize — rôle admin', () => {
  it('autorise admin sur une route admin', async () => {
    await expect(callMiddleware('admin', 'admin')).resolves.toBeUndefined();
  });

  it('refuse admin sur une route commercial (pas de hiérarchie implicite) → 403', async () => {
    await expect(callMiddleware('admin', 'commercial')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('autorise admin si plusieurs rôles dont admin', async () => {
    await expect(callMiddleware('admin', 'admin', 'commercial')).resolves.toBeUndefined();
  });

  it('autorise admin sur une route ouverte à tous les rôles', async () => {
    await expect(callMiddleware('admin', 'admin', 'commercial', 'employee')).resolves.toBeUndefined();
  });
});

describe('authorize — rôle commercial', () => {
  it('autorise commercial sur une route commercial', async () => {
    await expect(callMiddleware('commercial', 'commercial')).resolves.toBeUndefined();
  });

  it('refuse commercial sur une route admin → 403', async () => {
    await expect(callMiddleware('commercial', 'admin')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('refuse commercial sur une route employee → 403', async () => {
    await expect(callMiddleware('commercial', 'employee')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('authorize — rôle employee', () => {
  it('autorise employee sur une route employee', async () => {
    await expect(callMiddleware('employee', 'employee')).resolves.toBeUndefined();
  });

  it('refuse employee sur une route admin → 403', async () => {
    await expect(callMiddleware('employee', 'admin')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('refuse employee sur une route commercial → 403', async () => {
    await expect(callMiddleware('employee', 'commercial')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('authorize — sans rôle requis (authenticate uniquement)', () => {
  it('autorise si req.user est présent et aucun rôle requis', async () => {
    await expect(callMiddleware('employee')).resolves.toBeUndefined();
  });

  it('refuse si req.user absent même sans rôle requis', async () => {
    await expect(callMiddleware(undefined)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

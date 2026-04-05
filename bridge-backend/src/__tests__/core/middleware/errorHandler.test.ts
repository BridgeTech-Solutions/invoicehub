/**
 * Tests unitaires — core/middleware/errorHandler
 *
 * Vérifie le format des réponses JSON pour chaque type d'erreur.
 */
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { errorHandler } from '../../../core/middleware/errorHandler';
import { AppError } from '../../../core/errors/AppError';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json, _status: status, _json: json } as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

const mockReq = { path: '/test', method: 'GET' } as Request;
const noopNext = jest.fn();

// ── AppError ──────────────────────────────────────────────────────────────────

describe('errorHandler — AppError', () => {
  it('retourne status 400 et code BAD_REQUEST', () => {
    const res = makeRes();
    errorHandler(AppError.badRequest('Champ manquant'), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'BAD_REQUEST',
      message: 'Champ manquant',
    });
  });

  it('retourne status 401 pour UNAUTHORIZED', () => {
    const res = makeRes();
    errorHandler(AppError.unauthorized('Token invalide'), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'UNAUTHORIZED' }),
    );
  });

  it('retourne status 403 pour FORBIDDEN', () => {
    const res = makeRes();
    errorHandler(AppError.forbidden(), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('retourne status 404 pour NOT_FOUND', () => {
    const res = makeRes();
    errorHandler(AppError.notFound('Facture introuvable'), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND', message: 'Facture introuvable' }),
    );
  });

  it('retourne status 409 pour CONFLICT', () => {
    const res = makeRes();
    errorHandler(AppError.conflict('Email déjà utilisé'), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('retourne status 500 pour INTERNAL_ERROR', () => {
    const res = makeRes();
    errorHandler(AppError.internal('Erreur interne'), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('toujours success: false dans le body', () => {
    const res = makeRes();
    errorHandler(AppError.badRequest('Test'), mockReq, res, noopNext);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
  });
});

// ── ZodError ──────────────────────────────────────────────────────────────────

describe('errorHandler — ZodError', () => {
  it('retourne 400 VALIDATION_ERROR pour une ZodError', () => {
    const zodError = new ZodError([
      { code: 'too_small', minimum: 1, type: 'string', inclusive: true, path: ['email'], message: 'Required' },
    ]);
    const res = makeRes();
    errorHandler(zodError, mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.errors).toBeDefined();
  });
});

// ── Erreur Prisma ─────────────────────────────────────────────────────────────

describe('errorHandler — Prisma errors', () => {
  function makePrismaError(code: string) {
    const err = new Prisma.PrismaClientKnownRequestError('message', {
      code,
      clientVersion: '5.0.0',
    });
    return err;
  }

  it('P2002 (UNIQUE) → 409 DUPLICATE_KEY', () => {
    const res = makeRes();
    errorHandler(makePrismaError('P2002'), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DUPLICATE_KEY' }),
    );
  });

  it('P2025 (NOT FOUND) → 404 NOT_FOUND', () => {
    const res = makeRes();
    errorHandler(makePrismaError('P2025'), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('P2003 (FK violation) → 409 FOREIGN_KEY_VIOLATION', () => {
    const res = makeRes();
    errorHandler(makePrismaError('P2003'), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FOREIGN_KEY_VIOLATION' }),
    );
  });
});

// ── Erreur inconnue ───────────────────────────────────────────────────────────

describe('errorHandler — erreur inconnue', () => {
  it('retourne 500 en production sans exposer le message', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    errorHandler(new Error('Détail technique'), mockReq, res, noopNext);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.message).toBe('Erreur interne du serveur');
    process.env.NODE_ENV = 'test';
  });

  it('expose le message en développement', () => {
    process.env.NODE_ENV = 'development';
    const res = makeRes();
    errorHandler(new Error('Détail technique'), mockReq, res, noopNext);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.message).toBe('Détail technique');
    process.env.NODE_ENV = 'test';
  });
});

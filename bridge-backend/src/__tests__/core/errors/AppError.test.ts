/**
 * Tests unitaires — core/errors/AppError
 *
 * Vérifie les constructeurs statiques et les propriétés de base.
 */
import { AppError } from '../../../core/errors/AppError';

describe('AppError — constructeur', () => {
  it('crée une erreur avec message, statusCode et code personnalisés', () => {
    const err = new AppError('Mon message', 422, 'MY_CODE');
    expect(err.message).toBe('Mon message');
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('MY_CODE');
    expect(err.isOperational).toBe(true);
  });

  it('est une instance de Error', () => {
    const err = new AppError('Test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('a un nom de classe dans la stack trace', () => {
    const err = new AppError('Test');
    expect(err.stack).toBeDefined();
  });

  it('utilise les valeurs par défaut (500, INTERNAL_ERROR)', () => {
    const err = new AppError('Erreur inattendue');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});

describe('AppError — constructeurs statiques', () => {
  it('badRequest → 400 / BAD_REQUEST', () => {
    const err = AppError.badRequest('Champ manquant');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('Champ manquant');
  });

  it('unauthorized → 401 / UNAUTHORIZED', () => {
    const err = AppError.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('unauthorized accepte un message personnalisé', () => {
    const err = AppError.unauthorized('Token invalide');
    expect(err.message).toBe('Token invalide');
  });

  it('forbidden → 403 / FORBIDDEN', () => {
    const err = AppError.forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('notFound → 404 / NOT_FOUND', () => {
    const err = AppError.notFound('Facture introuvable');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Facture introuvable');
  });

  it('conflict → 409 / CONFLICT', () => {
    const err = AppError.conflict('Email déjà utilisé');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('unprocessable → 422 / UNPROCESSABLE', () => {
    const err = AppError.unprocessable('Données invalides');
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('UNPROCESSABLE');
  });

  it('serviceUnavailable → 503 / SERVICE_UNAVAILABLE', () => {
    const err = AppError.serviceUnavailable('Service indisponible');
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('internal → 500 / INTERNAL_ERROR', () => {
    const err = AppError.internal('Erreur interne');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('accepte un code personnalisé sur les statiques', () => {
    const err = AppError.badRequest('Solde insuffisant', 'INSUFFICIENT_BALANCE');
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
    expect(err.statusCode).toBe(400);
  });

  it('isOperational est toujours true (erreur intentionnelle)', () => {
    const errors = [
      AppError.badRequest('test'),
      AppError.unauthorized(),
      AppError.forbidden(),
      AppError.notFound(),
      AppError.conflict('test'),
      AppError.internal('test'),
    ];
    for (const err of errors) {
      expect(err.isOperational).toBe(true);
    }
  });
});

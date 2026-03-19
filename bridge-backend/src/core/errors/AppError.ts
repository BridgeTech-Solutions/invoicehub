export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppError(message, 400, code);
  }

  static unauthorized(message = 'Non autorisé', code = 'UNAUTHORIZED') {
    return new AppError(message, 401, code);
  }

  static forbidden(message = 'Accès refusé', code = 'FORBIDDEN') {
    return new AppError(message, 403, code);
  }

  static notFound(message = 'Ressource introuvable', code = 'NOT_FOUND') {
    return new AppError(message, 404, code);
  }

  static conflict(message: string, code = 'CONFLICT') {
    return new AppError(message, 409, code);
  }

  static unprocessable(message: string, code = 'UNPROCESSABLE') {
    return new AppError(message, 422, code);
  }

  static serviceUnavailable(message: string, code = 'SERVICE_UNAVAILABLE') {
    return new AppError(message, 503, code);
  }

  static internal(message: string, code = 'INTERNAL_ERROR') {
    return new AppError(message, 500, code);
  }
}

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

  static badRequest(msg: string, code = 'BAD_REQUEST')       { return new AppError(msg, 400, code); }
  static unauthorized(msg = 'Non autorisé', code = 'UNAUTHORIZED') { return new AppError(msg, 401, code); }
  static forbidden(msg = 'Accès refusé', code = 'FORBIDDEN') { return new AppError(msg, 403, code); }
  static notFound(msg = 'Ressource introuvable', code = 'NOT_FOUND') { return new AppError(msg, 404, code); }
  static conflict(msg: string, code = 'CONFLICT')            { return new AppError(msg, 409, code); }
  static unprocessable(msg: string, code = 'UNPROCESSABLE')  { return new AppError(msg, 422, code); }
  static serviceUnavailable(msg: string, code = 'SERVICE_UNAVAILABLE') { return new AppError(msg, 503, code); }
  static internal(msg: string, code = 'INTERNAL_ERROR')      { return new AppError(msg, 500, code); }
}

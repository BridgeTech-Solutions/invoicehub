import {
  ArgumentsHost, Catch, ExceptionFilter,
  HttpException, HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();
    const req    = ctx.getRequest<Request>();
    const isProd = process.env.NODE_ENV === 'production';

    if (exception instanceof ZodError) {
      return res.status(400).json({
        success: false, code: 'VALIDATION_ERROR',
        message: 'Données invalides',
        errors: exception.flatten().fieldErrors,
      });
    }

    if (exception instanceof AppError) {
      return res.status(exception.statusCode).json({
        success: false, code: exception.code, message: exception.message,
      });
    }

    if (exception instanceof HttpException) {
      const status   = exception.getStatus();
      const response = exception.getResponse();
      const message  = typeof response === 'object' && 'message' in (response as object)
        ? (response as { message: string }).message
        : exception.message;
      return res.status(status).json({ success: false, code: 'HTTP_ERROR', message });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return res.status(409).json({ success: false, code: 'DUPLICATE_KEY', message: 'Cette ressource existe déjà' });
      }
      if (exception.code === 'P2025') {
        return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Ressource introuvable' });
      }
      if (exception.code === 'P2003') {
        return res.status(409).json({ success: false, code: 'FOREIGN_KEY_VIOLATION', message: 'Référence vers une ressource inexistante' });
      }
    }

    const err = exception as Error;
    if (process.env.NODE_ENV !== 'test') {
      console.error('[UnhandledError]', { path: req.path, method: req.method, error: err?.message, stack: err?.stack });
    }

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false, code: 'INTERNAL_ERROR',
      message: isProd ? 'Erreur interne du serveur' : (err?.message ?? 'Unknown error'),
    });
  }
}

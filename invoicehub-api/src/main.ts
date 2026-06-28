import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { patchNestJsSwagger } from 'nestjs-zod';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { default as helmet } from 'helmet';
import { default as rateLimit } from 'express-rate-limit';
import * as express from 'express';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.set('trust proxy', 1);

  const apiPrefix = process.env.API_PREFIX ?? '/api';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['/health', '/uploads/(.*)'],
  });

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'upgrade-insecure-requests': null as any,
      },
    },
    strictTransportSecurity: false,
  }));

  const normalize = (url: string) => url.replace(/\/$/, '').toLowerCase();
  const appUrl    = process.env.APP_URL ?? '';
  const extra     = process.env.CORS_ORIGINS?.split(',').map(normalize).filter(Boolean) ?? [];
  const allowed   = [normalize(appUrl), ...extra];

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true);
      if (allowed.includes(normalize(origin))) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 300,
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, code: 'RATE_LIMIT', message: 'Trop de requêtes. Réessayez dans 15 minutes.' },
  });
  app.use(globalLimiter);

  app.use(`${apiPrefix}/auth/login`, rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { success: false, code: 'RATE_LIMIT', message: 'Trop de tentatives de connexion.' },
  }));
  app.use(`${apiPrefix}/auth/forgot-password`, rateLimit({
    windowMs: 60 * 60 * 1000, max: 5,
    message: { success: false, code: 'RATE_LIMIT', message: 'Trop de demandes de réinitialisation.' },
  }));
  app.use(`${apiPrefix}/auth/refresh`, rateLimit({
    windowMs: 15 * 60 * 1000, max: 50,
    message: { success: false, code: 'RATE_LIMIT', message: 'Trop de tentatives de renouvellement de token.' },
  }));

  // Avatars servis directement (images profil utilisateur, accès cross-origin requis par le frontend)
  const setCrossOriginSameSite: express.RequestHandler = (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    next();
  };
  app.use(`${apiPrefix}/uploads/avatars`, setCrossOriginSameSite, express.static(path.join(process.cwd(), 'uploads/avatars')));
  // Vidéos du guide (servies comme les avatars, sous /api pour passer par Nginx en prod)
  app.use(`${apiPrefix}/uploads/videos`, setCrossOriginSameSite, express.static(path.join(process.cwd(), 'uploads/videos')));
  // Les assets settings (logos, cachets, signatures) sont servis uniquement via le contrôleur NestJS authentifié

  const reflector = app.get(Reflector);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));

  // Doc Swagger : activée hors production, OU explicitement via ENABLE_DOCS=true
  // (permet d'y accéder sur le serveur de prod quand on en a besoin, sans l'exposer
  // par défaut). URL : {API_PREFIX}/api/docs — ex. http://localhost:3000/api/docs
  const docsEnabled = process.env.NODE_ENV !== 'production'
    || /^(true|1|yes)$/i.test(process.env.ENABLE_DOCS ?? '');
  if (docsEnabled) {
    // Permet à @nestjs/swagger de générer les schémas OpenAPI à partir des
    // DTO Zod (createZodDto) — donc les corps de requête sont documentés.
    patchNestJsSwagger();
    const swaggerConfig = new DocumentBuilder()
      .setTitle('InvoiceHub API')
      .setDescription('API InvoiceHub v2.0 — Bridge Technologies Solutions')
      .setVersion('2.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
    console.log('Swagger docs activées sur /api/docs');
  }

  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT ?? '3000');
  await app.listen(port);
  console.log(`InvoiceHub NestJS démarré sur le port ${port}`);
}

bootstrap();

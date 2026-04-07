import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import { prisma } from './config/database';
import { redisConnection } from './config/redis';
import { httpLogger } from './core/middleware/requestLogger';
import { errorHandler } from './core/middleware/errorHandler';

import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { clientsRouter } from './modules/clients/clients.routes';
import { categoriesRouter, productsRouter } from './modules/products/products.routes';
import { proformasRouter } from './modules/proformas/proformas.routes';
import { invoicesRouter } from './modules/invoices/invoices.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { recurringRouter } from './modules/recurring/recurring.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { settingsUploadRouter } from './modules/settings/settings.upload';
import { auditRouter } from './modules/audit/audit.routes';
import { searchRouter } from './modules/search/search.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { taxRatesRouter } from './modules/tax-rates/tax-rates.routes';
import { officesRouter } from './modules/offices/offices.routes';
import { emailTemplatesRouter } from './modules/email-templates/email-templates.routes';
import { backupsRouter } from './modules/backups/backups.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { healthRouter } from './modules/health/health.routes';

const app: Express = express();

// ----------------------------------------------------------------
// Sécurité
// ----------------------------------------------------------------
app.use(helmet());

// Origines autorisées : APP_URL + CORS_ORIGINS (liste séparée par virgules)
// Normalise chaque URL en supprimant le slash final pour éviter les faux rejets
const normalizeOrigin = (url: string) => url.replace(/\/$/, '').toLowerCase();
const allowedOrigins = [
  normalizeOrigin(env.APP_URL),
  ...(env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map(o => normalizeOrigin(o)).filter(Boolean)
    : []),
];

console.log('[CORS] Origines autorisées :', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (Postman, curl, Next.js SSR server-side)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(normalizeOrigin(origin))) return callback(null, true);
    // Rejeter proprement — ne pas passer une Error (casserait les preflight OPTIONS)
    return callback(null, false);
  },
  credentials: true,
}));

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMIT', message: 'Trop de requêtes. Réessayez dans 15 minutes.' },
}));

// Rate limiting strict pour les endpoints d'auth
app.use(`${env.API_PREFIX}/auth/login`, rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, code: 'RATE_LIMIT', message: 'Trop de tentatives de connexion.' },
}));

app.use(`${env.API_PREFIX}/auth/forgot-password`, rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, code: 'RATE_LIMIT', message: 'Trop de demandes de réinitialisation.' },
}));

app.use(`${env.API_PREFIX}/auth/refresh`, rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, code: 'RATE_LIMIT', message: 'Trop de tentatives de renouvellement de token.' },
}));

// ----------------------------------------------------------------
// Fichiers statiques (assets uploadés)
// ----------------------------------------------------------------
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static('uploads')); // avatars, assets company, pièces jointes

// ----------------------------------------------------------------
// Parsers
// ----------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------------------
// Logging HTTP
// ----------------------------------------------------------------
app.use(httpLogger);

// ----------------------------------------------------------------
// Santé
// ----------------------------------------------------------------
app.get('/health', async (_req, res) => {
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redisConnection.ping(),
  ]);

  const db    = checks[0].status === 'fulfilled' ? 'ok' : 'error';
  const redis = checks[1].status === 'fulfilled' ? 'ok' : 'error';
  const healthy = db === 'ok' && redis === 'ok';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    db,
    redis,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  });
});

// ----------------------------------------------------------------
// Routes API
// ----------------------------------------------------------------
const prefix = env.API_PREFIX;

// Health check — accessible sans authentification
app.use(`${prefix}/health`, healthRouter);

app.use(`${prefix}/auth`, authRouter);
app.use(`${prefix}/users`, usersRouter);
app.use(`${prefix}/clients`, clientsRouter);
app.use(`${prefix}/product-categories`, categoriesRouter);
app.use(`${prefix}/products`, productsRouter);
app.use(`${prefix}/proformas`, proformasRouter);
app.use(`${prefix}/invoices`, invoicesRouter);
app.use(`${prefix}/payments`, paymentsRouter);
app.use(`${prefix}/recurring`, recurringRouter);
app.use(`${prefix}/notifications`, notificationsRouter);
app.use(`${prefix}/dashboard`, dashboardRouter);
app.use(`${prefix}/settings`, settingsRouter);
app.use(`${prefix}/settings/assets`, settingsUploadRouter);
app.use(`${prefix}/audit-logs`, auditRouter);
app.use(`${prefix}/search`, searchRouter);
app.use(`${prefix}/reports`, reportsRouter);
app.use(`${prefix}/tax-rates`, taxRatesRouter);
app.use(`${prefix}/offices`, officesRouter);
app.use(`${prefix}/ai`, aiRouter);
app.use(`${prefix}/email-templates`, emailTemplatesRouter);
app.use(`${prefix}/backups`, backupsRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Endpoint introuvable' });
});

// ----------------------------------------------------------------
// Gestionnaire d'erreurs global (doit être en dernier)
// ----------------------------------------------------------------
app.use(errorHandler);

export { app };

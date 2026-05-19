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
import rolesRouter from './modules/roles/roles.routes';
import suppliersRouter from './modules/suppliers/suppliers.routes';
import purchaseOrdersRouter from './modules/purchase-orders/purchase-orders.routes';
import supplierInvoicesRouter from './modules/supplier-invoices/supplier-invoices.routes';
import { expensesRouter, expenseCategoriesRouter, expenseBudgetsRouter } from './modules/expenses/expenses.routes';
import stockRouter from './modules/stock/stock.routes';
import bankRouter from './modules/bank/bank.routes';
import accountingRouter from './modules/accounting/accounting.routes';
import {
  webhooksRouter, apiKeysRouter, customFieldsRouter,
  workflowRulesRouter, ipWhitelistRouter, exportsRouter,
} from './modules/settings-advanced/settings-advanced.routes';
import { healthRouter } from './modules/health/health.routes';
import { guideRouter } from './modules/guide/guide.routes';
import { approvalsRouter } from './modules/approvals/approvals.routes';

const app: Express = express();

// Derrière Nginx (reverse proxy) — Express doit faire confiance au header
// X-Forwarded-For pour que express-rate-limit identifie correctement les IPs.
// `1` = on fait confiance à 1 seul proxy (Nginx) directement devant l'app.
app.set('trust proxy', 1);

// ----------------------------------------------------------------
// Sécurité
// ----------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Désactivé : on est en HTTP derrière nginx — cette directive force le navigateur
      // à convertir toutes les requêtes HTTP→HTTPS, ce qui bloque les appels API.
      'upgrade-insecure-requests': null,
    },
  },
  // Désactiver HSTS : inutile en HTTP, causerait des problèmes si activé
  strictTransportSecurity: false,
}));

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
// Seuls les avatars et les assets company (logo, tampon, signature) sont servis
// publiquement — ils sont affichés dans les <img> du frontend.
// Les justificatifs de paiement et les backups sont servis UNIQUEMENT via les
// routes API protégées (/api/payments/:id/attachment) — jamais en static public.
const setCrossOrigin: express.RequestHandler = (_req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
};
app.use('/uploads/avatars', setCrossOrigin, express.static('uploads/avatars'));
app.use('/uploads/company', setCrossOrigin, express.static('uploads/company'));

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
app.use(`${prefix}/guide`, guideRouter);
app.use(`${prefix}/email-templates`, emailTemplatesRouter);
app.use(`${prefix}/backups`, backupsRouter);
app.use(`${prefix}/roles`, rolesRouter);
app.use(`${prefix}/suppliers`, suppliersRouter);
app.use(`${prefix}/purchase-orders`, purchaseOrdersRouter);
app.use(`${prefix}/supplier-invoices`, supplierInvoicesRouter);
app.use(`${prefix}/expense-categories`, expenseCategoriesRouter);
app.use(`${prefix}/expenses`, expensesRouter);
app.use(`${prefix}/expense-budgets`, expenseBudgetsRouter);
app.use(`${prefix}/stock`, stockRouter);
app.use(`${prefix}/bank`, bankRouter);
app.use(`${prefix}/accounting`, accountingRouter);
app.use(`${prefix}/webhooks`, webhooksRouter);
app.use(`${prefix}/api-keys`, apiKeysRouter);
app.use(`${prefix}/settings/custom-fields`, customFieldsRouter);
app.use(`${prefix}/settings/workflow-rules`, workflowRulesRouter);
app.use(`${prefix}/settings/ip-whitelist`, ipWhitelistRouter);
app.use(`${prefix}/exports`, exportsRouter);
app.use(`${prefix}/approvals`, approvalsRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Endpoint introuvable' });
});

// ----------------------------------------------------------------
// Gestionnaire d'erreurs global (doit être en dernier)
// ----------------------------------------------------------------
app.use(errorHandler);

export { app };

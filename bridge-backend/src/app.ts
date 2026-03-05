import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
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

const app = express();

// ----------------------------------------------------------------
// Sécurité
// ----------------------------------------------------------------
app.use(helmet());
app.use(cors({
  origin: env.APP_URL,
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
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: env.NODE_ENV });
});

// ----------------------------------------------------------------
// Routes API
// ----------------------------------------------------------------
const prefix = env.API_PREFIX;

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

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Endpoint introuvable' });
});

// ----------------------------------------------------------------
// Gestionnaire d'erreurs global (doit être en dernier)
// ----------------------------------------------------------------
app.use(errorHandler);

export { app };

import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { logger } from './core/middleware/requestLogger';
import { startWorkers, closeWorkers } from './jobs/workers';
import { scheduleJobs } from './jobs/scheduler';
import { initSocket } from './lib/socket';

const httpServer = http.createServer(app);
initSocket(httpServer);

const server = httpServer.listen(env.PORT, async () => {
  logger.info(`InvoiceHub API démarrée`, {
    port: env.PORT,
    env: env.NODE_ENV,
    prefix: env.API_PREFIX,
  });

  startWorkers();
  await scheduleJobs();
});

// ----------------------------------------------------------------
// Graceful shutdown
// ----------------------------------------------------------------
async function shutdown(signal: string) {
  logger.info(`Signal ${signal} reçu — arrêt en cours...`);

  server.close(async () => {
    try {
      await closeWorkers();
      await prisma.$disconnect();
      logger.info('Connexion PostgreSQL fermée');
      process.exit(0);
    } catch (err) {
      logger.error('Erreur lors de la déconnexion DB', { error: (err as Error).message });
      process.exit(1);
    }
  });

  // Force la fermeture après 10s si des connexions trainent
  setTimeout(() => {
    logger.warn('Forçage de l\'arrêt (timeout 10s)');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

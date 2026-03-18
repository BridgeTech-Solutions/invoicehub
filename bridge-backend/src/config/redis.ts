/**
 * @module config/redis
 * Instance IORedis partagée pour BullMQ (queues et workers).
 *
 * `maxRetriesPerRequest: null` est requis par BullMQ pour les workers
 * afin d'éviter des erreurs de timeout lors du traitement des jobs.
 */
import IORedis from 'ioredis';
import { env } from './env';

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on('error', (err) => {
  console.error('[Redis] Erreur de connexion :', err.message);
});

/**
 * @module lib/socket
 * Initialisation de Socket.io pour les notifications en temps réel.
 *
 * Architecture :
 *  - Chaque utilisateur connecté rejoint sa room privée `user:{userId}`
 *  - L'auth JWT est vérifiée dans le handshake (token dans `auth.token`)
 *  - L'adapter Redis permet le multi-instance (horizontal scaling)
 *
 * Événements émis :
 *  - `notification:new`        — nouvelle notification in-app
 *  - `invoice:status_changed`  — facture émise, payée, annulée
 *  - `proforma:status_changed` — proforma envoyée, acceptée, rejetée
 *  - `dashboard:refresh`       — KPIs modifiés, le frontend doit recharger le dashboard
 */
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import { verifyAccessToken } from './jwt';
import { env } from '../config/env';

let io: Server | null = null;

export function initSocket(httpServer: HttpServer): Server {
  const pubClient = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const subClient = pubClient.duplicate();

  io = new Server(httpServer, {
    cors: { origin: env.APP_URL, credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.adapter(createAdapter(pubClient, subClient));

  // Middleware d'authentification
  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Token manquant'));

      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    socket.on('disconnect', () => {
      socket.leave(`user:${userId}`);
    });
  });

  return io;
}

/** Émet un événement vers un utilisateur spécifique */
export function emitToUser(userId: string, event: string, data: unknown): void {
  io?.to(`user:${userId}`).emit(event, data);
}

/** Émet un événement vers tous les clients connectés */
export function emitToAll(event: string, data: unknown): void {
  io?.emit(event, data);
}

/** Retourne l'instance Socket.io (null si non initialisée) */
export function getIo(): Server | null {
  return io;
}

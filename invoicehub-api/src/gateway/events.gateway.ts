import {
  OnGatewayConnection, OnGatewayDisconnect,
  WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { default as IORedis } from 'ioredis';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config:     ConfigService,
  ) {}

  afterInit(server: Server) {
    const redisUrl  = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const pubClient = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const subClient = pubClient.duplicate();
    server.adapter(createAdapter(pubClient, subClient));

    server.use((socket: Socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) return next(new Error('Token manquant'));
        const payload = this.jwtService.verify<{ sub: string }>(token, {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        });
        socket.data.userId = payload.sub;
        next();
      } catch {
        next(new Error('Token invalide'));
      }
    });
  }

  handleConnection(socket: Socket) {
    const userId = socket.data.userId as string;
    if (userId) socket.join(`user:${userId}`);
  }

  handleDisconnect(socket: Socket) {
    const userId = socket.data.userId as string;
    if (userId) socket.leave(`user:${userId}`);
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToAll(event: string, data: unknown) {
    this.server.emit(event, data);
  }
}

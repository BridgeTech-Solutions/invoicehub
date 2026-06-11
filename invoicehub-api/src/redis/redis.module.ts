import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { default as IORedis } from 'ioredis';
import { REDIS_CLIENT } from '../common/decorators/inject-redis.decorator';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Client Redis de l'application (cache RBAC/JWT, cache dashboard, rate-limit).
        // BullMQ a ses propres connexions → on configure ce client pour « échouer vite
        // et basculer sur la base » plutôt que de bloquer les requêtes quand Redis
        // est momentanément indisponible (ex. WSL qui coupe la connexion à l'inactivité).
        const client = new IORedis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
          maxRetriesPerRequest: 1,     // pas de ré-essai infini (≠ BullMQ qui exige null)
          enableOfflineQueue: false,   // déconnecté → échec immédiat → fallback DB dans le catch
          commandTimeout: 2000,        // une commande ne bloque jamais plus de 2 s
          connectTimeout: 3000,
          keepAlive: 30000,            // sondes TCP → évite que la connexion tombe à l'inactivité
          retryStrategy: (times) => Math.min(times * 200, 2000), // reconnexion rapide
        });
        // Sans écouteur 'error', une erreur de connexion Redis ferait planter le process.
        // On log et on avale : le cache est non-critique (fallback DB partout).
        client.on('error', (err) => {
          console.error('[redis] connection error:', err?.message ?? err);
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

import { env } from './config/env';
import { logger } from './utils/logger';
import { runMigrations } from './db/migrate';
import { closePool } from './db/pool';
import { closeRedis } from './redis/client';
import { buildApp } from './api/routes';
import { RealtimeServer } from './websocket/server';

async function main(): Promise<void> {
  logger.info({ serverId: env.SERVER_ID, region: env.SERVER_REGION }, 'Starting NebulaRealtime...');

  // Run database migrations
  await runMigrations();

  // Start REST API server
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT }, 'REST API server started');

  // Start WebSocket server
  const wsServer = new RealtimeServer();
  await wsServer.start();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    await wsServer.stop();
    await app.close();
    await closeRedis();
    await closePool();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start NebulaRealtime');
  process.exit(1);
});

import { env } from './config/env';
import { logger } from './utils/logger';
import { closePool } from './db/pool';
import { closeRedis } from './redis/client';
import {
  createMatchHistoryWorker,
  createLeaderboardWorker,
  createAnalyticsWorker,
  scheduleRecurringJobs,
} from './jobs/workers';

async function main(): Promise<void> {
  logger.info('Starting NebulaRealtime Worker Service...');

  // Create workers
  const matchHistoryWorker = createMatchHistoryWorker();
  const leaderboardWorker = createLeaderboardWorker();
  const analyticsWorker = createAnalyticsWorker();

  // Schedule recurring jobs
  await scheduleRecurringJobs();

  logger.info('All workers started');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down workers...');
    await matchHistoryWorker.close();
    await leaderboardWorker.close();
    await analyticsWorker.close();
    await closeRedis();
    await closePool();
    logger.info('Worker shutdown complete');
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
  logger.fatal({ err }, 'Failed to start workers');
  process.exit(1);
});

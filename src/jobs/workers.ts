import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import { persistLeaderboard } from '../leaderboard/leaderboardService';
import { query } from '../db/pool';
import { jobsProcessedCounter, jobDurationHistogram } from '../metrics/metrics';

const connection = {
  host: redis.options.host || 'localhost',
  port: redis.options.port || 6379,
  password: redis.options.password || undefined,
  maxRetriesPerRequest: null,
};

// Define queues
export const matchHistoryQueue = new Queue('match-history', { connection });
export const leaderboardQueue = new Queue('leaderboard-sync', { connection });
export const analyticsQueue = new Queue('analytics', { connection });

// Match history worker
export function createMatchHistoryWorker(): Worker {
  const worker = new Worker(
    'match-history',
    async (job: Job) => {
      const { matchId, winnerId, loserId, region, duration } = job.data;
      logger.info({ matchId, jobId: job.id }, 'Processing match history job');

      // Match already stored during game creation, update with final metadata
      await query(
        `UPDATE matches SET metadata = metadata || $1 WHERE id = $2`,
        [JSON.stringify({ processedAt: Date.now(), duration }), matchId]
      );
    },
    {
      connection,
      concurrency: 5,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    }
  );

  setupWorkerEvents(worker, 'match-history');
  return worker;
}

// Leaderboard sync worker
export function createLeaderboardWorker(): Worker {
  const worker = new Worker(
    'leaderboard-sync',
    async (job: Job) => {
      logger.info({ jobId: job.id }, 'Syncing leaderboard to PostgreSQL');
      await persistLeaderboard();
    },
    {
      connection,
      concurrency: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    }
  );

  setupWorkerEvents(worker, 'leaderboard-sync');
  return worker;
}

// Analytics worker
export function createAnalyticsWorker(): Worker {
  const worker = new Worker(
    'analytics',
    async (job: Job) => {
      const { type, data } = job.data;
      logger.info({ type, jobId: job.id }, 'Processing analytics job');

      switch (type) {
        case 'player_session':
          // Example: track session duration
          logger.debug({ data }, 'Player session analytics');
          break;
        case 'match_analytics':
          logger.debug({ data }, 'Match analytics');
          break;
        default:
          logger.warn({ type }, 'Unknown analytics job type');
      }
    },
    {
      connection,
      concurrency: 3,
      removeOnComplete: { count: 5000 },
      removeOnFail: { count: 5000 },
    }
  );

  setupWorkerEvents(worker, 'analytics');
  return worker;
}

function setupWorkerEvents(worker: Worker, queueName: string): void {
  worker.on('completed', (job) => {
    jobsProcessedCounter.labels({ queue: queueName, status: 'completed' }).inc();
    logger.debug({ queue: queueName, jobId: job?.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    jobsProcessedCounter.labels({ queue: queueName, status: 'failed' }).inc();
    logger.error({ queue: queueName, jobId: job?.id, err }, 'Job failed');
  });

  worker.on('error', (err) => {
    logger.error({ queue: queueName, err }, 'Worker error');
  });
}

// Scheduled jobs
export async function scheduleRecurringJobs(): Promise<void> {
  // Sync leaderboard every 5 minutes
  await leaderboardQueue.add(
    'periodic-sync',
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      removeOnComplete: true,
    }
  );

  logger.info('Recurring jobs scheduled');
}

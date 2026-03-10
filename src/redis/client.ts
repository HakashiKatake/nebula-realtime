import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

function createRedisClient(name: string): Redis {
  const client = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  client.on('connect', () => logger.info({ name }, 'Redis connected'));
  client.on('error', (err) => logger.error({ name, err }, 'Redis error'));
  client.on('close', () => logger.warn({ name }, 'Redis connection closed'));

  return client;
}

// Main Redis client for general operations
export const redis = createRedisClient('main');

// Dedicated pub/sub subscriber client (cannot share with commands)
export const redisSub = createRedisClient('subscriber');

// Dedicated pub/sub publisher client
export const redisPub = createRedisClient('publisher');

export async function closeRedis(): Promise<void> {
  await Promise.all([redis.quit(), redisSub.quit(), redisPub.quit()]);
  logger.info('All Redis connections closed');
}

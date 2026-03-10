import { redis } from './client';
import { logger } from '../utils/logger';

export async function acquireLock(
  key: string,
  ttlMs: number = 3000,
  retries: number = 3,
  retryDelayMs: number = 200
): Promise<string | null> {
  const lockValue = `${process.pid}-${Date.now()}`;

  for (let i = 0; i < retries; i++) {
    const result = await redis.set(key, lockValue, 'PX', ttlMs, 'NX');
    if (result === 'OK') {
      logger.debug({ key, lockValue }, 'Lock acquired');
      return lockValue;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  logger.warn({ key }, 'Failed to acquire lock');
  return null;
}

export async function releaseLock(key: string, lockValue: string): Promise<boolean> {
  // Lua script: only release if the lock value matches (prevents releasing someone else's lock)
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, key, lockValue);
  const released = result === 1;
  if (released) {
    logger.debug({ key }, 'Lock released');
  }
  return released;
}

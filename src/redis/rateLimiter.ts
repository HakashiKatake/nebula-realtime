import { redis } from './client';
import { RateLimitError } from '../utils/errors';

/**
 * Sliding window rate limiter using Redis.
 * Returns remaining requests count. Throws RateLimitError if exceeded.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<number> {
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();
  // Remove expired entries
  pipeline.zremrangebyscore(key, 0, windowStart);
  // Add current request
  pipeline.zadd(key, now.toString(), `${now}-${Math.random()}`);
  // Count requests in window
  pipeline.zcard(key);
  // Set expiry on the key
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) || 0;

  if (count > maxRequests) {
    throw new RateLimitError(`Rate limit exceeded: ${maxRequests} requests per ${windowMs}ms`);
  }

  return maxRequests - count;
}

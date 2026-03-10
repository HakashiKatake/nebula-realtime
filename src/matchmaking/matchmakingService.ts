import { redis } from '../redis/client';
import { acquireLock, releaseLock } from '../redis/lock';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { matchmakingQueueGauge, matchesCreatedCounter } from '../metrics/metrics';
import { v4 as uuidv4 } from 'uuid';

export interface QueueEntry {
  userId: string;
  username: string;
  rating: number;
  region: string;
  joinedAt: number;
}

export interface MatchResult {
  matchId: string;
  players: QueueEntry[];
  region: string;
}

const QUEUE_KEY_PREFIX = 'matchmaking:queue:';
const PLAYER_KEY_PREFIX = 'matchmaking:player:';
const MATCH_SIZE = 2;

export async function joinQueue(entry: QueueEntry): Promise<void> {
  const queueKey = `${QUEUE_KEY_PREFIX}${entry.region}`;
  const playerKey = `${PLAYER_KEY_PREFIX}${entry.userId}`;

  // Check if already in queue
  const existing = await redis.get(playerKey);
  if (existing) {
    logger.warn({ userId: entry.userId }, 'Player already in matchmaking queue');
    return;
  }

  // Add to sorted set keyed by rating for efficient matching
  await redis.zadd(queueKey, entry.rating, JSON.stringify(entry));
  await redis.set(playerKey, JSON.stringify(entry), 'PX', env.MATCHMAKING_TIMEOUT_MS);

  matchmakingQueueGauge.labels({ region: entry.region }).inc();
  logger.info({ userId: entry.userId, rating: entry.rating, region: entry.region }, 'Player joined queue');
}

export async function leaveQueue(userId: string, region: string): Promise<void> {
  const queueKey = `${QUEUE_KEY_PREFIX}${region}`;
  const playerKey = `${PLAYER_KEY_PREFIX}${userId}`;

  // Find and remove the player entry from the sorted set
  const members = await redis.zrange(queueKey, 0, -1);
  for (const member of members) {
    const parsed: QueueEntry = JSON.parse(member);
    if (parsed.userId === userId) {
      await redis.zrem(queueKey, member);
      break;
    }
  }
  await redis.del(playerKey);

  matchmakingQueueGauge.labels({ region }).dec();
  logger.info({ userId, region }, 'Player left queue');
}

export async function processMatchmaking(region: string): Promise<MatchResult | null> {
  const lockKey = `lock:matchmaking:${region}`;
  const lockValue = await acquireLock(lockKey, 5000);
  if (!lockValue) return null;

  try {
    const queueKey = `${QUEUE_KEY_PREFIX}${region}`;
    const queueSize = await redis.zcard(queueKey);

    if (queueSize < MATCH_SIZE) return null;

    // Get all players sorted by rating, keeping raw member strings for exact removal
    const rawMembers = await redis.zrange(queueKey, 0, -1, 'WITHSCORES');

    const players: { entry: QueueEntry; raw: string }[] = [];
    for (let i = 0; i < rawMembers.length; i += 2) {
      const raw = rawMembers[i];
      const entry: QueueEntry = JSON.parse(raw);
      players.push({ entry, raw });
    }

    // Find best pair within rating range
    for (let i = 0; i < players.length - 1; i++) {
      const p1 = players[i];
      const p2 = players[i + 1];

      const ratingDiff = Math.abs(p1.entry.rating - p2.entry.rating);

      // Check timeout — expand range for waiting players
      const p1WaitTime = Date.now() - p1.entry.joinedAt;
      const p2WaitTime = Date.now() - p2.entry.joinedAt;
      const maxWait = Math.max(p1WaitTime, p2WaitTime);
      const expandedRange = env.MATCHMAKING_RATING_RANGE + Math.floor(maxWait / 5000) * 50;

      if (ratingDiff <= expandedRange) {
        // Remove matched players using the exact raw strings from Redis
        await redis.zrem(queueKey, p1.raw, p2.raw);

        await redis.del(`${PLAYER_KEY_PREFIX}${p1.entry.userId}`);
        await redis.del(`${PLAYER_KEY_PREFIX}${p2.entry.userId}`);

        matchmakingQueueGauge.labels({ region }).dec(2);

        const matchId = uuidv4();
        const match: MatchResult = {
          matchId,
          players: [p1.entry, p2.entry],
          region,
        };

        matchesCreatedCounter.labels({ region }).inc();
        logger.info({ matchId, players: [p1.entry.userId, p2.entry.userId], region }, 'Match created');

        return match;
      }
    }

    return null;
  } finally {
    await releaseLock(lockKey, lockValue);
  }
}

export async function getQueueSize(region: string): Promise<number> {
  const queueKey = `${QUEUE_KEY_PREFIX}${region}`;
  return redis.zcard(queueKey);
}

export async function isPlayerInQueue(userId: string): Promise<boolean> {
  const playerKey = `${PLAYER_KEY_PREFIX}${userId}`;
  const result = await redis.get(playerKey);
  return result !== null;
}

import { redis } from '../redis/client';
import { query, transaction } from '../db/pool';
import { logger } from '../utils/logger';

const LEADERBOARD_KEY = 'leaderboard:global';
const REGIONAL_PREFIX = 'leaderboard:';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  score: number;
  rank: number;
}

export async function updateScore(
  userId: string,
  username: string,
  scoreDelta: number,
  region: string
): Promise<void> {
  // Update global leaderboard (Redis sorted set)
  await redis.zincrby(LEADERBOARD_KEY, scoreDelta, userId);
  // Update regional leaderboard
  await redis.zincrby(`${REGIONAL_PREFIX}${region}`, scoreDelta, userId);

  // Store username mapping for display
  await redis.hset('leaderboard:usernames', userId, username);

  logger.debug({ userId, scoreDelta }, 'Leaderboard score updated');
}

export async function getTopPlayers(
  limit: number = 10,
  region?: string
): Promise<LeaderboardEntry[]> {
  const key = region ? `${REGIONAL_PREFIX}${region}` : LEADERBOARD_KEY;
  const results = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');

  // Collect all user IDs first
  const userIds: string[] = [];
  for (let i = 0; i < results.length; i += 2) {
    userIds.push(results[i]);
  }

  if (userIds.length === 0) return [];

  // Batch fetch all usernames in one HMGET call instead of N individual HGET calls
  const usernames = await redis.hmget('leaderboard:usernames', ...userIds);

  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < results.length; i += 2) {
    const userId = results[i];
    const score = parseInt(results[i + 1], 10);
    const idx = Math.floor(i / 2);
    entries.push({
      userId,
      username: usernames[idx] || 'Unknown',
      score,
      rank: idx + 1,
    });
  }

  return entries;
}

export async function getPlayerRank(
  userId: string,
  region?: string
): Promise<{ rank: number; score: number } | null> {
  const key = region ? `${REGIONAL_PREFIX}${region}` : LEADERBOARD_KEY;
  const rank = await redis.zrevrank(key, userId);
  if (rank === null) return null;

  const score = await redis.zscore(key, userId);
  return { rank: rank + 1, score: parseInt(score || '0', 10) };
}

export async function persistLeaderboard(): Promise<void> {
  const entries = await getTopPlayers(1000);

  if (entries.length === 0) return;

  // Batch persist in a single transaction instead of N individual UPDATE queries
  await transaction(async (client) => {
    for (const entry of entries) {
      await client.query(
        `UPDATE leaderboard SET score = $1, updated_at = NOW() WHERE user_id = $2`,
        [entry.score, entry.userId]
      );
    }
  });

  logger.info({ count: entries.length }, 'Leaderboard persisted to PostgreSQL');
}

export async function recordMatchResult(
  winnerId: string,
  loserId: string,
  winnerUsername: string,
  loserUsername: string,
  region: string
): Promise<void> {
  const winScore = 25;
  const loseScore = -15;

  await updateScore(winnerId, winnerUsername, winScore, region);
  await updateScore(loserId, loserUsername, loseScore, region);

  // Update win/loss counts in PostgreSQL
  await query(
    `UPDATE leaderboard SET wins = wins + 1, updated_at = NOW() WHERE user_id = $1`,
    [winnerId]
  );
  await query(
    `UPDATE leaderboard SET losses = losses + 1, updated_at = NOW() WHERE user_id = $1`,
    [loserId]
  );

  // Update user ratings
  await query('UPDATE users SET rating = rating + $1 WHERE id = $2', [winScore, winnerId]);
  await query('UPDATE users SET rating = rating + $1 WHERE id = $2', [loseScore, loserId]);

  logger.info({ winnerId, loserId, winScore, loseScore }, 'Match result recorded');
}

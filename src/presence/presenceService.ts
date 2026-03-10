import { redis } from '../redis/client';
import { redisPub } from '../redis/client';
import { logger } from '../utils/logger';
import { activePlayersGauge } from '../metrics/metrics';

export type PresenceStatus = 'online' | 'offline' | 'in_queue' | 'in_match' | 'spectating';

const PRESENCE_TTL = 120; // seconds

export async function setPresence(
  userId: string,
  status: PresenceStatus,
  serverId: string
): Promise<void> {
  const key = `presence:${userId}`;
  const data = JSON.stringify({ status, serverId, updatedAt: Date.now() });
  await redis.set(key, data, 'EX', PRESENCE_TTL);

  // Publish presence update for cross-server awareness
  await redisPub.publish('presence:updates', JSON.stringify({ userId, status, serverId }));

  activePlayersGauge.labels({ status }).inc();
  logger.debug({ userId, status, serverId }, 'Presence updated');
}

export async function getPresence(
  userId: string
): Promise<{ status: PresenceStatus; serverId: string; updatedAt: number } | null> {
  const key = `presence:${userId}`;
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data);
}

export async function removePresence(userId: string): Promise<void> {
  const key = `presence:${userId}`;
  const existing = await getPresence(userId);
  await redis.del(key);

  if (existing) {
    activePlayersGauge.labels({ status: existing.status }).dec();
  }

  await redisPub.publish(
    'presence:updates',
    JSON.stringify({ userId, status: 'offline', serverId: null })
  );

  logger.debug({ userId }, 'Presence removed');
}

export async function refreshPresenceTTL(userId: string): Promise<void> {
  const key = `presence:${userId}`;
  await redis.expire(key, PRESENCE_TTL);
}

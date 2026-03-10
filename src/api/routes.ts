import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { registry } from '../metrics/metrics';
import { z } from 'zod';
import { signup, login, refreshAccessToken, verifyAccessToken } from '../auth/authService';
import { getPresence } from '../presence/presenceService';
import { getTopPlayers, getPlayerRank } from '../leaderboard/leaderboardService';
import { getQueueSize } from '../matchmaking/matchmakingService';
import { query } from '../db/pool';
import { checkRateLimit } from '../redis/rateLimiter';

// Validation schemas
const signupSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  region: z.enum(['us-east', 'eu-west', 'asia']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // We use pino directly
    trustProxy: true,
  });

  await app.register(cors, { origin: true });

  // Serve dashboard static files
  const publicDir = path.join(process.cwd(), 'public');
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: error.message,
        statusCode: error.statusCode,
      });
    } else {
      logger.error({ err: error, url: request.url }, 'Unhandled error');
      reply.status(500).send({ error: 'Internal Server Error', statusCode: 500 });
    }
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    serverId: env.SERVER_ID,
    region: env.SERVER_REGION,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  // Metrics endpoint
  app.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  // =============== AUTH ROUTES ===============

  app.post('/auth/signup', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = signupSchema.parse(request.body);
    await checkRateLimit(`ratelimit:signup:${request.ip}`, 100, 60000);
    const result = await signup(body.username, body.email, body.password, body.region);
    reply.status(201).send(result);
  });

  app.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);
    await checkRateLimit(`ratelimit:login:${request.ip}`, 100, 60000);
    const result = await login(body.email, body.password);
    return result;
  });

  app.post('/auth/refresh', async (request: FastifyRequest) => {
    const body = refreshSchema.parse(request.body);
    const tokens = await refreshAccessToken(body.refreshToken);
    return tokens;
  });

  // =============== PROFILE ROUTES ===============

  app.get('/profile', async (request: FastifyRequest) => {
    const user = authenticate(request);
    const [profile] = await query(
      'SELECT id, username, email, rating, region, created_at FROM users WHERE id = $1',
      [user.userId]
    );
    if (!profile) throw new AppError('User not found', 404);

    const rank = await getPlayerRank(user.userId);
    return { ...profile, rank };
  });

  // =============== PRESENCE ROUTE ===============

  app.get('/presence/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    const { id } = request.params;
    const presence = await getPresence(id);
    if (!presence) {
      return { userId: id, status: 'offline' };
    }
    return { userId: id, ...presence };
  });

  // =============== LEADERBOARD ROUTES ===============

  app.get('/leaderboard', async (request: FastifyRequest) => {
    const { limit, region } = request.query as { limit?: string; region?: string };
    const top = await getTopPlayers(parseInt(limit || '10', 10), region);
    return { leaderboard: top };
  });

  // =============== MATCH HISTORY ROUTES ===============

  app.get('/match-history', async (request: FastifyRequest) => {
    const user = authenticate(request);
    const matches = await query(
      `SELECT id, region, status, player_ids, winner_id, started_at, ended_at
       FROM matches WHERE $1 = ANY(player_ids)
       ORDER BY started_at DESC LIMIT 20`,
      [user.userId]
    );
    return { matches };
  });

  // =============== REPLAY ROUTE ===============

  app.get('/matches/:id/replay', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    const { id } = request.params;
    const [match] = await query(
      'SELECT id, region, status, player_ids, winner_id, started_at, ended_at FROM matches WHERE id = $1',
      [id]
    );
    if (!match) throw new AppError('Match not found', 404);

    const events = await query(
      'SELECT tick, player_id, action, data, created_at FROM match_events WHERE match_id = $1 ORDER BY tick ASC',
      [id]
    );

    return { match, events };
  });

  // =============== MATCHMAKING STATUS ===============

  app.get('/matchmaking/status', async () => {
    const regions = ['us-east', 'eu-west', 'asia'];
    const status: Record<string, number> = {};
    for (const region of regions) {
      status[region] = await getQueueSize(region);
    }
    return { queues: status };
  });

  return app;
}

function authenticate(request: FastifyRequest): { userId: string; username: string; region: string } {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('Authorization header required', 401);
  }
  const token = authHeader.slice(7);
  return verifyAccessToken(token);
}

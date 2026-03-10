import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  WS_PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),

  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_DB: z.string().default('nebula_realtime'),
  POSTGRES_USER: z.string().default('nebula'),
  POSTGRES_PASSWORD: z.string().default('nebula_secret'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().default(''),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  MATCHMAKING_INTERVAL_MS: z.coerce.number().default(2000),
  MATCHMAKING_RATING_RANGE: z.coerce.number().default(200),
  MATCHMAKING_TIMEOUT_MS: z.coerce.number().default(30000),

  SERVER_REGION: z.string().default('us-east'),
  SERVER_ID: z.string().default('ws-1'),

  METRICS_ENABLED: z.coerce.boolean().default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

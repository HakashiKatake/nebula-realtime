import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { query, transaction } from '../db/pool';
import { AuthError, ConflictError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

const SALT_ROUNDS = 12;

export interface User {
  id: string;
  username: string;
  email: string;
  rating: number;
  region: string;
  created_at: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  username: string;
  region: string;
}

export async function signup(
  username: string,
  email: string,
  password: string,
  region: string = 'us-east'
): Promise<{ user: User; tokens: TokenPair }> {
  // Check existing
  const [existing] = await query<{ id: string }>(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );
  if (existing) {
    throw new ConflictError('Username or email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const [user] = await query<User>(
    `INSERT INTO users (username, email, password_hash, region)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, rating, region, created_at`,
    [username, email, passwordHash, region]
  );

  const tokens = await generateTokenPair(user);

  // Initialize leaderboard entry
  await query(
    `INSERT INTO leaderboard (user_id, username, region) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id, user.username, user.region]
  );

  logger.info({ userId: user.id, username }, 'User registered');
  return { user, tokens };
}

export async function login(
  email: string,
  password: string
): Promise<{ user: User; tokens: TokenPair }> {
  const [row] = await query<User & { password_hash: string }>(
    'SELECT id, username, email, password_hash, rating, region, created_at FROM users WHERE email = $1',
    [email]
  );

  if (!row) {
    throw new AuthError('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    throw new AuthError('Invalid credentials');
  }

  const user: User = {
    id: row.id,
    username: row.username,
    email: row.email,
    rating: row.rating,
    region: row.region,
    created_at: row.created_at,
  };

  const tokens = await generateTokenPair(user);

  logger.info({ userId: user.id }, 'User logged in');
  return { user, tokens };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    throw new AuthError('Invalid refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const [stored] = await query<{ id: string; revoked: boolean }>(
    'SELECT id, revoked FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2',
    [tokenHash, payload.userId]
  );

  if (!stored || stored.revoked) {
    throw new AuthError('Refresh token revoked or not found');
  }

  // Rotate: revoke old token, generate new pair
  const [user] = await query<User>(
    'SELECT id, username, email, rating, region, created_at FROM users WHERE id = $1',
    [payload.userId]
  );

  if (!user) {
    throw new AuthError('User not found');
  }

  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [stored.id]);

  return generateTokenPair(user);
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new AuthError('Invalid or expired access token');
  }
}

async function generateTokenPair(user: User): Promise<TokenPair> {
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    region: user.region,
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: parseExpiry(env.JWT_EXPIRES_IN) / 1000,
  });

  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: parseExpiry(env.JWT_REFRESH_EXPIRES_IN) / 1000,
  });

  // Store refresh token hash
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseExpiry(env.JWT_REFRESH_EXPIRES_IN));
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, tokenHash, expiresAt]
  );

  return { accessToken, refreshToken };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const val = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 60 * 60 * 1000;
    case 'd': return val * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

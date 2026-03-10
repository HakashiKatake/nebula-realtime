import { Pool, PoolClient } from 'pg';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug({ query: text, duration, rows: result.rowCount }, 'pg query');
  return result.rows as T[];
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('PostgreSQL pool closed');
}

export { pool };

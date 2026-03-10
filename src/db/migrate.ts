import { query, getClient } from './pool';
import { logger } from '../utils/logger';

// Advisory lock ID for migration exclusivity across multiple instances
const MIGRATION_LOCK_ID = 839274;

const migrations = [
  {
    name: '001_create_users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        rating INTEGER DEFAULT 1000,
        region VARCHAR(20) DEFAULT 'us-east',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating);
    `,
  },
  {
    name: '002_create_refresh_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        revoked BOOLEAN DEFAULT FALSE
      );

      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    `,
  },
  {
    name: '003_create_matches',
    sql: `
      CREATE TABLE IF NOT EXISTS matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        region VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'in_progress',
        player_ids UUID[] NOT NULL,
        winner_id UUID,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
      CREATE INDEX IF NOT EXISTS idx_matches_region ON matches(region);
      CREATE INDEX IF NOT EXISTS idx_matches_started ON matches(started_at);
    `,
  },
  {
    name: '004_create_match_events',
    sql: `
      CREATE TABLE IF NOT EXISTS match_events (
        id BIGSERIAL PRIMARY KEY,
        match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        tick INTEGER NOT NULL,
        player_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        data JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events(match_id);
      CREATE INDEX IF NOT EXISTS idx_match_events_tick ON match_events(match_id, tick);
    `,
  },
  {
    name: '005_create_leaderboard',
    sql: `
      CREATE TABLE IF NOT EXISTS leaderboard (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username VARCHAR(50) NOT NULL,
        score INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        region VARCHAR(20) DEFAULT 'us-east',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard(user_id);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_region ON leaderboard(region);
    `,
  },
  {
    name: '006_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
];

export async function runMigrations(): Promise<void> {
  // Acquire exclusive advisory lock so only one instance runs migrations at a time
  const client = await getClient();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    logger.info('Migration advisory lock acquired');

    // Ensure migrations table exists first
    await client.query(migrations.find((m) => m.name === '006_create_migrations_table')!.sql);

    for (const migration of migrations) {
      if (migration.name === '006_create_migrations_table') continue;

      const result = await client.query(
        'SELECT name FROM migrations WHERE name = $1',
        [migration.name]
      );

      if (result.rows.length === 0) {
        logger.info({ migration: migration.name }, 'Running migration');
        await client.query(migration.sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [migration.name]);
        logger.info({ migration: migration.name }, 'Migration completed');
      }
    }

    logger.info('All migrations up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    client.release();
    logger.info('Migration advisory lock released');
  }
}

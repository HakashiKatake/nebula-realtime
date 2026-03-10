import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

// WebSocket metrics
export const wsConnectionsGauge = new Gauge({
  name: 'nebula_ws_active_connections',
  help: 'Number of active WebSocket connections',
  labelNames: ['region', 'server_id'],
  registers: [registry],
});

export const wsMessagesCounter = new Counter({
  name: 'nebula_ws_messages_total',
  help: 'Total WebSocket messages processed',
  labelNames: ['type', 'direction'],
  registers: [registry],
});

export const wsMessageLatency = new Histogram({
  name: 'nebula_ws_message_latency_ms',
  help: 'WebSocket message processing latency in milliseconds',
  buckets: [1, 5, 10, 25, 50, 100, 250, 500],
  registers: [registry],
});

// Matchmaking metrics
export const matchmakingQueueGauge = new Gauge({
  name: 'nebula_matchmaking_queue_size',
  help: 'Number of players in matchmaking queue',
  labelNames: ['region'],
  registers: [registry],
});

export const matchesCreatedCounter = new Counter({
  name: 'nebula_matches_created_total',
  help: 'Total matches created',
  labelNames: ['region'],
  registers: [registry],
});

// Auth metrics
export const authRequestsCounter = new Counter({
  name: 'nebula_auth_requests_total',
  help: 'Total authentication requests',
  labelNames: ['type', 'status'],
  registers: [registry],
});

// Player metrics
export const activePlayersGauge = new Gauge({
  name: 'nebula_active_players',
  help: 'Number of active players',
  labelNames: ['status'],
  registers: [registry],
});

// Worker metrics
export const jobsProcessedCounter = new Counter({
  name: 'nebula_jobs_processed_total',
  help: 'Total background jobs processed',
  labelNames: ['queue', 'status'],
  registers: [registry],
});

export const jobDurationHistogram = new Histogram({
  name: 'nebula_job_duration_ms',
  help: 'Background job processing duration in milliseconds',
  labelNames: ['queue'],
  buckets: [10, 50, 100, 500, 1000, 5000],
  registers: [registry],
});

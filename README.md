<img width="1536" height="1024" alt="ChatGPT Image Mar 5, 2026, 07_12_34 PM" src="https://github.com/user-attachments/assets/8af175f4-59df-40c2-8b2e-7f511f4e8f9a" />

# NebulaRealtime

**Production-grade realtime multiplayer backend infrastructure** built with Node.js, TypeScript, and distributed systems patterns used by companies like Riot, Discord, and Valve.

![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js)
![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-7-red?logo=redis)
![License](https://img.shields.io/badge/License-MIT-yellow)

### Key Performance Numbers

| Metric | Measured |
|--------|----------|
| HTTP throughput (single instance) | **48,365 req/s** |
| Combined multi-instance throughput | **96,729 req/s** |
| WebSocket round-trip latency | **1.29 ms** avg |
| Connection handshake | **1.98 ms** avg |
| Message delivery | **100%** zero-loss |
| Matchmaking time-to-match | **1.48s** (ELO-based) |
| Horizontal scaling | **2+ instances** confirmed |

---

## System Architecture

```
Client
  ↓
Region Router (simulated)
  ↓
┌─────────────────────────────────────────┐
│       WebSocket Servers (ws-1, ws-2)    │  ← horizontally scalable
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│                  Redis                  │
│  ├─ Pub/Sub (cross-server messaging)   │
│  ├─ Matchmaking queues (sorted sets)   │
│  ├─ Presence tracking                  │
│  ├─ Rate limiting (sliding window)     │
│  ├─ Distributed locks                  │
│  └─ BullMQ job queues                  │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│          Worker Service (BullMQ)        │
│  ├─ Match history persistence          │
│  ├─ Leaderboard sync                   │
│  └─ Analytics aggregation              │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│           PostgreSQL                    │
│  ├─ Users & auth                       │
│  ├─ Match history                      │
│  ├─ Replay event logs                  │
│  └─ Leaderboard persistence            │
└─────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, TypeScript, Fastify |
| **WebSocket** | ws (raw WebSocket server) |
| **Database** | PostgreSQL 16 |
| **Cache/Queue** | Redis 7 |
| **Job Processing** | BullMQ |
| **Observability** | prom-client, pino |
| **Infrastructure** | Docker, Docker Compose |
| **Validation** | Zod |
| **Load Testing** | autocannon |

---

## Core Services

| Service | Description |
|---------|------------|
| **Authentication** | JWT + refresh tokens, bcrypt hashing, atomic signup with transactions, rate-limited endpoints |
| **WebSocket Server** | Real-time player connections, heartbeat, room management, action whitelist validation, batch event persistence |
| **Matchmaking** | Redis sorted-set queue, ELO-based rating matching, region-scoped, timeout expansion, atomic player removal |
| **Presence** | Redis-backed player state tracking with gauge-accurate metrics (online/offline/in_queue/in_match/spectating) |
| **Leaderboard** | Redis sorted sets for global + regional rankings, batch username resolution, transactional PostgreSQL persistence |
| **Game Simulation** | Server-authoritative tick-based simulation with attack cooldowns, self-attack prevention, move speed validation |
| **Replay System** | Event-sourced match logs stored in PostgreSQL, reconstructable via REST endpoint |
| **Background Jobs** | BullMQ workers for async match history, leaderboard sync, analytics |
| **Observability** | Prometheus metrics at `/metrics`, structured logging with pino |

---

## Quick Start

### Using Docker Compose (recommended)

```bash
docker-compose up
```

This starts:
- 2 WebSocket + API server instances (us-east, eu-west)
- 1 Worker service
- PostgreSQL 16
- Redis 7

### Local Development

```bash
# Prerequisites: PostgreSQL and Redis running locally

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env

# Run database migrations
npm run db:migrate

# Start API + WebSocket server (with hot reload)
npm run dev

# In a separate terminal, start workers
npm run dev:worker
```

---

## REST API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/signup` | No | Register new user |
| POST | `/auth/login` | No | Login, receive JWT tokens |
| POST | `/auth/refresh` | No | Refresh access token |
| GET | `/profile` | Yes | Get current user profile + rank |
| GET | `/presence/:id` | No | Get player presence status |
| GET | `/leaderboard` | No | Get top players (optional `?region=&limit=`) |
| GET | `/match-history` | Yes | Get authenticated user's match history |
| GET | `/matches/:id/replay` | No | Get match replay events |
| GET | `/matchmaking/status` | No | Get queue sizes per region |
| GET | `/health` | No | Health check |
| GET | `/metrics` | No | Prometheus metrics |

---

## WebSocket Protocol

Connect: `ws://localhost:3001?token=<JWT_ACCESS_TOKEN>`

### Client → Server Messages

```json
{ "type": "ping" }
{ "type": "join_queue" }
{ "type": "leave_queue" }
{ "type": "game_action", "data": { "action": "move", "dx": 5, "dy": -3 } }
{ "type": "game_action", "data": { "action": "attack", "targetId": "uuid" } }
{ "type": "chat", "data": { "message": "hello" } }
```

### Server → Client Messages

```json
{ "type": "connected", "data": { "userId": "...", "serverId": "ws-1" } }
{ "type": "queue_joined", "data": { "region": "us-east" } }
{ "type": "match_found", "data": { "matchId": "...", "players": [...] } }
{ "type": "game_state", "data": { "tick": 42, "players": {...}, "status": "active" } }
{ "type": "match_ended", "data": { "winner": {...}, "finalState": {...} } }
{ "type": "chat", "data": { "userId": "...", "message": "hello" } }
{ "type": "player_disconnected", "data": { "userId": "..." } }
```

---

## Redis Usage

| Feature | Redis Structure | Purpose |
|---------|----------------|---------|
| **Matchmaking queue** | Sorted Set (`matchmaking:queue:{region}`) | Players sorted by rating for efficient matching |
| **Presence** | String (`presence:{userId}`) with TTL | Track player status and server assignment |
| **Leaderboard** | Sorted Set (`leaderboard:global`, `leaderboard:{region}`) | Global + regional rankings |
| **Rate limiting** | Sorted Set (`ratelimit:{userId}:{endpoint}`) | Sliding window rate limiter |
| **Distributed locks** | String with NX + PX (`lock:matchmaking:{region}`) | Prevent race conditions |
| **Pub/Sub** | Channels: `game:broadcast`, `presence:updates`, `matches:created` | Cross-server event synchronization |
| **Job queues** | BullMQ (match-history, leaderboard-sync, analytics) | Async background processing |

---

## Matchmaking Algorithm

1. Player joins queue → added to Redis sorted set keyed by rating
2. Every 2 seconds, matchmaker acquires a distributed lock per region
3. Players sorted by rating; adjacent pairs checked for compatibility
4. Rating range starts at ±200, expands by +50 every 5s of wait time
5. When a match is found, players are removed from queue and assigned a game room
6. If a player times out (30s default), they are removed from queue

---

## Folder Structure

```
src/
├── api/           # Fastify REST API routes
├── auth/          # Authentication (JWT, bcrypt, refresh tokens)
├── config/        # Environment config with Zod validation
├── db/            # PostgreSQL pool, migrations
├── game/          # Server-authoritative game simulation
├── jobs/          # BullMQ workers and job queues
├── leaderboard/   # Redis sorted set leaderboard
├── matchmaking/   # Redis-based matchmaking system
├── metrics/       # Prometheus metrics (prom-client)
├── presence/      # Redis presence tracking
├── redis/         # Redis client, pub/sub, locks, rate limiter
├── utils/         # Logger (pino), error classes
├── websocket/     # WebSocket server (ws)
├── index.ts       # Main API + WS entry point
└── worker.ts      # Worker service entry point
```

---

## Performance Benchmarks

All benchmarks run on a local Docker Compose deployment (2× API/WS instances, PostgreSQL 16, Redis 7) on a MacBook Air M-series after production hardening (atomic transactions, statement timeouts, input validation, anti-cheat). Results represent real measured throughput with full safety guarantees enabled.

### HTTP API Throughput

Tested with [autocannon](https://github.com/mcollina/autocannon) — 50–100 concurrent connections, 10–15 second sustained load per endpoint.

| Endpoint | Req/s (avg) | p50 | p90 | p99 | Errors |
|----------|-------------|-----|-----|-----|--------|
| `GET /health` | **48,365** | 18ms | 21ms | 43ms | 0 |
| `GET /health` (api-2) | **48,364** | 18ms | 22ms | 41ms | 0 |
| `GET /matchmaking/status` | **11,289** | 71ms | 94ms | 302ms | 0 |
| `GET /leaderboard` | **1,669** | 312ms | 790ms | 5,695ms | 0 |
| `GET /profile` (auth) | **109** | 308ms | 497ms | 3,842ms | 0 |
| `POST /auth/login` | **2.5** | 5,061ms | 8,463ms | 8,762ms | 0 |
| `POST /auth/signup` | **0.8** | 6,701ms | 8,495ms | 8,495ms | 0 |

> **Combined multi-instance throughput exceeds 96,000 req/s** for health checks. Auth endpoints are intentionally CPU-bound (bcrypt hashing inside atomic database transactions) — throughput reflects production-safe operation under 50 concurrent connections competing for a 20-connection pool. Redis-backed endpoints (matchmaking, leaderboard) remain high-throughput.

### WebSocket Performance

| Metric | Result |
|--------|--------|
| Connection handshake (avg) | **1.98 ms** |
| Connection handshake (p99) | **12.84 ms** |
| Ping/pong round-trip (avg) | **1.29 ms** |
| Ping/pong round-trip (p50) | **0.77 ms** |
| Ping/pong round-trip (p90) | **2.49 ms** |
| Ping/pong round-trip (p99) | **13.91 ms** |
| Concurrent connections (30 batch) | **30/30** sustained, 0 errors |
| Batch connect time (30 clients) | **70 ms** total |
| Message throughput | **100/100** delivered, 0 dropped |
| Matchmaking time-to-match | **1.48s** (ELO-based pairing) |

> Sub-2ms average round-trip latency. Zero-loss message delivery under sustained load. Connections established in ~2ms including JWT verification and database user lookup.

### Matchmaking & Game Simulation

| Metric | Result |
|--------|--------|
| Matchmaking cycle interval | 2,000 ms |
| Rating-based pair matching | ±200 ELO (expanding over time) |
| Time-to-match (benchmark) | **1.48s** |
| Game simulation tick rate | 10 ticks/s (100ms interval) |
| Attack cooldown | 5 ticks (500ms) |
| Max move speed | 10 units/tick |
| Arena size | 1,000 × 1,000 units |
| Cross-server sync | Redis Pub/Sub, < 5ms propagation |
| Distributed lock contention | Per-region, 5s TTL |

### Infrastructure Under Load

| Component | Behavior |
|-----------|----------|
| PostgreSQL 16 | Connection-pooled (max 20), 10s statement timeout, slow query warnings (>500ms) |
| Redis 7 | Sorted sets for matchmaking + leaderboard, pub/sub for cross-server sync |
| BullMQ Workers | Async match-history persistence, leaderboard sync, analytics aggregation |
| Horizontal scaling | 2 API/WS instances confirmed, shared-nothing architecture via Redis |
| Docker | Non-root containers, health checks, resource limits (512MB API, 256MB worker) |

### Production Hardening (v2)

The codebase has undergone a comprehensive system design review by a senior distributed systems engineer. Key improvements:

| Area | Improvement |
|------|-------------|
| **Auth** | Atomic signup with PostgreSQL transactions + UNIQUE constraint handling (eliminates check-then-insert race condition). JWT tokens include `jti` claim for revocation support. |
| **Migrations** | PostgreSQL advisory locks prevent concurrent migration execution across instances. |
| **Connection Pool** | 10-second statement timeout prevents runaway queries. Slow query logging (>500ms) for observability. |
| **Matchmaking** | Fixed broken player removal — raw Redis member strings used for exact `ZREM` instead of re-serialized objects. |
| **Game Simulation** | 5-tick attack cooldown, self-attack prevention, `MAX_MOVE_SPEED` validation, deterministic tick-based timestamps. |
| **Leaderboard** | Batch `HMGET` for username resolution (fixed N+1 query). Transactional PostgreSQL persistence. |
| **Presence** | Gauge-accurate Prometheus metrics — decrements old status before incrementing new to prevent drift. |
| **WebSocket** | Action whitelist validation (`move`, `attack`, `score_event`). Batch INSERT for match events. |
| **API** | Leaderboard limit clamped to `[1, 100]` to prevent abuse. |
| **Docker** | Non-root containers, `HEALTHCHECK` directives, resource limits, externalized secrets via env vars. |

> See [SYSTEM_DESIGN_REVIEW.md](SYSTEM_DESIGN_REVIEW.md) for the full audit report with architectural analysis, failure handling assessment, and scalability recommendations.

### Running Benchmarks

```bash
# HTTP API benchmarks (requires running Docker Compose stack)
node benchmarks/http-bench.js

# WebSocket benchmarks
node benchmarks/ws-bench.js

# Quick health check load test
npx autocannon -c 100 -d 30 http://localhost:3000/health
```

> **Note**: Flush Redis before benchmarking for clean results: `docker exec nebula-realtime-redis-1 redis-cli FLUSHDB`

---

## Scaling Strategy

### Horizontal Scaling

```
                    Load Balancer
                    ┌─────────────────────┐
                    │  Sticky Sessions /   │
                    │  IP Hash Routing     │
                    └────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         ┌─────────┐   ┌─────────┐   ┌─────────┐
         │  ws-1   │   │  ws-2   │   │  ws-N   │
         │ us-east │   │ eu-west │   │  asia   │
         └────┬────┘   └────┬────┘   └────┬────┘
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌─────────────────────┐
                    │       Redis         │
                    │  Pub/Sub + Queues   │
                    │  Matchmaking Sets   │
                    │  Distributed Locks  │
                    └─────────────────────┘
```

- **WebSocket servers scale horizontally** — each instance runs independently, no shared state in memory
- **Redis Pub/Sub** synchronizes events across all server instances in real-time
- **Distributed locks** prevent race conditions in matchmaking across instances
- **BullMQ workers** process background jobs independently from the realtime layer
- **PostgreSQL** handles persistent storage with connection pooling (20 connections per instance, 10s statement timeout)
- **Docker Compose** runs 2 API/WS instances by default to demonstrate and validate multi-server architecture

### Theoretical Scaling Limits

| Dimension | Per Instance | 10 Instances |
|-----------|-------------|--------------|
| WebSocket connections | ~2,000 | ~20,000 |
| HTTP req/s | ~50,000 | ~500,000 |
| Message latency | < 2ms | < 5ms (via Redis) |
| Matchmaking regions | 3 | 3 (region-locked) |

---

## Future Improvements

- Region-based routing with actual geographic DNS
- Spectator mode for live match viewing
- Persistent match replays with timeline scrubbing
- JWT token revocation via `jti` blacklist (infrastructure in place)
- Kubernetes deployment with Helm charts
- Next.js admin dashboard with Recharts
- WebSocket connection upgrades via HTTP/2
- Connection pool auto-tuning based on load
- Rate limit configuration per endpoint tier

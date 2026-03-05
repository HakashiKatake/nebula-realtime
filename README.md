<img width="1536" height="1024" alt="ChatGPT Image Mar 5, 2026, 07_12_34 PM" src="https://github.com/user-attachments/assets/8af175f4-59df-40c2-8b2e-7f511f4e8f9a" />

# NebulaRealtime

**Production-grade realtime multiplayer backend infrastructure** built with Node.js, TypeScript, and distributed systems patterns used by companies like Riot, Discord, and Valve.

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
| **Authentication** | JWT + refresh tokens, bcrypt hashing, rate-limited endpoints |
| **WebSocket Server** | Real-time player connections, heartbeat, room management, event broadcasting |
| **Matchmaking** | Redis sorted-set queue, ELO-based rating matching, region-scoped, timeout expansion |
| **Presence** | Redis-backed player state tracking (online/offline/in_queue/in_match/spectating) |
| **Leaderboard** | Redis sorted sets for global + regional rankings, PostgreSQL persistence |
| **Game Simulation** | Server-authoritative tick-based simulation (move/attack/score) |
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

## Scaling Strategy

- **WebSocket servers scale horizontally** — each instance runs independently
- **Redis Pub/Sub** synchronizes events across all server instances
- **Distributed locks** prevent race conditions in matchmaking
- **BullMQ workers** process jobs independently from the realtime layer
- **PostgreSQL** handles persistent storage with connection pooling
- **Docker Compose** runs 2 API/WS instances by default to demonstrate multi-server architecture

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

## Load Testing

```bash
# REST API load test
npx autocannon -c 100 -d 30 http://localhost:3000/health

# WebSocket load test (artillery config)
npx artillery run load-test.yml
```

### Targets

| Metric | Target |
|--------|--------|
| Concurrent WebSocket connections | 2000+ |
| Message latency (avg) | <50ms |
| Match creation | Automated |
| Cross-server sync | Via Redis Pub/Sub |

---

## Future Improvements

- Region-based routing with actual geographic DNS
- Spectator mode for live match viewing
- Persistent match replays with timeline scrubbing
- Anti-cheat validation layer
- Kubernetes deployment with Helm charts
- Next.js admin dashboard with Recharts
- WebSocket connection upgrades via HTTP/2

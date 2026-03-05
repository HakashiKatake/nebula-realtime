# System Architecture

## High-Level Architecture

Client
↓
Region Router
↓
WebSocket Servers
↓
Redis
├ Pub/Sub
├ Matchmaking Queues
├ Presence
├ Rate Limiting
└ BullMQ Job Queues
↓
Worker Services
↓
PostgreSQL

## Component Responsibilities

### Client

Connects via WebSocket and sends game actions.

### Region Router

Routes players to appropriate regional servers.

### WebSocket Servers

Manage realtime communication with players.

### Redis

Central coordination layer used for:

* event broadcasting
* matchmaking queues
* distributed locks
* presence storage

### Worker Services

Process background tasks.

### PostgreSQL

Stores persistent application data.

## Matchmaking Flow

1. Player joins matchmaking queue.
2. Player rating is checked.
3. Matchmaker selects compatible players.
4. Match is created.
5. Players assigned to game room.

## Game Event Flow

1. Client sends action to server.
2. Server validates action.
3. Game state updated.
4. State broadcast to all players in room.

## Leaderboard Flow

1. Match ends.
2. Worker job triggered.
3. Scores updated in Redis leaderboard.
4. Results persisted to PostgreSQL.

## Presence Flow

1. Player connects.
2. Redis presence key updated.
3. Status broadcast to system.

## Replay Flow

Game events are logged as event streams.

Each event contains:

* timestamp
* player ID
* action
* event data

Replay API reconstructs the match timeline.

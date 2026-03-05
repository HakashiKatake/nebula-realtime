# Technical Design Document

## System Overview

NebulaRealtime is composed of several backend services working together:

* WebSocket servers
* Redis infrastructure
* PostgreSQL database
* Worker services
* REST API layer

These components form a distributed system capable of supporting realtime applications.

## Technology Stack

Backend

* Node.js
* TypeScript
* Fastify
* ws (WebSocket server)

Data Layer

* PostgreSQL
* Redis

Async Processing

* BullMQ

Observability

* prom-client
* pino

Infrastructure

* Docker
* Docker Compose

## Core Components

### API Server

Responsibilities:

* authentication
* REST endpoints
* user management
* leaderboard queries

Framework: Fastify

### WebSocket Server

Responsibilities:

* realtime player communication
* lobby management
* match state broadcasting

Library: ws

### Redis

Redis is used for multiple roles:

* pub/sub for cross-server messaging
* matchmaking queues
* presence tracking
* rate limiting
* distributed locks
* BullMQ job queues

### PostgreSQL

Persistent storage for:

* users
* match history
* leaderboards
* replay logs

### Worker Service

BullMQ workers process background tasks including:

* match history persistence
* leaderboard recalculation
* analytics aggregation

## Scaling Strategy

The system scales horizontally by running multiple WebSocket servers.

Redis pub/sub synchronizes events across servers.

Workers process jobs independently from the realtime layer.

## Failure Handling

Handled scenarios:

* client disconnect
* server restart
* matchmaking timeout
* job retry

BullMQ handles retries automatically.

Redis ensures consistent shared state.

## Security

Implemented protections:

* bcrypt password hashing
* JWT authentication
* rate limiting
* validation of client actions

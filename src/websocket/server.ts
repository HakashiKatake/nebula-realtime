import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { verifyAccessToken, JwtPayload } from '../auth/authService';
import { setPresence, removePresence, refreshPresenceTTL } from '../presence/presenceService';
import { joinQueue, leaveQueue, processMatchmaking, QueueEntry, MatchResult } from '../matchmaking/matchmakingService';
import { GameSimulation, GameAction } from '../game/gameSimulation';
import { recordMatchResult } from '../leaderboard/leaderboardService';
import { redisSub, redisPub } from '../redis/client';
import { checkRateLimit } from '../redis/rateLimiter';
import { wsConnectionsGauge, wsMessagesCounter, wsMessageLatency } from '../metrics/metrics';
import { query } from '../db/pool';

interface PlayerSession {
  ws: WebSocket;
  userId: string;
  username: string;
  region: string;
  rating: number;
  roomId: string | null;
  lastPing: number;
  isAlive: boolean;
}

interface Room {
  id: string;
  players: Set<string>;
  game: GameSimulation | null;
  region: string;
}

// Message types sent from client
interface ClientMessage {
  type: string;
  data?: any;
}

export class RealtimeServer {
  private wss: WebSocketServer;
  private sessions = new Map<string, PlayerSession>();
  private rooms = new Map<string, Room>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private matchmakingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.wss = new WebSocketServer({ port: env.WS_PORT, maxPayload: 1024 * 64 });
    this.setupRedisSubscriptions();
  }

  async start(): Promise<void> {
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    // Heartbeat check every 30s
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 30000);

    // Matchmaking loop
    this.matchmakingInterval = setInterval(async () => {
      try {
        const regions = ['us-east', 'eu-west', 'asia'];
        for (const region of regions) {
          const match = await processMatchmaking(region);
          if (match) {
            await this.createGameRoom(match);
          }
        }
      } catch (err) {
        logger.error({ err }, 'Matchmaking cycle error');
      }
    }, env.MATCHMAKING_INTERVAL_MS);

    logger.info({ port: env.WS_PORT, serverId: env.SERVER_ID }, 'WebSocket server started');
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.matchmakingInterval) clearInterval(this.matchmakingInterval);

    // Graceful close: notify all clients
    for (const [, session] of this.sessions) {
      this.sendMessage(session.ws, { type: 'server_shutdown' });
      session.ws.close(1001, 'Server shutting down');
    }

    this.wss.close();
    logger.info('WebSocket server stopped');
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    try {
      // Extract token from query string
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        ws.close(4001, 'Authentication required');
        return;
      }

      let payload: JwtPayload;
      try {
        payload = verifyAccessToken(token);
      } catch {
        ws.close(4001, 'Invalid token');
        return;
      }

      // Get user data
      const [user] = await query<{ id: string; username: string; rating: number; region: string }>(
        'SELECT id, username, rating, region FROM users WHERE id = $1',
        [payload.userId]
      );

      if (!user) {
        ws.close(4001, 'User not found');
        return;
      }

      // Check for existing session (reconnect support)
      const existingSession = this.sessions.get(user.id);
      if (existingSession) {
        existingSession.ws.close(4000, 'Session replaced');
        this.sessions.delete(user.id);
      }

      const session: PlayerSession = {
        ws,
        userId: user.id,
        username: user.username,
        region: user.region,
        rating: user.rating,
        roomId: null,
        lastPing: Date.now(),
        isAlive: true,
      };

      this.sessions.set(user.id, session);

      await setPresence(user.id, 'online', env.SERVER_ID);
      wsConnectionsGauge.labels({ region: user.region, server_id: env.SERVER_ID }).inc();

      this.sendMessage(ws, {
        type: 'connected',
        data: { userId: user.id, username: user.username, serverId: env.SERVER_ID },
      });

      logger.info({ userId: user.id, username: user.username }, 'Player connected');

      ws.on('message', (raw) => this.handleMessage(session, raw.toString()));
      ws.on('pong', () => {
        session.isAlive = true;
        session.lastPing = Date.now();
      });
      ws.on('close', () => this.handleDisconnect(session));
      ws.on('error', (err) => {
        logger.error({ userId: session.userId, err }, 'WebSocket error');
      });
    } catch (err) {
      logger.error({ err }, 'Connection handling error');
      ws.close(4500, 'Internal error');
    }
  }

  private async handleMessage(session: PlayerSession, raw: string): Promise<void> {
    const start = Date.now();
    wsMessagesCounter.labels({ type: 'incoming', direction: 'in' }).inc();

    try {
      // Rate limit: 20 messages/sec per player
      await checkRateLimit(`ratelimit:ws:${session.userId}`, 20, 1000);

      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        this.sendMessage(session.ws, { type: 'error', data: { message: 'Invalid JSON' } });
        return;
      }

      switch (msg.type) {
        case 'ping':
          session.isAlive = true;
          session.lastPing = Date.now();
          this.sendMessage(session.ws, { type: 'pong', data: { ts: Date.now() } });
          await refreshPresenceTTL(session.userId);
          break;

        case 'join_queue':
          await this.handleJoinQueue(session);
          break;

        case 'leave_queue':
          await this.handleLeaveQueue(session);
          break;

        case 'game_action':
          await this.handleGameAction(session, msg.data);
          break;

        case 'chat':
          this.handleChat(session, msg.data?.message);
          break;

        default:
          this.sendMessage(session.ws, { type: 'error', data: { message: 'Unknown message type' } });
      }
    } catch (err: any) {
      if (err.statusCode === 429) {
        this.sendMessage(session.ws, { type: 'error', data: { message: 'Rate limited' } });
      } else {
        logger.error({ userId: session.userId, err }, 'Message handling error');
      }
    } finally {
      wsMessageLatency.observe(Date.now() - start);
    }
  }

  private async handleJoinQueue(session: PlayerSession): Promise<void> {
    if (session.roomId) {
      this.sendMessage(session.ws, { type: 'error', data: { message: 'Already in a match' } });
      return;
    }

    const entry: QueueEntry = {
      userId: session.userId,
      username: session.username,
      rating: session.rating,
      region: session.region,
      joinedAt: Date.now(),
    };

    await joinQueue(entry);
    await setPresence(session.userId, 'in_queue', env.SERVER_ID);
    this.sendMessage(session.ws, { type: 'queue_joined', data: { region: session.region } });
  }

  private async handleLeaveQueue(session: PlayerSession): Promise<void> {
    await leaveQueue(session.userId, session.region);
    await setPresence(session.userId, 'online', env.SERVER_ID);
    this.sendMessage(session.ws, { type: 'queue_left' });
  }

  private async handleGameAction(session: PlayerSession, data: any): Promise<void> {
    if (!session.roomId) return;

    const room = this.rooms.get(session.roomId);
    if (!room?.game) return;

    const action = data?.action as GameAction;
    if (!action) return;

    const success = room.game.processAction(session.userId, action, data);
    if (!success) {
      this.sendMessage(session.ws, { type: 'action_rejected', data: { action } });
    }
  }

  private handleChat(session: PlayerSession, message: string | undefined): void {
    if (!session.roomId || !message) return;

    const room = this.rooms.get(session.roomId);
    if (!room) return;

    // Truncate to prevent abuse
    const sanitized = message.slice(0, 200);

    this.broadcastToRoom(room.id, {
      type: 'chat',
      data: { userId: session.userId, username: session.username, message: sanitized },
    });
  }

  private async createGameRoom(match: MatchResult): Promise<void> {
    const room: Room = {
      id: match.matchId,
      players: new Set(match.players.map((p) => p.userId)),
      game: null,
      region: match.region,
    };

    this.rooms.set(room.id, room);

    // Assign players to room
    for (const p of match.players) {
      const session = this.sessions.get(p.userId);
      if (session) {
        session.roomId = room.id;
        await setPresence(p.userId, 'in_match', env.SERVER_ID);
        this.sendMessage(session.ws, {
          type: 'match_found',
          data: {
            matchId: match.matchId,
            players: match.players.map((pl) => ({
              userId: pl.userId,
              username: pl.username,
              rating: pl.rating,
            })),
          },
        });
      }
    }

    // Store match in DB
    await query(
      `INSERT INTO matches (id, region, status, player_ids) VALUES ($1, $2, 'in_progress', $3)`,
      [match.matchId, match.region, match.players.map((p) => p.userId)]
    );

    // Create game simulation
    const game = new GameSimulation(
      match.matchId,
      match.players.map((p) => ({ userId: p.userId, username: p.username }))
    );

    room.game = game;

    game.start(
      // On tick: broadcast state to room
      (state) => {
        const serialized = game.getSerializableState();
        this.broadcastToRoom(room.id, { type: 'game_state', data: serialized });
      },
      // On end: handle match completion
      async (state) => {
        await this.handleMatchEnd(room, game);
      }
    );

    // Publish match creation for cross-server awareness
    await redisPub.publish(
      'matches:created',
      JSON.stringify({ matchId: match.matchId, region: match.region, players: match.players.map((p) => p.userId) })
    );

    logger.info({ matchId: match.matchId, region: match.region }, 'Game room created');
  }

  private async handleMatchEnd(room: Room, game: GameSimulation): Promise<void> {
    const winner = game.getWinner();
    const loser = game.getLoser();

    // Broadcast game over
    this.broadcastToRoom(room.id, {
      type: 'match_ended',
      data: {
        matchId: room.id,
        winner: winner ? { userId: winner.userId, username: winner.username, score: winner.score } : null,
        finalState: game.getSerializableState(),
      },
    });

    // Record result
    if (winner && loser && winner.userId !== loser.userId) {
      await recordMatchResult(winner.userId, loser.userId, winner.username, loser.username, room.region);
    }

    // Update match status in DB
    await query(
      `UPDATE matches SET status = 'completed', winner_id = $1, ended_at = NOW() WHERE id = $2`,
      [winner?.userId || null, room.id]
    );

    // Store events for replay
    for (const event of game.state.events) {
      await query(
        `INSERT INTO match_events (match_id, tick, player_id, action, data) VALUES ($1, $2, $3, $4, $5)`,
        [room.id, event.tick, event.playerId, event.action, JSON.stringify(event.data)]
      );
    }

    // Clean up player sessions
    for (const playerId of room.players) {
      const session = this.sessions.get(playerId);
      if (session) {
        session.roomId = null;
        await setPresence(playerId, 'online', env.SERVER_ID);
      }
    }

    this.rooms.delete(room.id);
    logger.info({ matchId: room.id }, 'Match ended and cleaned up');
  }

  private broadcastToRoom(roomId: string, message: Record<string, any>): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const payload = JSON.stringify(message);
    for (const playerId of room.players) {
      const session = this.sessions.get(playerId);
      if (session && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(payload);
        wsMessagesCounter.labels({ type: message.type, direction: 'out' }).inc();
      }
    }
  }

  private sendMessage(ws: WebSocket, message: Record<string, any>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      wsMessagesCounter.labels({ type: message.type, direction: 'out' }).inc();
    }
  }

  private async handleDisconnect(session: PlayerSession): Promise<void> {
    wsConnectionsGauge.labels({ region: session.region, server_id: env.SERVER_ID }).dec();

    // Leave queue if in queue
    await leaveQueue(session.userId, session.region);

    // Handle in-match disconnect
    if (session.roomId) {
      const room = this.rooms.get(session.roomId);
      if (room) {
        room.players.delete(session.userId);
        this.broadcastToRoom(room.id, {
          type: 'player_disconnected',
          data: { userId: session.userId, username: session.username },
        });

        // If only one player left, end the match
        if (room.players.size <= 1 && room.game) {
          room.game.stop();
          await this.handleMatchEnd(room, room.game);
        }
      }
    }

    await removePresence(session.userId);
    this.sessions.delete(session.userId);

    logger.info({ userId: session.userId }, 'Player disconnected');
  }

  private checkHeartbeats(): void {
    for (const [userId, session] of this.sessions) {
      if (!session.isAlive) {
        logger.warn({ userId }, 'Heartbeat timeout, disconnecting');
        session.ws.terminate();
        return;
      }
      session.isAlive = false;
      session.ws.ping();
    }
  }

  private setupRedisSubscriptions(): void {
    // Listen for cross-server messages
    redisSub.subscribe('game:broadcast', 'presence:updates', 'matches:created');

    redisSub.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);

        switch (channel) {
          case 'game:broadcast':
            // Forward broadcasts from other servers to local clients
            if (data.roomId && data.message) {
              this.broadcastToRoom(data.roomId, data.message);
            }
            break;

          case 'presence:updates':
            // Could be used for friends list notifications etc.
            break;
        }
      } catch (err) {
        logger.error({ channel, err }, 'Redis subscription message error');
      }
    });
  }

  getConnectionCount(): number {
    return this.sessions.size;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}

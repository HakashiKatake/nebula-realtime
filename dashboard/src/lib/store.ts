import { create } from 'zustand';
import type { SimUser, MatchInfo, FeedEvent, SystemMetrics, NodeStats, EdgeActivity } from './types';
import { apiPost, createWsConnection, sendWsMessage } from './api';

let userCounter = 0;

function uid(): string {
  return Math.random().toString(36).substring(2, 10);
}

interface NebulaStore {
  // Users
  users: SimUser[];
  wsConnections: Map<string, WebSocket>;

  // Matches
  matches: MatchInfo[];

  // Feed
  feed: FeedEvent[];

  // Metrics
  metrics: SystemMetrics;
  nodeStats: NodeStats;
  edgeActivities: Map<string, EdgeActivity>;

  // Running state
  isLoadTesting: boolean;

  // Actions
  addFeedEvent: (type: FeedEvent['type'], source: string, message: string) => void;
  addUser: () => Promise<void>;
  addUsers: (count: number) => Promise<void>;
  connectUser: (userId: string) => void;
  connectAllUsers: () => void;
  disconnectUser: (userId: string) => void;
  queueUser: (userId: string) => void;
  queueAllConnected: () => void;
  startLoadTest: (userCount: number) => Promise<void>;
  stopLoadTest: () => void;
  updateNodeStat: (node: keyof NodeStats, updates: Partial<NodeStats[keyof NodeStats]>) => void;
  pulseEdge: (edgeId: string, label: string) => void;
  handleWsMessage: (userId: string, data: Record<string, unknown>) => void;
}

export const useStore = create<NebulaStore>((set, get) => ({
  users: [],
  wsConnections: new Map(),
  matches: [],
  feed: [],
  metrics: {
    totalUsers: 0,
    connectedUsers: 0,
    usersInQueue: 0,
    activeMatches: 0,
    completedMatches: 0,
    messagesPerSec: 0,
    avgLatency: 0,
    errors: 0,
  },
  nodeStats: {
    apiServer: { requests: 0, active: false, latency: 0 },
    wsServer: { connections: 0, active: false, messagesIn: 0, messagesOut: 0 },
    postgres: { queries: 0, active: false, connections: 0 },
    redis: { operations: 0, active: false, memory: '0MB', pubsubChannels: 0 },
    matchmaking: { queued: 0, active: false, matchesCreated: 0 },
    gameArena: { activeGames: 0, active: false, tickRate: 10, totalActions: 0 },
    worker: { processed: 0, active: false, failed: 0, pending: 0 },
    leaderboard: { entries: 0, active: false, lastSync: 0 },
  },
  edgeActivities: new Map(),
  isLoadTesting: false,

  addFeedEvent: (type, source, message) => {
    const event: FeedEvent = {
      id: uid(),
      timestamp: Date.now(),
      type,
      source,
      message,
    };
    set((state) => ({
      feed: [event, ...state.feed].slice(0, 200),
    }));
  },

  addUser: async () => {
    const { addFeedEvent, pulseEdge, updateNodeStat } = get();
    userCounter++;
    const username = `player_${userCounter}_${uid().slice(0, 4)}`;
    const email = `${username}@nebula.test`;
    const password = 'TestPass123!';

    try {
      pulseEdge('userPool-apiServer', 'POST /signup');
      updateNodeStat('apiServer', { active: true, requests: get().nodeStats.apiServer.requests + 1 });

      const result = await apiPost<{
        user: { id: string; username: string; rating: number; region: string };
        tokens: { accessToken: string };
      }>('/auth/signup', { username, email, password });

      pulseEdge('apiServer-postgres', 'INSERT user');
      updateNodeStat('postgres', { active: true, queries: get().nodeStats.postgres.queries + 1 });

      const user: SimUser = {
        id: result.user.id,
        username: result.user.username,
        email,
        token: result.tokens.accessToken,
        connected: false,
        wsReady: false,
        inQueue: false,
        inMatch: false,
        rating: result.user.rating || 1000,
        region: result.user.region || 'us-east',
      };

      set((state) => ({
        users: [...state.users, user],
        metrics: { ...state.metrics, totalUsers: state.metrics.totalUsers + 1 },
      }));

      addFeedEvent('success', 'Auth', `User ${username} registered (rating: ${user.rating})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addFeedEvent('error', 'Auth', `Signup failed for ${username}: ${message}`);
      set((state) => ({ metrics: { ...state.metrics, errors: state.metrics.errors + 1 } }));
    }
  },

  addUsers: async (count: number) => {
    const { addUser, addFeedEvent } = get();
    addFeedEvent('info', 'System', `Creating ${count} users...`);
    for (let i = 0; i < count; i++) {
      await addUser();
      // Small delay to avoid hammering
      if (i % 5 === 4) await new Promise((r) => setTimeout(r, 50));
    }
    addFeedEvent('success', 'System', `Finished creating ${count} users`);
  },

  connectUser: (userId: string) => {
    const { users, wsConnections, addFeedEvent, pulseEdge, updateNodeStat, handleWsMessage } = get();
    const user = users.find((u) => u.id === userId);
    if (!user || user.connected) return;

    const ws = createWsConnection(
      user.token,
      (data) => handleWsMessage(userId, data as Record<string, unknown>),
      () => {
        pulseEdge('userPool-wsServer', 'WS connect');
        pulseEdge('wsServer-redis', 'pub/sub sync');
        updateNodeStat('wsServer', {
          active: true,
          connections: get().nodeStats.wsServer.connections + 1,
        });

        set((state) => ({
          users: state.users.map((u) =>
            u.id === userId ? { ...u, connected: true, wsReady: true } : u
          ),
          metrics: { ...state.metrics, connectedUsers: state.metrics.connectedUsers + 1 },
        }));
        addFeedEvent('ws', 'WebSocket', `${user.username} connected`);
      },
      (code) => {
        wsConnections.delete(userId);
        updateNodeStat('wsServer', {
          connections: Math.max(0, get().nodeStats.wsServer.connections - 1),
        });

        set((state) => ({
          users: state.users.map((u) =>
            u.id === userId ? { ...u, connected: false, wsReady: false, inQueue: false } : u
          ),
          metrics: {
            ...state.metrics,
            connectedUsers: Math.max(0, state.metrics.connectedUsers - 1),
            usersInQueue: state.users.find((u) => u.id === userId)?.inQueue
              ? Math.max(0, state.metrics.usersInQueue - 1)
              : state.metrics.usersInQueue,
          },
        }));
        addFeedEvent('warn', 'WebSocket', `${user.username} disconnected (code: ${code})`);
      },
      () => {
        addFeedEvent('error', 'WebSocket', `${user.username} connection error`);
        set((state) => ({ metrics: { ...state.metrics, errors: state.metrics.errors + 1 } }));
      }
    );

    wsConnections.set(userId, ws);
  },

  connectAllUsers: () => {
    const { users, connectUser, addFeedEvent } = get();
    const disconnected = users.filter((u) => !u.connected);
    addFeedEvent('info', 'System', `Connecting ${disconnected.length} users...`);
    disconnected.forEach((u) => connectUser(u.id));
  },

  disconnectUser: (userId: string) => {
    const { wsConnections } = get();
    const ws = wsConnections.get(userId);
    if (ws) ws.close();
  },

  queueUser: (userId: string) => {
    const { users, wsConnections, addFeedEvent, pulseEdge, updateNodeStat } = get();
    const user = users.find((u) => u.id === userId);
    if (!user || !user.wsReady || user.inQueue || user.inMatch) return;

    const ws = wsConnections.get(userId);
    if (!ws) return;

    sendWsMessage(ws, 'join_queue', { region: user.region });
    pulseEdge('wsServer-matchmaking', 'join_queue');
    pulseEdge('matchmaking-redis', 'queue add');
    updateNodeStat('matchmaking', {
      active: true,
      queued: get().nodeStats.matchmaking.queued + 1,
    });
    updateNodeStat('redis', {
      active: true,
      operations: get().nodeStats.redis.operations + 1,
    });

    set((state) => ({
      users: state.users.map((u) => (u.id === userId ? { ...u, inQueue: true } : u)),
      metrics: { ...state.metrics, usersInQueue: state.metrics.usersInQueue + 1 },
    }));
    addFeedEvent('action', 'Matchmaking', `${user.username} joined queue (region: ${user.region})`);
  },

  queueAllConnected: () => {
    const { users, queueUser, addFeedEvent } = get();
    const available = users.filter((u) => u.wsReady && !u.inQueue && !u.inMatch);
    addFeedEvent('info', 'System', `Queueing ${available.length} users...`);
    available.forEach((u) => queueUser(u.id));
  },

  startLoadTest: async (userCount: number) => {
    const { addUsers, connectAllUsers, queueAllConnected, addFeedEvent } = get();
    set({ isLoadTesting: true });
    addFeedEvent('info', 'LoadTest', `Starting load test with ${userCount} users`);

    await addUsers(userCount);
    await new Promise((r) => setTimeout(r, 500));
    connectAllUsers();
    await new Promise((r) => setTimeout(r, 1500));
    queueAllConnected();

    addFeedEvent('success', 'LoadTest', 'Load test initiated - users created, connected, and queued');
  },

  stopLoadTest: () => {
    const { addFeedEvent } = get();
    set({ isLoadTesting: false });
    addFeedEvent('info', 'LoadTest', 'Load test stopped');
  },

  updateNodeStat: (node, updates) => {
    set((state) => ({
      nodeStats: {
        ...state.nodeStats,
        [node]: { ...state.nodeStats[node], ...updates },
      },
    }));

    // Auto-reset active after 800ms
    setTimeout(() => {
      set((state) => ({
        nodeStats: {
          ...state.nodeStats,
          [node]: { ...state.nodeStats[node], active: false },
        },
      }));
    }, 800);
  },

  pulseEdge: (edgeId: string, label: string) => {
    set((state) => {
      const activities = new Map(state.edgeActivities);
      const existing = activities.get(edgeId);
      activities.set(edgeId, {
        id: edgeId,
        active: true,
        label,
        count: (existing?.count || 0) + 1,
      });
      return { edgeActivities: activities };
    });

    setTimeout(() => {
      set((state) => {
        const activities = new Map(state.edgeActivities);
        const existing = activities.get(edgeId);
        if (existing) activities.set(edgeId, { ...existing, active: false });
        return { edgeActivities: activities };
      });
    }, 600);
  },

  handleWsMessage: (userId: string, data: Record<string, unknown>) => {
    const { addFeedEvent, pulseEdge, updateNodeStat } = get();
    const type = data.type as string;

    updateNodeStat('wsServer', {
      messagesIn: get().nodeStats.wsServer.messagesIn + 1,
    });

    switch (type) {
      case 'connected':
        addFeedEvent('ws', 'WS', `Server confirmed connection for user ${userId.slice(0, 8)}`);
        break;

      case 'queue_joined':
        addFeedEvent('info', 'Matchmaking', `Queue joined confirmation`);
        break;

      case 'match_found': {
        const matchId = data.matchId as string;
        const players = (data.players as string[]) || [];
        pulseEdge('matchmaking-gameArena', 'match_found');
        updateNodeStat('matchmaking', {
          matchesCreated: get().nodeStats.matchmaking.matchesCreated + 1,
          queued: Math.max(0, get().nodeStats.matchmaking.queued - 2),
        });
        updateNodeStat('gameArena', {
          active: true,
          activeGames: get().nodeStats.gameArena.activeGames + 1,
        });

        const match: MatchInfo = {
          id: matchId,
          players,
          state: 'active',
          scores: {},
          startedAt: Date.now(),
          duration: 0,
        };

        set((state) => ({
          matches: [...state.matches, match],
          users: state.users.map((u) =>
            u.id === userId ? { ...u, inQueue: false, inMatch: true, matchId } : u
          ),
          metrics: {
            ...state.metrics,
            activeMatches: state.metrics.activeMatches + 1,
            usersInQueue: Math.max(0, state.metrics.usersInQueue - 1),
          },
        }));
        addFeedEvent('match', 'Match', `Match ${matchId.slice(0, 8)} started with ${players.length} players`);
        break;
      }

      case 'game_state': {
        pulseEdge('gameArena-wsServer', 'game_state');
        updateNodeStat('gameArena', { totalActions: get().nodeStats.gameArena.totalActions + 1 });
        break;
      }

      case 'match_ended': {
        const matchId = data.matchId as string;
        pulseEdge('gameArena-worker', 'match_end');
        pulseEdge('worker-postgres', 'persist');
        pulseEdge('worker-leaderboard', 'update');
        updateNodeStat('worker', {
          active: true,
          processed: get().nodeStats.worker.processed + 1,
        });
        updateNodeStat('gameArena', {
          activeGames: Math.max(0, get().nodeStats.gameArena.activeGames - 1),
        });

        set((state) => ({
          matches: state.matches.map((m) =>
            m.id === matchId ? { ...m, state: 'finished' as const, duration: Date.now() - m.startedAt } : m
          ),
          users: state.users.map((u) =>
            u.id === userId ? { ...u, inMatch: false, matchId: undefined } : u
          ),
          metrics: {
            ...state.metrics,
            activeMatches: Math.max(0, state.metrics.activeMatches - 1),
            completedMatches: state.metrics.completedMatches + 1,
          },
        }));
        addFeedEvent('match', 'Match', `Match ${matchId?.slice(0, 8)} ended`);
        break;
      }

      case 'error': {
        const message = (data.message as string) || 'Unknown error';
        addFeedEvent('error', 'Server', message);
        set((state) => ({ metrics: { ...state.metrics, errors: state.metrics.errors + 1 } }));
        break;
      }

      case 'heartbeat':
        // Silent
        break;

      default:
        addFeedEvent('info', 'WS', `${type}: ${JSON.stringify(data).slice(0, 100)}`);
    }
  },
}));

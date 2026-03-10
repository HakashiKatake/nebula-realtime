export interface SimUser {
  id: string;
  username: string;
  email: string;
  token: string;
  connected: boolean;
  wsReady: boolean;
  inQueue: boolean;
  inMatch: boolean;
  matchId?: string;
  rating: number;
  region: string;
}

export interface MatchInfo {
  id: string;
  players: string[];
  state: 'waiting' | 'active' | 'finished';
  scores: Record<string, number>;
  startedAt: number;
  duration: number;
}

export interface FeedEvent {
  id: string;
  timestamp: number;
  type: 'info' | 'success' | 'error' | 'warn' | 'ws' | 'match' | 'action';
  source: string;
  message: string;
}

export interface SystemMetrics {
  totalUsers: number;
  connectedUsers: number;
  usersInQueue: number;
  activeMatches: number;
  completedMatches: number;
  messagesPerSec: number;
  avgLatency: number;
  errors: number;
}

export interface NodeStats {
  apiServer: { requests: number; active: boolean; latency: number };
  wsServer: { connections: number; active: boolean; messagesIn: number; messagesOut: number };
  postgres: { queries: number; active: boolean; connections: number };
  redis: { operations: number; active: boolean; memory: string; pubsubChannels: number };
  matchmaking: { queued: number; active: boolean; matchesCreated: number };
  gameArena: { activeGames: number; active: boolean; tickRate: number; totalActions: number };
  worker: { processed: number; active: boolean; failed: number; pending: number };
  leaderboard: { entries: number; active: boolean; lastSync: number };
}

export interface EdgeActivity {
  id: string;
  active: boolean;
  label: string;
  count: number;
}

export type NodeType =
  | 'userPool'
  | 'apiServer'
  | 'wsServer'
  | 'postgres'
  | 'redis'
  | 'matchmaking'
  | 'gameArena'
  | 'worker'
  | 'leaderboard';

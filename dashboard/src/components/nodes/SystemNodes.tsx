'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

/* ─── Shared base wrapper ─── */
interface BaseProps {
  color: string;
  glowClass: string;
  icon: string;
  title: string;
  active: boolean;
  children: React.ReactNode;
  handles?: { type: 'source' | 'target'; position: Position; id: string }[];
}

function NodeShell({ color, glowClass, icon, title, active, children, handles = [] }: BaseProps) {
  return (
    <div
      className={`relative rounded-xl border px-4 py-3 min-w-[180px] transition-all duration-300 ${
        active ? glowClass : ''
      }`}
      style={{
        background: active
          ? `linear-gradient(135deg, ${color}18, ${color}08)`
          : 'rgba(17, 24, 39, 0.95)',
        borderColor: active ? color : '#2a3450',
        boxShadow: active ? `0 0 20px ${color}30` : 'none',
      }}
    >
      {/* Status pulse */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: active ? color : '#4b5563',
            boxShadow: active ? `0 0 6px ${color}` : 'none',
          }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="font-semibold text-sm text-slate-200">{title}</span>
      </div>

      {/* Stats */}
      <div className="space-y-1">{children}</div>

      {/* Handles */}
      {handles.map((h) => (
        <Handle
          key={h.id}
          type={h.type}
          position={h.position}
          id={h.id}
          style={{
            background: color,
            border: `2px solid ${color}`,
            width: 10,
            height: 10,
          }}
        />
      ))}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono" style={{ color: color || '#94a3b8' }}>
        {value}
      </span>
    </div>
  );
}

/* ─── Node: User Pool ─── */
type UserPoolData = { totalUsers: number; connected: number; inQueue: number; inMatch: number; active: boolean };
export const UserPoolNode = memo(({ data }: NodeProps & { data: UserPoolData }) => (
  <NodeShell
    color="#8b5cf6"
    glowClass="node-glow"
    icon="👥"
    title="User Pool"
    active={data.active}
    handles={[
      { type: 'source', position: Position.Right, id: 'out-api' },
      { type: 'source', position: Position.Bottom, id: 'out-ws' },
    ]}
  >
    <Stat label="Total" value={data.totalUsers} color="#a78bfa" />
    <Stat label="Connected" value={data.connected} color="#22c55e" />
    <Stat label="In Queue" value={data.inQueue} color="#eab308" />
    <Stat label="In Match" value={data.inMatch} color="#06b6d4" />
  </NodeShell>
));
UserPoolNode.displayName = 'UserPoolNode';

/* ─── Node: API Server ─── */
type ApiServerData = { requests: number; latency: number; active: boolean };
export const ApiServerNode = memo(({ data }: NodeProps & { data: ApiServerData }) => (
  <NodeShell
    color="#6366f1"
    glowClass="node-glow"
    icon="🚀"
    title="Fastify API"
    active={data.active}
    handles={[
      { type: 'target', position: Position.Left, id: 'in' },
      { type: 'source', position: Position.Right, id: 'out-db' },
      { type: 'source', position: Position.Bottom, id: 'out-redis' },
    ]}
  >
    <Stat label="Requests" value={data.requests} color="#818cf8" />
    <Stat label="Latency" value={`${data.latency}ms`} color="#94a3b8" />
  </NodeShell>
));
ApiServerNode.displayName = 'ApiServerNode';

/* ─── Node: WebSocket Server ─── */
type WsServerData = { connections: number; messagesIn: number; messagesOut: number; active: boolean };
export const WsServerNode = memo(({ data }: NodeProps & { data: WsServerData }) => (
  <NodeShell
    color="#06b6d4"
    glowClass="node-glow-cyan"
    icon="⚡"
    title="WS Server"
    active={data.active}
    handles={[
      { type: 'target', position: Position.Left, id: 'in' },
      { type: 'target', position: Position.Top, id: 'in-game' },
      { type: 'source', position: Position.Right, id: 'out-mm' },
      { type: 'source', position: Position.Bottom, id: 'out-redis' },
    ]}
  >
    <Stat label="Connections" value={data.connections} color="#22d3ee" />
    <Stat label="Msgs In" value={data.messagesIn} color="#94a3b8" />
    <Stat label="Msgs Out" value={data.messagesOut} color="#94a3b8" />
  </NodeShell>
));
WsServerNode.displayName = 'WsServerNode';

/* ─── Node: PostgreSQL ─── */
type PostgresData = { queries: number; connections: number; active: boolean };
export const PostgresNode = memo(({ data }: NodeProps & { data: PostgresData }) => (
  <NodeShell
    color="#3b82f6"
    glowClass="node-glow"
    icon="🐘"
    title="PostgreSQL"
    active={data.active}
    handles={[
      { type: 'target', position: Position.Left, id: 'in-api' },
      { type: 'target', position: Position.Bottom, id: 'in-worker' },
    ]}
  >
    <Stat label="Queries" value={data.queries} color="#60a5fa" />
    <Stat label="Connections" value={data.connections} color="#94a3b8" />
  </NodeShell>
));
PostgresNode.displayName = 'PostgresNode';

/* ─── Node: Redis ─── */
type RedisData = { operations: number; memory: string; pubsubChannels: number; active: boolean };
export const RedisNode = memo(({ data }: NodeProps & { data: RedisData }) => (
  <NodeShell
    color="#ef4444"
    glowClass="node-glow-red"
    icon="⚡"
    title="Redis"
    active={data.active}
    handles={[
      { type: 'target', position: Position.Left, id: 'in-ws' },
      { type: 'target', position: Position.Top, id: 'in-mm' },
      { type: 'target', position: Position.Bottom, id: 'in-lb' },
    ]}
  >
    <Stat label="Operations" value={data.operations} color="#f87171" />
    <Stat label="Memory" value={data.memory} color="#94a3b8" />
    <Stat label="Pub/Sub" value={data.pubsubChannels} color="#94a3b8" />
  </NodeShell>
));
RedisNode.displayName = 'RedisNode';

/* ─── Node: Matchmaking ─── */
type MatchmakingData = { queued: number; matchesCreated: number; active: boolean };
export const MatchmakingNode = memo(({ data }: NodeProps & { data: MatchmakingData }) => (
  <NodeShell
    color="#eab308"
    glowClass="node-glow"
    icon="🎯"
    title="Matchmaking"
    active={data.active}
    handles={[
      { type: 'target', position: Position.Left, id: 'in' },
      { type: 'source', position: Position.Right, id: 'out-redis' },
      { type: 'source', position: Position.Bottom, id: 'out-game' },
    ]}
  >
    <Stat label="Queued" value={data.queued} color="#fbbf24" />
    <Stat label="Matches" value={data.matchesCreated} color="#22c55e" />
  </NodeShell>
));
MatchmakingNode.displayName = 'MatchmakingNode';

/* ─── Node: Game Arena ─── */
type GameArenaData = { activeGames: number; tickRate: number; totalActions: number; active: boolean };
export const GameArenaNode = memo(({ data }: NodeProps & { data: GameArenaData }) => (
  <NodeShell
    color="#22c55e"
    glowClass="node-glow-green"
    icon="🎮"
    title="Game Arena"
    active={data.active}
    handles={[
      { type: 'target', position: Position.Top, id: 'in' },
      { type: 'source', position: Position.Left, id: 'out-ws' },
      { type: 'source', position: Position.Right, id: 'out-worker' },
    ]}
  >
    <Stat label="Active" value={data.activeGames} color="#4ade80" />
    <Stat label="Tick Rate" value={`${data.tickRate}Hz`} color="#94a3b8" />
    <Stat label="Actions" value={data.totalActions} color="#94a3b8" />
  </NodeShell>
));
GameArenaNode.displayName = 'GameArenaNode';

/* ─── Node: BullMQ Worker ─── */
type WorkerData = { processed: number; failed: number; pending: number; active: boolean };
export const WorkerNode = memo(({ data }: NodeProps & { data: WorkerData }) => (
  <NodeShell
    color="#f97316"
    glowClass="node-glow"
    icon="⚙️"
    title="BullMQ Worker"
    active={data.active}
    handles={[
      { type: 'target', position: Position.Left, id: 'in' },
      { type: 'source', position: Position.Top, id: 'out-db' },
      { type: 'source', position: Position.Right, id: 'out-lb' },
    ]}
  >
    <Stat label="Processed" value={data.processed} color="#fb923c" />
    <Stat label="Failed" value={data.failed} color="#ef4444" />
    <Stat label="Pending" value={data.pending} color="#94a3b8" />
  </NodeShell>
));
WorkerNode.displayName = 'WorkerNode';

/* ─── Node: Leaderboard ─── */
type LeaderboardData = { entries: number; lastSync: number; active: boolean };
export const LeaderboardNode = memo(({ data }: NodeProps & { data: LeaderboardData }) => (
  <NodeShell
    color="#a855f7"
    glowClass="node-glow"
    icon="🏆"
    title="Leaderboard"
    active={data.active}
    handles={[
      { type: 'target', position: Position.Left, id: 'in' },
      { type: 'source', position: Position.Right, id: 'out-redis' },
      { type: 'source', position: Position.Bottom, id: 'out-db' },
    ]}
  >
    <Stat label="Entries" value={data.entries} color="#c084fc" />
    <Stat
      label="Last Sync"
      value={data.lastSync ? `${Math.floor((Date.now() - data.lastSync) / 1000)}s ago` : 'Never'}
      color="#94a3b8"
    />
  </NodeShell>
));
LeaderboardNode.displayName = 'LeaderboardNode';

/* ─── Export node type map ─── */
export const nodeTypes = {
  userPool: UserPoolNode,
  apiServer: ApiServerNode,
  wsServer: WsServerNode,
  postgres: PostgresNode,
  redis: RedisNode,
  matchmaking: MatchmakingNode,
  gameArena: GameArenaNode,
  worker: WorkerNode,
  leaderboard: LeaderboardNode,
};

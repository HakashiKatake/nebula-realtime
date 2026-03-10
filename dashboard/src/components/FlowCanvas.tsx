'use client';

import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '@/lib/store';
import { nodeTypes } from './nodes/SystemNodes';
import { edgeTypes } from './edges/AnimatedEdge';

/* ─── Topology layout positions ─── */
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  userPool:     { x: 50,   y: 250 },
  apiServer:    { x: 350,  y: 80  },
  wsServer:     { x: 350,  y: 420 },
  matchmaking:  { x: 650,  y: 250 },
  gameArena:    { x: 650,  y: 500 },
  worker:       { x: 950,  y: 420 },
  leaderboard:  { x: 950,  y: 180 },
  postgres:     { x: 1250, y: 80  },
  redis:        { x: 1250, y: 350 },
};

/* ─── Edge definitions (system topology) ─── */
const EDGE_DEFS: {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  color: string;
}[] = [
  { id: 'userPool-apiServer',   source: 'userPool',    sourceHandle: 'out-api',    target: 'apiServer',   targetHandle: 'in',       color: '#8b5cf6' },
  { id: 'userPool-wsServer',    source: 'userPool',    sourceHandle: 'out-ws',     target: 'wsServer',    targetHandle: 'in',       color: '#8b5cf6' },
  { id: 'apiServer-postgres',   source: 'apiServer',   sourceHandle: 'out-db',     target: 'postgres',    targetHandle: 'in-api',   color: '#6366f1' },
  { id: 'wsServer-matchmaking', source: 'wsServer',    sourceHandle: 'out-mm',     target: 'matchmaking', targetHandle: 'in',       color: '#06b6d4' },
  { id: 'wsServer-redis',       source: 'wsServer',    sourceHandle: 'out-redis',  target: 'redis',       targetHandle: 'in-ws',    color: '#06b6d4' },
  { id: 'matchmaking-redis',    source: 'matchmaking', sourceHandle: 'out-redis',  target: 'redis',       targetHandle: 'in-mm',    color: '#eab308' },
  { id: 'matchmaking-gameArena',source: 'matchmaking', sourceHandle: 'out-game',   target: 'gameArena',   targetHandle: 'in',       color: '#eab308' },
  { id: 'gameArena-wsServer',   source: 'gameArena',   sourceHandle: 'out-ws',     target: 'wsServer',    targetHandle: 'in-game',  color: '#22c55e' },
  { id: 'gameArena-worker',     source: 'gameArena',   sourceHandle: 'out-worker', target: 'worker',      targetHandle: 'in',       color: '#22c55e' },
  { id: 'worker-postgres',      source: 'worker',      sourceHandle: 'out-db',     target: 'postgres',    targetHandle: 'in-worker',color: '#f97316' },
  { id: 'worker-leaderboard',   source: 'worker',      sourceHandle: 'out-lb',     target: 'leaderboard', targetHandle: 'in',       color: '#f97316' },
  { id: 'leaderboard-redis',    source: 'leaderboard', sourceHandle: 'out-redis',  target: 'redis',       targetHandle: 'in-lb',    color: '#a855f7' },
];

export default function FlowCanvas() {
  const { metrics, nodeStats, edgeActivities } = useStore();

  const nodes: Node[] = useMemo(
    () => [
      {
        id: 'userPool',
        type: 'userPool',
        position: NODE_POSITIONS.userPool,
        data: {
          totalUsers: metrics.totalUsers,
          connected: metrics.connectedUsers,
          inQueue: metrics.usersInQueue,
          inMatch: metrics.activeMatches,
          active: metrics.totalUsers > 0,
        },
      },
      {
        id: 'apiServer',
        type: 'apiServer',
        position: NODE_POSITIONS.apiServer,
        data: { ...nodeStats.apiServer },
      },
      {
        id: 'wsServer',
        type: 'wsServer',
        position: NODE_POSITIONS.wsServer,
        data: { ...nodeStats.wsServer },
      },
      {
        id: 'matchmaking',
        type: 'matchmaking',
        position: NODE_POSITIONS.matchmaking,
        data: { ...nodeStats.matchmaking },
      },
      {
        id: 'gameArena',
        type: 'gameArena',
        position: NODE_POSITIONS.gameArena,
        data: { ...nodeStats.gameArena },
      },
      {
        id: 'worker',
        type: 'worker',
        position: NODE_POSITIONS.worker,
        data: { ...nodeStats.worker },
      },
      {
        id: 'leaderboard',
        type: 'leaderboard',
        position: NODE_POSITIONS.leaderboard,
        data: { ...nodeStats.leaderboard },
      },
      {
        id: 'postgres',
        type: 'postgres',
        position: NODE_POSITIONS.postgres,
        data: { ...nodeStats.postgres },
      },
      {
        id: 'redis',
        type: 'redis',
        position: NODE_POSITIONS.redis,
        data: { ...nodeStats.redis },
      },
    ],
    [metrics, nodeStats]
  );

  const edges: Edge[] = useMemo(
    () =>
      EDGE_DEFS.map((def) => {
        const activity = edgeActivities.get(def.id);
        return {
          id: def.id,
          source: def.source,
          sourceHandle: def.sourceHandle,
          target: def.target,
          targetHandle: def.targetHandle,
          type: 'animated',
          data: {
            active: activity?.active ?? false,
            label: activity?.label ?? '',
            count: activity?.count ?? 0,
            color: def.color,
          },
        };
      }),
    [edgeActivities]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a2235" />
        <Controls position="bottom-right" />
        <MiniMap
          position="bottom-left"
          nodeColor={(node) => {
            const colors: Record<string, string> = {
              userPool: '#8b5cf6',
              apiServer: '#6366f1',
              wsServer: '#06b6d4',
              matchmaking: '#eab308',
              gameArena: '#22c55e',
              worker: '#f97316',
              leaderboard: '#a855f7',
              postgres: '#3b82f6',
              redis: '#ef4444',
            };
            return colors[node.type || ''] || '#4b5563';
          }}
          maskColor="rgba(10, 14, 23, 0.7)"
          style={{ background: '#111827' }}
        />
      </ReactFlow>
    </div>
  );
}

'use client';

import React from 'react';
import { useStore } from '@/lib/store';

export default function StatsBar() {
  const metrics = useStore((s) => s.metrics);
  const nodeStats = useStore((s) => s.nodeStats);

  const stats = [
    { label: 'Users', value: metrics.totalUsers, icon: '👥', color: '#8b5cf6' },
    { label: 'Connected', value: metrics.connectedUsers, icon: '⚡', color: '#22c55e' },
    { label: 'Queue', value: metrics.usersInQueue, icon: '🎯', color: '#eab308' },
    { label: 'Matches', value: metrics.activeMatches, icon: '🎮', color: '#06b6d4' },
    { label: 'Completed', value: metrics.completedMatches, icon: '✅', color: '#a855f7' },
    { label: 'WS Msgs', value: nodeStats.wsServer.messagesIn, icon: '📨', color: '#6366f1' },
    { label: 'DB Queries', value: nodeStats.postgres.queries, icon: '🐘', color: '#3b82f6' },
    { label: 'Redis Ops', value: nodeStats.redis.operations, icon: '⚡', color: '#ef4444' },
    { label: 'Errors', value: metrics.errors, icon: '❌', color: metrics.errors > 0 ? '#ef4444' : '#4b5563' },
  ];

  return (
    <div className="h-10 bg-nebula-surface border-b border-nebula-border flex items-center px-4 gap-6 overflow-x-auto">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs">{stat.icon}</span>
          <span className="text-[10px] text-slate-500">{stat.label}</span>
          <span className="text-xs font-mono font-bold" style={{ color: stat.color }}>
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}

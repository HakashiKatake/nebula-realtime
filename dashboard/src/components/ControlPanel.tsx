'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';

export default function ControlPanel() {
  const {
    users,
    metrics,
    isLoadTesting,
    addUser,
    addUsers,
    connectAllUsers,
    connectUser,
    queueUser,
    queueAllConnected,
    startLoadTest,
    stopLoadTest,
    disconnectUser,
  } = useStore();

  const [loadTestCount, setLoadTestCount] = useState(10);
  const [batchCount, setBatchCount] = useState(5);
  const [isAdding, setIsAdding] = useState(false);

  const handleAddOne = async () => {
    setIsAdding(true);
    await addUser();
    setIsAdding(false);
  };

  const handleAddBatch = async () => {
    setIsAdding(true);
    await addUsers(batchCount);
    setIsAdding(false);
  };

  const handleLoadTest = async () => {
    if (isLoadTesting) {
      stopLoadTest();
    } else {
      await startLoadTest(loadTestCount);
    }
  };

  return (
    <div className="w-72 bg-nebula-surface border-r border-nebula-border flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-nebula-border">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-2xl">🌌</span> Nebula Realtime
        </h1>
        <p className="text-xs text-slate-500 mt-1">Multiplayer System Dashboard</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Quick Stats */}
        <Section title="System Overview">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Users" value={metrics.totalUsers} color="#8b5cf6" />
            <StatCard label="Connected" value={metrics.connectedUsers} color="#22c55e" />
            <StatCard label="In Queue" value={metrics.usersInQueue} color="#eab308" />
            <StatCard label="Matches" value={metrics.activeMatches} color="#06b6d4" />
            <StatCard label="Completed" value={metrics.completedMatches} color="#a855f7" />
            <StatCard label="Errors" value={metrics.errors} color="#ef4444" />
          </div>
        </Section>

        {/* User Management */}
        <Section title="User Simulation">
          <div className="space-y-2">
            <button
              onClick={handleAddOne}
              disabled={isAdding}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {isAdding ? 'Creating...' : '+ Add User'}
            </button>

            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={batchCount}
                onChange={(e) => setBatchCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                className="flex-1 bg-nebula-surface2 border border-nebula-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleAddBatch}
                disabled={isAdding}
                className="flex-1 py-2 px-3 rounded-lg bg-nebula-surface2 border border-nebula-border hover:border-indigo-500 text-slate-300 text-sm transition-colors disabled:opacity-50"
              >
                Add Batch
              </button>
            </div>
          </div>
        </Section>

        {/* Connection Controls */}
        <Section title="Connections">
          <div className="space-y-2">
            <button
              onClick={connectAllUsers}
              disabled={users.filter((u) => !u.connected).length === 0}
              className="w-full py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              ⚡ Connect All ({users.filter((u) => !u.connected).length})
            </button>
          </div>
        </Section>

        {/* Matchmaking */}
        <Section title="Matchmaking">
          <div className="space-y-2">
            <button
              onClick={queueAllConnected}
              disabled={users.filter((u) => u.wsReady && !u.inQueue && !u.inMatch).length === 0}
              className="w-full py-2 px-3 rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              🎯 Queue All ({users.filter((u) => u.wsReady && !u.inQueue && !u.inMatch).length})
            </button>
          </div>
        </Section>

        {/* Load Testing */}
        <Section title="Load Test">
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={2}
                max={200}
                value={loadTestCount}
                onChange={(e) => setLoadTestCount(Math.min(200, Math.max(2, Number(e.target.value))))}
                className="flex-1 bg-nebula-surface2 border border-nebula-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-xs text-slate-500">users</span>
            </div>
            <button
              onClick={handleLoadTest}
              className={`w-full py-2 px-3 rounded-lg text-white text-sm font-medium transition-colors ${
                isLoadTesting
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500'
              }`}
            >
              {isLoadTesting ? '⏹ Stop Load Test' : '🚀 Start Load Test'}
            </button>
          </div>
        </Section>

        {/* User List */}
        <Section title={`Users (${users.length})`}>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {users.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-3">No users yet. Add some above!</p>
            )}
            {users.slice(0, 50).map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-nebula-surface2/50 text-xs group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      background: user.inMatch
                        ? '#22c55e'
                        : user.inQueue
                        ? '#eab308'
                        : user.connected
                        ? '#06b6d4'
                        : '#4b5563',
                    }}
                  />
                  <span className="truncate text-slate-400">{user.username}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!user.connected && (
                    <MiniBtn onClick={() => connectUser(user.id)} title="Connect">
                      ⚡
                    </MiniBtn>
                  )}
                  {user.wsReady && !user.inQueue && !user.inMatch && (
                    <MiniBtn onClick={() => queueUser(user.id)} title="Queue">
                      🎯
                    </MiniBtn>
                  )}
                  {user.connected && (
                    <MiniBtn onClick={() => disconnectUser(user.id)} title="Disconnect">
                      ✕
                    </MiniBtn>
                  )}
                </div>
              </div>
            ))}
            {users.length > 50 && (
              <p className="text-xs text-slate-600 text-center py-1">
                +{users.length - 50} more...
              </p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-nebula-surface2 rounded-lg p-2 text-center">
      <div className="text-lg font-bold font-mono" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function MiniBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-5 h-5 flex items-center justify-center rounded text-[10px] hover:bg-nebula-border transition-colors"
    >
      {children}
    </button>
  );
}

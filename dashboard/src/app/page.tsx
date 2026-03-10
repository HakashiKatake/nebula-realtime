'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import ControlPanel from '@/components/ControlPanel';
import LiveFeed from '@/components/LiveFeed';
import StatsBar from '@/components/StatsBar';

// Dynamic import to avoid SSR issues with React Flow
const FlowCanvas = dynamic(() => import('@/components/FlowCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-nebula-bg">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">🌌</div>
        <p className="text-slate-500 text-sm">Initializing system topology...</p>
      </div>
    </div>
  ),
});

export default function DashboardPage() {
  const [feedHeight, setFeedHeight] = useState(200);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => setIsDragging(true);

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setFeedHeight(Math.max(100, Math.min(500, newHeight)));
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Left sidebar */}
      <ControlPanel />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top stats bar */}
        <StatsBar />

        {/* Flow canvas */}
        <div className="flex-1 relative">
          <FlowCanvas />
        </div>

        {/* Resize handle */}
        <div
          className={`h-1 cursor-row-resize flex-shrink-0 transition-colors ${
            isDragging ? 'bg-indigo-500' : 'bg-nebula-border hover:bg-indigo-500/50'
          }`}
          onMouseDown={handleMouseDown}
        />

        {/* Live feed */}
        <div style={{ height: feedHeight }} className="flex-shrink-0">
          <LiveFeed />
        </div>
      </div>
    </div>
  );
}

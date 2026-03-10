'use client';

import React, { useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import type { FeedEvent } from '@/lib/types';

const TYPE_STYLES: Record<FeedEvent['type'], { bg: string; text: string; badge: string }> = {
  info: { bg: 'bg-slate-800/40', text: 'text-slate-400', badge: 'bg-slate-600' },
  success: { bg: 'bg-green-900/20', text: 'text-green-400', badge: 'bg-green-600' },
  error: { bg: 'bg-red-900/20', text: 'text-red-400', badge: 'bg-red-600' },
  warn: { bg: 'bg-yellow-900/20', text: 'text-yellow-400', badge: 'bg-yellow-600' },
  ws: { bg: 'bg-cyan-900/20', text: 'text-cyan-400', badge: 'bg-cyan-600' },
  match: { bg: 'bg-purple-900/20', text: 'text-purple-400', badge: 'bg-purple-600' },
  action: { bg: 'bg-indigo-900/20', text: 'text-indigo-400', badge: 'bg-indigo-600' },
};

export default function LiveFeed() {
  const feed = useStore((s) => s.feed);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [feed.length]);

  return (
    <div className="flex flex-col h-full bg-nebula-surface border-t border-nebula-border">
      <div className="px-3 py-2 border-b border-nebula-border flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live Feed
        </h3>
        <span className="text-[10px] text-slate-600">{feed.length} events</span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {feed.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-4">
            Events will appear here as you interact with the system
          </p>
        )}
        {feed.map((event) => {
          const style = TYPE_STYLES[event.type];
          const time = new Date(event.timestamp);
          const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time
            .getMinutes()
            .toString()
            .padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${time
            .getMilliseconds()
            .toString()
            .padStart(3, '0')}`;

          return (
            <div
              key={event.id}
              className={`flex items-start gap-2 px-2 py-1 rounded text-xs ${style.bg} animate-in fade-in slide-in-from-top-1`}
            >
              <span className="text-slate-600 font-mono flex-shrink-0 text-[10px] mt-0.5">
                {timeStr}
              </span>
              <span
                className={`${style.badge} text-white px-1.5 py-0 rounded text-[10px] flex-shrink-0 leading-relaxed`}
              >
                {event.source}
              </span>
              <span className={`${style.text} break-all`}>{event.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

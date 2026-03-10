'use client';

import React from 'react';
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  EdgeLabelRenderer,
} from '@xyflow/react';

interface AnimatedEdgeData {
  active?: boolean;
  label?: string;
  count?: number;
  color?: string;
}

export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps & { data?: AnimatedEdgeData }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isActive = data?.active ?? false;
  const color = data?.color ?? (isActive ? '#6366f1' : '#2a3450');

  return (
    <>
      {/* Background edge (wider, for glow) */}
      {isActive && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: 6,
            opacity: 0.15,
            filter: `blur(4px)`,
          }}
        />
      )}

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: isActive ? 2.5 : 1.5,
          strokeDasharray: isActive ? '8 4' : '6 3',
          animation: isActive
            ? 'dashdraw 0.5s linear infinite'
            : 'dashdraw 2s linear infinite',
          opacity: isActive ? 1 : 0.4,
          transition: 'stroke 0.3s, opacity 0.3s, stroke-width 0.3s',
        }}
      />

      {/* Animated particles along edge when active */}
      {isActive && (
        <circle r="3" fill={color} opacity={0.8}>
          <animateMotion dur="1s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      {/* Label */}
      {data?.label && isActive && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="px-2 py-0.5 rounded-full text-[10px] font-mono whitespace-nowrap"
          >
            <span
              className="bg-nebula-surface border border-nebula-border rounded-full px-2 py-0.5"
              style={{ color, borderColor: `${color}50` }}
            >
              {data.label}
              {data.count && data.count > 1 ? (
                <span className="ml-1 text-slate-500">×{data.count}</span>
              ) : null}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = {
  animated: AnimatedEdge,
};

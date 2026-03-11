'use client';

import { useState } from 'react';

interface FunnelStep {
  stage: string;
  count: number;
  color?: string;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  title?: string;
  onStageClick?: (stage: string) => void;
}

const defaultColors = [
  'bg-blue-600', 'bg-blue-500', 'bg-cyan-500', 'bg-emerald-500',
  'bg-green-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500',
  'bg-pink-500',
];

export default function FunnelChart({ steps, title, onStageClick }: FunnelChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!steps.length) return null;

  const maxCount = Math.max(...steps.map(s => s.count), 1);
  const total = steps.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
      )}
      <div className="space-y-1.5">
        {steps.map((step, i) => {
          const pct = (step.count / maxCount) * 100;
          const convRate = i > 0 && steps[i - 1].count > 0
            ? ((step.count / steps[i - 1].count) * 100).toFixed(0)
            : null;
          const color = step.color || defaultColors[i % defaultColors.length];
          const isHovered = hoveredIndex === i;
          const pctOfTotal = total > 0 ? ((step.count / total) * 100).toFixed(0) : '0';

          return (
            <div key={step.stage} className="group relative">
              <div
                className={`flex items-center gap-3 ${onStageClick ? 'cursor-pointer' : ''}`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => onStageClick?.(step.stage)}
              >
                <span className="w-32 text-xs text-gray-400 text-right capitalize truncate">
                  {step.stage.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 relative">
                  <div className="bg-gray-800 rounded-full h-7 overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full flex items-center transition-all duration-500 ${
                        isHovered ? 'brightness-125' : ''
                      }`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    >
                      <span className="text-[11px] font-medium text-white pl-2 whitespace-nowrap">
                        {step.count.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-16 text-right">
                  <span className="text-xs text-gray-500">{pctOfTotal}%</span>
                </div>
                {convRate && (
                  <div className="w-12 text-right">
                    <span className={`text-[10px] ${
                      parseInt(convRate) >= 50 ? 'text-green-500' :
                      parseInt(convRate) >= 20 ? 'text-yellow-500' : 'text-gray-600'
                    }`}>
                      {convRate}%
                    </span>
                  </div>
                )}
              </div>

              {/* Hover tooltip */}
              {isHovered && (
                <div className="absolute left-36 -top-8 z-10 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 shadow-lg pointer-events-none">
                  <div className="text-[10px] text-gray-300">
                    <span className="font-medium text-white">{step.count.toLocaleString()}</span>
                    {' '}contacts · {pctOfTotal}% of total
                    {convRate && <span className="text-gray-500"> · {convRate}% from prev</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

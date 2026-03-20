'use client';

import { useState } from 'react';

interface HeatmapChartProps {
  title: string;
  grid: number[][]; // 7 rows (Sun–Sat) x 24 columns (0–23h)
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12a';
  if (i < 12) return `${i}a`;
  if (i === 12) return '12p';
  return `${i - 12}p`;
});

function getColor(value: number, max: number): string {
  if (max === 0 || value === 0) return 'bg-gray-800';
  const ratio = value / max;
  if (ratio <= 0.15) return 'bg-green-900/40';
  if (ratio <= 0.35) return 'bg-green-800/60';
  if (ratio <= 0.55) return 'bg-green-700/70';
  if (ratio <= 0.75) return 'bg-green-600/80';
  return 'bg-green-500';
}

export default function HeatmapChart({ title, grid }: HeatmapChartProps) {
  const [hovered, setHovered] = useState<{ day: number; hour: number } | null>(null);

  const max = Math.max(...grid.flat(), 1);
  const total = grid.flat().reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
        <span className="text-[10px] text-gray-500">Total: {total.toLocaleString()}</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex ml-10 mb-1">
            {HOUR_LABELS.map((label, i) => (
              <span
                key={i}
                className="flex-1 text-center text-[9px] text-gray-600"
              >
                {i % 3 === 0 ? label : ''}
              </span>
            ))}
          </div>

          {/* Grid rows */}
          {grid.map((row, dayIdx) => (
            <div key={dayIdx} className="flex items-center gap-1 mb-0.5">
              <span className="w-8 text-right text-[10px] text-gray-500 mr-1">
                {DAY_LABELS[dayIdx]}
              </span>
              {row.map((value, hourIdx) => {
                const isHovered = hovered?.day === dayIdx && hovered?.hour === hourIdx;
                return (
                  <div
                    key={hourIdx}
                    className={`flex-1 h-5 rounded-sm ${getColor(value, max)} transition-all duration-100 cursor-default relative ${
                      isHovered ? 'ring-1 ring-white/40 brightness-125' : ''
                    }`}
                    onMouseEnter={() => setHovered({ day: dayIdx, hour: hourIdx })}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {isHovered && value > 0 && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-20 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 shadow-lg pointer-events-none whitespace-nowrap">
                        <span className="text-[10px] text-white font-medium">{value}</span>
                        <span className="text-[10px] text-gray-500 ml-1">
                          {DAY_LABELS[dayIdx]} {HOUR_LABELS[hourIdx]}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 mt-2 mr-1">
            <span className="text-[9px] text-gray-600">Less</span>
            <div className="w-3 h-3 rounded-sm bg-gray-800" />
            <div className="w-3 h-3 rounded-sm bg-green-900/40" />
            <div className="w-3 h-3 rounded-sm bg-green-800/60" />
            <div className="w-3 h-3 rounded-sm bg-green-700/70" />
            <div className="w-3 h-3 rounded-sm bg-green-600/80" />
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span className="text-[9px] text-gray-600">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

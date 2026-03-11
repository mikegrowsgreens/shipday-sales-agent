'use client';

import { useState } from 'react';

interface DataPoint {
  label: string;
  value: number;
}

interface TrendChartProps {
  data: DataPoint[];
  title?: string;
  color?: string;
  height?: number;
  showValues?: boolean;
}

export default function TrendChart({
  data,
  title,
  color = 'bg-blue-500',
  height = 96,
  showValues = true,
}: TrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data.length) return null;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const avg = data.length > 0 ? (total / data.length).toFixed(1) : '0';
  const peak = Math.max(...data.map(d => d.value));
  const peakDay = data.find(d => d.value === peak)?.label || '';

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span>Total: <span className="text-gray-300">{total.toLocaleString()}</span></span>
            <span>Avg: <span className="text-gray-300">{avg}/day</span></span>
            <span>Peak: <span className="text-gray-300">{peak} ({peakDay})</span></span>
          </div>
        </div>
      )}
      <div className="relative">
        <div className="flex items-end gap-1" style={{ height }}>
          {data.map((d, i) => {
            const barHeight = (d.value / maxVal) * 100;
            const isHovered = hoveredIndex === i;
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-1 group relative"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Hover tooltip */}
                {isHovered && showValues && (
                  <div className="absolute -top-6 z-10 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 shadow-lg pointer-events-none whitespace-nowrap">
                    <span className="text-[10px] text-white font-medium">{d.value}</span>
                    <span className="text-[10px] text-gray-500 ml-1">{d.label}</span>
                  </div>
                )}
                <div
                  className={`w-full ${color} rounded-t min-h-[2px] transition-all duration-200 ${
                    isHovered ? 'brightness-125 opacity-100' : 'opacity-80'
                  }`}
                  style={{ height: `${barHeight}%` }}
                />
                {/* Show labels for every 3rd bar or fewer bars */}
                {(data.length <= 14 || i % 3 === 0) && (
                  <span className="text-[8px] text-gray-600 truncate w-full text-center">
                    {d.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {/* Average line */}
        {total > 0 && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-gray-600/40 pointer-events-none"
            style={{ bottom: `${((parseFloat(avg) / maxVal) * height)}px` }}
          >
            <span className="absolute right-0 -top-3 text-[8px] text-gray-600">avg</span>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Clock, TrendingUp, Loader2, Sun, Moon, BarChart3, AlertTriangle } from 'lucide-react';

interface HourlyData {
  hour: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  open_rate: number;
  reply_rate: number;
}

interface DowData {
  dow: number;
  day_name: string;
  sent: number;
  open_rate: number;
  reply_rate: number;
}

interface HeatmapCell {
  dow: number;
  hour: number;
  sent: number;
  opened: number;
  open_rate: number;
}

interface OptimalWindow {
  window_start: string;
  window_end: string;
  best_days: string[];
  avg_open_rate: number;
  avg_reply_rate: number;
  confidence: 'high' | 'medium' | 'low';
  sample_size: number;
}

interface SendTimeData {
  hourly: HourlyData[];
  day_of_week: DowData[];
  heatmap: HeatmapCell[];
  optimal_windows: OptimalWindow[];
  total_analyzed: number;
  analysis_days: number;
  timezone: string;
}

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN_SAMPLE = 10; // Minimum sends before treating open_rate as reliable

const confidenceColors = {
  high: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

/** Compute a display-friendly rate that penalizes low sample sizes */
function weightedRate(rate: number, sent: number): number {
  if (sent < 3) return 0;
  // Smoothly discount rates from small samples
  const confidence = Math.min(sent / MIN_SAMPLE, 1);
  return rate * confidence;
}

export default function SendTimeInsights() {
  const [data, setData] = useState<SendTimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'windows' | 'hourly' | 'heatmap'>('windows');

  useEffect(() => {
    fetch('/api/bdr/send-times')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(err => console.error('[send-times] fetch error:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (!data || data.total_analyzed === 0) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 text-center">
        <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Not enough data yet for send time analysis.</p>
        <p className="text-xs text-gray-600 mt-1">Send more emails to unlock insights.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-white">Send Time Optimization</span>
          <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
            {data.total_analyzed.toLocaleString()} emails / {data.analysis_days}d
          </span>
        </div>
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          {(['windows', 'hourly', 'heatmap'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                view === v ? 'bg-purple-600/30 text-purple-300' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {v === 'windows' ? 'Best Windows' : v === 'hourly' ? 'By Hour' : 'Heatmap'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {view === 'windows' && <WindowsView data={data} />}
        {view === 'hourly' && <HourlyView data={data} />}
        {view === 'heatmap' && <HeatmapView data={data} />}
      </div>
    </div>
  );
}

// ─── Windows View ──────────────────────────────────────────────────────────

function WindowsView({ data }: { data: SendTimeData }) {
  if (data.optimal_windows.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-4">
        Not enough data to determine optimal windows. Need 20+ sends per hour slot.
      </p>
    );
  }

  // Build full 7-day array, filling missing days with zeroes
  const fullWeek: DowData[] = Array.from({ length: 7 }, (_, i) => {
    const found = data.day_of_week.find(d => d.dow === i);
    return found || { dow: i, day_name: dayLabels[i], sent: 0, open_rate: 0, reply_rate: 0 };
  });

  // Use volume-weighted rates for bar heights to prevent outlier tiny samples from dominating
  const weightedRates = fullWeek.map(d => weightedRate(d.open_rate || 0, d.sent));
  const maxWeighted = Math.max(...weightedRates, 1);

  return (
    <div className="space-y-5">
      {/* Day of week performance */}
      <div>
        <h4 className="text-xs text-gray-400 font-medium mb-3 flex items-center gap-1.5">
          <BarChart3 className="w-3 h-3" />
          Day of Week Performance
        </h4>
        <div className="flex gap-1.5">
          {fullWeek.map((d, i) => {
            const wRate = weightedRates[i];
            const barHeight = Math.max(4, (wRate / maxWeighted) * 56);
            const isWeekend = d.dow === 0 || d.dow === 6;
            const hasData = d.sent > 0;
            const lowSample = d.sent > 0 && d.sent < MIN_SAMPLE;

            return (
              <div key={d.dow} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                {/* Tooltip */}
                <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                  <div className="font-medium text-white">{dayLabels[d.dow]}</div>
                  <div>Open: <span className="text-green-400">{d.open_rate}%</span></div>
                  <div>Reply: <span className="text-blue-400">{d.reply_rate}%</span></div>
                  <div className="text-gray-500">{d.sent} sent</div>
                  {lowSample && <div className="text-yellow-500 text-[9px]">⚠ Low sample</div>}
                </div>

                {/* Bar */}
                <div className="h-14 flex items-end w-full">
                  {hasData ? (
                    <div
                      className={`w-full rounded-t transition-colors ${
                        isWeekend ? 'bg-gray-700' :
                        lowSample ? 'bg-yellow-500/30' :
                        wRate >= maxWeighted * 0.75 ? 'bg-green-500/60' :
                        'bg-blue-500/40'
                      }`}
                      style={{ height: `${barHeight}px` }}
                    />
                  ) : (
                    <div className="w-full h-[2px] bg-gray-800 rounded" />
                  )}
                </div>

                {/* Label */}
                <span className={`text-[10px] font-medium ${isWeekend ? 'text-gray-600' : 'text-gray-400'}`}>
                  {dayLabels[d.dow]}
                </span>

                {/* Rate + count */}
                <span className="text-[9px] text-gray-500">
                  {hasData ? `${d.open_rate}%` : '—'}
                </span>
                <span className="text-[8px] text-gray-700">
                  {hasData ? `${d.sent}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optimal windows */}
      <div>
        <h4 className="text-xs text-gray-400 font-medium mb-2 flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3" />
          Recommended Send Windows (PST)
        </h4>
        <div className="space-y-2">
          {data.optimal_windows.map((w, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg border ${
                i === 0 ? 'border-purple-500/30 bg-purple-500/5' : 'border-gray-800 bg-gray-900/40'
              }`}
            >
              {/* Rank */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i === 0 ? 'bg-purple-600/30 text-purple-300' :
                i === 1 ? 'bg-blue-600/20 text-blue-300' :
                'bg-gray-800 text-gray-500'
              }`}>
                #{i + 1}
              </div>

              {/* Time window */}
              <div className="flex items-center gap-1.5 shrink-0">
                {parseInt(w.window_start) < 12 ? (
                  <Sun className="w-3.5 h-3.5 text-yellow-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                )}
                <span className="text-sm text-white font-medium">
                  {formatHour(w.window_start)} – {formatHour(w.window_end)}
                </span>
              </div>

              {/* Stats */}
              <div className="flex-1 flex items-center gap-4">
                <span className="text-xs text-gray-400">
                  Open: <span className="text-green-400 font-medium">{w.avg_open_rate}%</span>
                </span>
                <span className="text-xs text-gray-400">
                  Reply: <span className="text-blue-400 font-medium">{w.avg_reply_rate}%</span>
                </span>
                <span className="text-xs text-gray-500">
                  Best: {w.best_days.slice(0, 3).join(', ')}
                </span>
              </div>

              {/* Confidence */}
              <span className={`text-[10px] px-2 py-0.5 rounded border shrink-0 ${confidenceColors[w.confidence]}`}>
                {w.confidence} ({w.sample_size.toLocaleString()})
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-600 italic">
        Send time optimization is applied automatically when scheduling campaign follow-up steps.
        Emails are scheduled at the highest-performing hour based on {data.analysis_days}-day historical data.
      </p>
    </div>
  );
}

// ─── Hourly View ───────────────────────────────────────────────────────────

function HourlyView({ data }: { data: SendTimeData }) {
  // Fill in all business hours (6am - 10pm), zero-filling gaps
  const allHours: HourlyData[] = Array.from({ length: 17 }, (_, i) => {
    const hour = i + 6;
    const found = data.hourly.find(h => h.hour === hour);
    return found || { hour, sent: 0, opened: 0, clicked: 0, replied: 0, open_rate: 0, reply_rate: 0 };
  });

  // Use volume-weighted rates to prevent tiny-sample outliers
  const weightedRates = allHours.map(h => weightedRate(h.open_rate || 0, h.sent));
  const maxWeighted = Math.max(...weightedRates, 1);
  const maxSent = Math.max(...allHours.map(h => h.sent || 0), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-[3px]" style={{ height: '140px' }}>
        {allHours.map(h => {
          const wRate = weightedRates[h.hour - 6];
          const barHeight = h.sent > 0 ? Math.max(6, (wRate / maxWeighted) * 120) : 2;
          const sentOpacity = h.sent > 0 ? Math.max(0.3, (h.sent / maxSent)) : 0.1;
          const isOptimal = wRate >= maxWeighted * 0.75 && h.sent >= MIN_SAMPLE;
          const lowSample = h.sent > 0 && h.sent < MIN_SAMPLE;

          return (
            <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              {/* Tooltip */}
              <div className="absolute -top-[70px] left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-[10px] text-gray-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none shadow-lg">
                <div className="font-medium text-white">{formatHour(`${h.hour}:00`)} – {formatHour(`${h.hour + 1}:00`)}</div>
                <div>Open: <span className="text-green-400">{h.open_rate}%</span></div>
                <div>Reply: <span className="text-blue-400">{h.reply_rate}%</span></div>
                <div className="text-gray-500">{h.sent} sent</div>
                {lowSample && <div className="text-yellow-500 text-[9px]">⚠ Low sample size</div>}
              </div>

              {/* Bar */}
              <div
                className={`w-full rounded-t transition-all ${
                  h.sent === 0 ? 'bg-gray-800/50' :
                  lowSample ? 'bg-yellow-500/25' :
                  isOptimal ? 'bg-green-500/60' :
                  'bg-blue-500/40'
                }`}
                style={{ height: `${barHeight}px`, opacity: sentOpacity }}
              />
            </div>
          );
        })}
      </div>

      {/* Hour labels */}
      <div className="flex gap-[3px]">
        {allHours.map(h => (
          <div key={h.hour} className="flex-1 text-center">
            <span className="text-[9px] text-gray-600">
              {h.hour === 12 ? '12p' : h.hour > 12 ? `${h.hour - 12}p` : `${h.hour}a`}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center pt-2">
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <div className="w-3 h-3 bg-green-500/60 rounded" />
          Best performing
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <div className="w-3 h-3 bg-blue-500/40 rounded" />
          Normal
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <div className="w-3 h-3 bg-yellow-500/25 rounded" />
          Low sample
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          <div className="w-3 h-3 bg-gray-800/50 rounded" />
          No data
        </span>
      </div>
    </div>
  );
}

// ─── Heatmap View ──────────────────────────────────────────────────────────

function HeatmapView({ data }: { data: SendTimeData }) {
  const businessHours = Array.from({ length: 12 }, (_, i) => i + 7);

  // Use volume-weighted rate for color scale
  const weightedRates = data.heatmap.map(h => weightedRate(h.open_rate || 0, h.sent));
  const maxWeighted = Math.max(...weightedRates, 1);

  const getCell = (dow: number, hour: number) => {
    return data.heatmap.find(h => h.dow === dow && h.hour === hour);
  };

  const getCellColor = (cell: HeatmapCell) => {
    const wRate = weightedRate(cell.open_rate, cell.sent);
    const intensity = wRate / maxWeighted;
    if (intensity >= 0.75) return 'bg-green-500/70';
    if (intensity >= 0.5) return 'bg-green-500/40';
    if (intensity >= 0.3) return 'bg-blue-500/40';
    if (intensity >= 0.1) return 'bg-blue-500/20';
    return 'bg-gray-800/80';
  };

  return (
    <div className="space-y-1">
      {/* Header row (hours) */}
      <div className="flex items-center gap-[3px]">
        <div className="w-10 shrink-0" />
        {businessHours.map(h => (
          <div key={h} className="flex-1 text-center">
            <span className="text-[9px] text-gray-600">
              {h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`}
            </span>
          </div>
        ))}
      </div>

      {/* Day rows */}
      {[1, 2, 3, 4, 5, 0, 6].map(dow => (
        <div key={dow} className="flex items-center gap-[3px]">
          <span className={`w-10 shrink-0 text-[10px] font-medium ${dow === 0 || dow === 6 ? 'text-gray-600' : 'text-gray-400'}`}>
            {dayLabels[dow]}
          </span>
          {businessHours.map(hour => {
            const cell = getCell(dow, hour);
            return (
              <div
                key={hour}
                className={`flex-1 h-7 rounded-sm ${cell ? getCellColor(cell) : 'bg-gray-900/60'} group relative cursor-default`}
                title={cell ? `${dayLabels[dow]} ${hour}:00 — ${cell.open_rate}% open (${cell.sent} sent)` : `No data`}
              >
                {/* Hover overlay */}
                {cell && (
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[9px] text-gray-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none shadow-lg">
                    {cell.open_rate}% · {cell.sent} sent
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-3 justify-center pt-3">
        <span className="text-[10px] text-gray-600">Open rate:</span>
        <div className="flex items-center gap-0.5">
          <div className="w-5 h-3.5 bg-gray-900/60 rounded-sm" />
          <div className="w-5 h-3.5 bg-gray-800/80 rounded-sm" />
          <div className="w-5 h-3.5 bg-blue-500/20 rounded-sm" />
          <div className="w-5 h-3.5 bg-blue-500/40 rounded-sm" />
          <div className="w-5 h-3.5 bg-green-500/40 rounded-sm" />
          <div className="w-5 h-3.5 bg-green-500/70 rounded-sm" />
        </div>
        <span className="text-[10px] text-gray-600">High</span>
      </div>

      {data.heatmap.some(h => h.sent > 0 && h.sent < MIN_SAMPLE) && (
        <div className="flex items-center gap-1.5 justify-center pt-1">
          <AlertTriangle className="w-3 h-3 text-yellow-500/60" />
          <span className="text-[9px] text-gray-600">
            Colors are weighted by sample size — low-volume cells appear dimmer
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatHour(timeStr: string): string {
  const hour = parseInt(timeStr);
  if (hour === 0 || hour === 24) return '12am';
  if (hour === 12) return '12pm';
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

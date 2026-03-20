'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Loader2, TrendingUp, XCircle, UserX, Clock,
  CheckCircle, Webhook, AlertTriangle, BarChart3,
} from 'lucide-react';
import TrendChart from '@/components/analytics/TrendChart';
import { useToast } from '@/components/ui/Toast';

interface KPIs {
  total_bookings: number;
  cancellation_rate: number;
  no_show_rate: number;
  completion_rate: number;
  avg_lead_time_hours: number;
}

interface EventTypeCount {
  name: string;
  count: number;
  color: string;
}

interface DailyTrend {
  date: string;
  count: number;
}

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

interface WebhookStats {
  total: number;
  successful: number;
  failed: number;
}

interface AnalyticsData {
  kpis: KPIs;
  by_event_type: EventTypeCount[];
  daily_trend: DailyTrend[];
  heatmap: HeatmapCell[];
  webhook_stats: WebhookStats;
  period_days: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulingAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/analytics?days=${days}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      addToast('Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  }, [days, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-gray-400">
        Failed to load analytics data.
      </div>
    );
  }

  const { kpis, by_event_type, daily_trend, heatmap, webhook_stats } = data;

  // Build heatmap grid (hours 7-20, days 0-6)
  const heatmapGrid: number[][] = Array.from({ length: 7 }, () => Array(14).fill(0));
  const maxHeatCount = Math.max(...heatmap.map(h => h.count), 1);
  for (const cell of heatmap) {
    if (cell.hour >= 7 && cell.hour <= 20) {
      heatmapGrid[cell.day][cell.hour - 7] = cell.count;
    }
  }

  // Prepare trend chart data
  const trendData = daily_trend.map(d => ({
    label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: d.count,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/calendar" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Scheduling Analytics</h1>
            <p className="text-gray-400 text-sm mt-0.5">Booking insights and trends</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                days === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard icon={Calendar} label="Total Bookings" value={kpis.total_bookings} color="blue" />
        <KpiCard icon={CheckCircle} label="Completion Rate" value={`${kpis.completion_rate}%`} color="green" />
        <KpiCard icon={XCircle} label="Cancellation Rate" value={`${kpis.cancellation_rate}%`} color="red" />
        <KpiCard icon={UserX} label="No-Show Rate" value={`${kpis.no_show_rate}%`} color="orange" />
        <KpiCard icon={Clock} label="Avg Lead Time" value={`${kpis.avg_lead_time_hours}h`} color="purple" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-6">
        {/* Daily Trend */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-4">
          <TrendChart
            data={trendData}
            title="Bookings Over Time"
            color="bg-blue-500"
            height={120}
          />
        </div>

        {/* By Event Type */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-500" />
            By Event Type
          </h3>
          {by_event_type.length === 0 ? (
            <p className="text-gray-500 text-sm">No data yet</p>
          ) : (
            <div className="space-y-2">
              {by_event_type.map(et => {
                const maxCount = Math.max(...by_event_type.map(e => e.count), 1);
                const pct = Math.round((et.count / maxCount) * 100);
                return (
                  <div key={et.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-300 truncate">{et.name}</span>
                      <span className="text-gray-400 ml-2">{et.count}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: et.color || '#3b82f6' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Heatmap + Webhook Stats */}
      <div className="grid grid-cols-3 gap-6">
        {/* Heatmap */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            Popular Booking Times
          </h3>
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              {/* Hour labels */}
              <div className="flex ml-10 mb-1">
                {Array.from({ length: 14 }, (_, i) => i + 7).map(h => (
                  <div key={h} className="flex-1 text-center text-[10px] text-gray-500">
                    {h > 12 ? `${h - 12}p` : h === 12 ? '12p' : `${h}a`}
                  </div>
                ))}
              </div>
              {/* Grid */}
              {DAY_LABELS.map((day, dayIdx) => (
                <div key={day} className="flex items-center mb-1">
                  <span className="w-10 text-xs text-gray-500 shrink-0">{day}</span>
                  <div className="flex flex-1 gap-0.5">
                    {heatmapGrid[dayIdx].map((count, hourIdx) => {
                      const intensity = count > 0 ? Math.max(0.15, count / maxHeatCount) : 0;
                      return (
                        <div
                          key={hourIdx}
                          className="flex-1 aspect-square rounded-sm"
                          style={{
                            backgroundColor: count > 0
                              ? `rgba(59, 130, 246, ${intensity})`
                              : 'rgba(255,255,255,0.03)',
                          }}
                          title={`${day} ${hourIdx + 7}:00 — ${count} booking${count !== 1 ? 's' : ''}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Webhook Stats */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Webhook className="w-4 h-4 text-gray-500" />
            Webhook Deliveries
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Total Sent</span>
              <span className="text-sm font-medium text-white">{webhook_stats.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-400" /> Successful
              </span>
              <span className="text-sm font-medium text-green-400">{webhook_stats.successful}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Failed
              </span>
              <span className="text-sm font-medium text-red-400">{webhook_stats.failed}</span>
            </div>
            {webhook_stats.total > 0 && (
              <div className="pt-2 border-t border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Success Rate</span>
                  <span className="text-sm font-medium text-white">
                    {Math.round((webhook_stats.successful / webhook_stats.total) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${(webhook_stats.successful / webhook_stats.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <Link
            href="/calendar/webhooks"
            className="mt-4 block text-center text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            View Webhook Log →
          </Link>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'text-blue-400' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400', icon: 'text-green-400' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', icon: 'text-red-400' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', icon: 'text-orange-400' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: 'text-purple-400' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
      </div>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
    </div>
  );
}

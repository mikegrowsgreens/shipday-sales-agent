'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, BarChart3, Users, TrendingUp, Activity, Target, Mail, AlertCircle } from 'lucide-react';
import FunnelChart from '@/components/analytics/FunnelChart';
import TrendChart from '@/components/analytics/TrendChart';

interface FunnelStep { stage: string; count: string }
interface ChannelMetric { channel: string; total: string; replied: string; booked: string }
interface SequencePerf { name: string; enrolled: string; completed: string; replied: string }
interface TrendPoint { day: string; count: string }
interface BdrStep { status: string; count: string }

interface AnalyticsData {
  funnel: FunnelStep[];
  channels: ChannelMetric[];
  sequences: SequencePerf[];
  trend: TrendPoint[];
  bdrFunnel: BdrStep[];
}

const periods = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
] as const;

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('30d');

  const fetchAnalytics = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?period=${p}`);
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setData(await res.json());
    } catch (err) {
      console.error('[analytics] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(period);
  }, [fetchAnalytics, period]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm text-gray-300">{error}</p>
          <button onClick={() => fetchAnalytics(period)} className="text-xs text-blue-400 hover:text-blue-300 underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { funnel, channels, sequences, trend, bdrFunnel } = data;

  const totalContacts = funnel.reduce((sum, f) => sum + parseInt(f.count), 0);
  const totalTouchpoints = channels.reduce((sum, c) => sum + parseInt(c.total), 0);
  const totalReplied = channels.reduce((sum, c) => sum + parseInt(c.replied), 0);
  const overallReplyRate = totalTouchpoints > 0 ? ((totalReplied / totalTouchpoints) * 100).toFixed(1) : '0';

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header with period toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">Universal touchpoint analytics across all channels</p>
        </div>
        <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                period === p.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs text-gray-400">Total Contacts</span>
          </div>
          <p className="text-xl font-bold text-white">{totalContacts.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs text-gray-400">Touchpoints</span>
          </div>
          <p className="text-xl font-bold text-white">{totalTouchpoints.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs text-gray-400">Replies</span>
          </div>
          <p className="text-xl font-bold text-green-400">{totalReplied.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs text-gray-400">Reply Rate</span>
          </div>
          <p className="text-xl font-bold text-blue-400">{overallReplyRate}%</p>
        </div>
      </div>

      {/* CRM Lifecycle Funnel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" /> CRM Lifecycle Funnel ({totalContacts} contacts)
        </h3>
        <FunnelChart
          steps={funnel.map(f => ({ stage: f.stage, count: parseInt(f.count) }))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Performance */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Channel Performance
          </h3>
          {channels.length > 0 ? (
            <div className="space-y-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-2">Channel</th>
                    <th className="text-right py-2">Total</th>
                    <th className="text-right py-2">Replied</th>
                    <th className="text-right py-2">Booked</th>
                    <th className="text-right py-2">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map(c => {
                    const total = parseInt(c.total);
                    const replied = parseInt(c.replied);
                    const rate = total > 0 ? ((replied / total) * 100).toFixed(0) : '0';
                    return (
                      <tr key={c.channel} className="border-t border-gray-800">
                        <td className="py-2 text-gray-300 capitalize">{c.channel}</td>
                        <td className="py-2 text-right text-white">{c.total}</td>
                        <td className="py-2 text-right text-green-400">{c.replied}</td>
                        <td className="py-2 text-right text-blue-400">{c.booked}</td>
                        <td className="py-2 text-right text-yellow-400">{rate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Channel bar chart */}
              <div className="space-y-1.5 pt-2 border-t border-gray-800">
                {channels.map(c => {
                  const total = parseInt(c.total);
                  const maxTotal = Math.max(...channels.map(ch => parseInt(ch.total)), 1);
                  const pct = (total / maxTotal) * 100;
                  return (
                    <div key={c.channel + '-bar'} className="flex items-center gap-2">
                      <span className="w-16 text-[10px] text-gray-500 capitalize text-right">{c.channel}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 w-8 text-right">{total}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">No touchpoint data yet</p>
          )}
        </div>

        {/* Sequence Performance */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Target className="w-4 h-4" /> Sequence Performance
          </h3>
          {sequences.length > 0 ? (
            <div className="space-y-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-2">Sequence</th>
                    <th className="text-right py-2">Enrolled</th>
                    <th className="text-right py-2">Completed</th>
                    <th className="text-right py-2">Replied</th>
                  </tr>
                </thead>
                <tbody>
                  {sequences.map(s => (
                    <tr key={s.name} className="border-t border-gray-800">
                      <td className="py-2 text-gray-300 truncate max-w-[160px]">{s.name}</td>
                      <td className="py-2 text-right text-white">{s.enrolled}</td>
                      <td className="py-2 text-right text-gray-400">{s.completed}</td>
                      <td className="py-2 text-right text-green-400">{s.replied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Sequence completion bars */}
              <div className="space-y-1.5 pt-2 border-t border-gray-800">
                {sequences.map(s => {
                  const enrolled = parseInt(s.enrolled);
                  const completed = parseInt(s.completed);
                  const replied = parseInt(s.replied);
                  const completionPct = enrolled > 0 ? (completed / enrolled) * 100 : 0;
                  const replyPct = enrolled > 0 ? (replied / enrolled) * 100 : 0;
                  return (
                    <div key={s.name + '-bar'}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-gray-500 truncate max-w-[120px]">{s.name}</span>
                        <span className="text-[10px] text-gray-600">{completionPct.toFixed(0)}% done</span>
                      </div>
                      <div className="flex gap-0.5 h-2">
                        <div className="bg-green-600 rounded-l" style={{ width: `${replyPct}%` }} />
                        <div className="bg-blue-600" style={{ width: `${completionPct - replyPct}%` }} />
                        <div className="bg-gray-700 rounded-r flex-1" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">No sequences yet</p>
          )}
        </div>
      </div>

      {/* Activity Trend */}
      {trend.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <TrendChart
            title={`Daily Activity (${period === '7d' ? '7d' : period === '30d' ? '30d' : '90d'})`}
            data={trend.map(t => ({
              label: new Date(t.day).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
              value: parseInt(t.count),
            }))}
            color="bg-blue-600"
          />
        </div>
      )}

      {/* BDR Pipeline */}
      {bdrFunnel.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> BDR Pipeline Distribution
          </h3>
          <FunnelChart
            steps={bdrFunnel.map(b => ({ stage: b.status, count: parseInt(b.count) }))}
          />
        </div>
      )}
    </div>
  );
}

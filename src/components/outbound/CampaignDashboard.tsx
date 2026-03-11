'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3, Send, Eye, MousePointerClick, MessageSquare,
  TrendingUp, Clock, Loader2, Target, Layers,
} from 'lucide-react';

const angleLabels: Record<string, string> = {
  missed_calls: 'Missed Calls',
  commission_savings: 'Commission',
  delivery_ops: 'Delivery Ops',
  delivery_savings: 'Delivery Savings',
  tech_consolidation: 'Tech Stack',
  customer_experience: 'CX',
  unknown: 'Unknown',
};

const sentimentColors: Record<string, string> = {
  positive: 'bg-green-500',
  interested: 'bg-emerald-500',
  neutral: 'bg-gray-500',
  negative: 'bg-red-500',
  not_interested: 'bg-red-400',
  unknown: 'bg-gray-600',
};

interface AnglePerf {
  angle: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  avgOpens: number;
}

interface TierPerf {
  tier: string;
  sent: number;
  opened: number;
  replied: number;
  openRate: number;
  replyRate: number;
}

interface TimeSeriesPoint {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
}

interface BestHour {
  hour: number;
  sent: number;
  openRate: number;
  replyRate: number;
}

interface DashboardData {
  days: number;
  summary: Record<string, string>;
  timeSeries: TimeSeriesPoint[];
  anglePerf: AnglePerf[];
  tierPerf: TierPerf[];
  sentimentDist: Array<{ sentiment: string; count: number }>;
  bestHours: BestHour[];
}

export default function CampaignDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/bdr/campaigns/performance?days=${days}`)
      .then(res => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-gray-500 text-center py-10">Failed to load dashboard data</p>;
  }

  const s = data.summary;
  const totalSent = parseInt(s.total_sent || '0');
  const totalOpened = parseInt(s.total_opened || '0');
  const totalClicked = parseInt(s.total_clicked || '0');
  const totalReplied = parseInt(s.total_replied || '0');
  const openRate = parseFloat(s.open_rate || '0');
  const clickRate = parseFloat(s.click_rate || '0');
  const replyRate = parseFloat(s.reply_rate || '0');

  // Find best angle
  const bestAngle = data.anglePerf.length > 0
    ? data.anglePerf.reduce((best, a) => (a.replyRate > best.replyRate && a.sent >= 3) ? a : best, data.anglePerf[0])
    : null;

  // Find best hour
  const bestHour = data.bestHours.length > 0 ? data.bestHours[0] : null;

  // Time series chart (simple ASCII-style bar chart)
  const maxSent = Math.max(...data.timeSeries.map(t => t.sent), 1);

  // Total sentiment counts for pie-like display
  const totalSentiment = data.sentimentDist.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          Campaign Performance
        </h3>
        <div className="flex gap-1">
          {[7, 14, 30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                days === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard icon={Send} label="Sent" value={totalSent} color="text-gray-400" />
        <KpiCard icon={Eye} label="Opened" value={totalOpened} sub={`${openRate}%`} color="text-yellow-400" />
        <KpiCard icon={MousePointerClick} label="Clicked" value={totalClicked} sub={`${clickRate}%`} color="text-cyan-400" />
        <KpiCard icon={MessageSquare} label="Replied" value={totalReplied} sub={`${replyRate}%`} color="text-green-400" />
      </div>

      {/* Insights row */}
      <div className="grid grid-cols-2 gap-4">
        {bestAngle && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-gray-400 uppercase">Best Performing Angle</span>
            </div>
            <div className="text-lg font-bold text-white">
              {angleLabels[bestAngle.angle] || bestAngle.angle}
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
              <span>{bestAngle.replyRate}% reply rate</span>
              <span>{bestAngle.openRate}% open rate</span>
              <span>{bestAngle.sent} sent</span>
            </div>
          </div>
        )}
        {bestHour && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium text-gray-400 uppercase">Best Send Time</span>
            </div>
            <div className="text-lg font-bold text-white">
              {bestHour.hour > 12 ? `${bestHour.hour - 12}:00 PM` : `${bestHour.hour}:00 AM`} PT
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
              <span>{bestHour.openRate}% open rate</span>
              <span>{bestHour.replyRate}% reply rate</span>
              <span>{bestHour.sent} emails</span>
            </div>
          </div>
        )}
      </div>

      {/* Time series chart */}
      {data.timeSeries.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs font-medium text-gray-400 uppercase mb-3">Daily Volume</div>
          <div className="flex items-end gap-1 h-24">
            {data.timeSeries.map(t => {
              const h = Math.max((t.sent / maxSent) * 100, 4);
              const openPct = t.sent > 0 ? (t.opened / t.sent) : 0;
              return (
                <div key={t.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div
                    className={`w-full rounded-t transition-colors ${
                      openPct > 0.5 ? 'bg-green-600' : openPct > 0.2 ? 'bg-yellow-600' : 'bg-gray-600'
                    }`}
                    style={{ height: `${h}%` }}
                    title={`${t.date}: ${t.sent} sent, ${t.opened} opened, ${t.replied} replied`}
                  />
                  {/* Tooltip on hover */}
                  <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <div className="font-medium">{new Date(t.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div>
                    <div className="text-gray-400">{t.sent} sent / {t.opened} opened / {t.replied} replied</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-600">
              {data.timeSeries.length > 0 && new Date(data.timeSeries[0].date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
            <span className="text-[10px] text-gray-600">
              {data.timeSeries.length > 0 && new Date(data.timeSeries[data.timeSeries.length - 1].date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      )}

      {/* Angle performance table */}
      {data.anglePerf.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-medium text-gray-400 uppercase">Angle Comparison</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left py-2 font-medium">Angle</th>
                <th className="text-right py-2 font-medium">Sent</th>
                <th className="text-right py-2 font-medium">Open %</th>
                <th className="text-right py-2 font-medium">Click %</th>
                <th className="text-right py-2 font-medium">Reply %</th>
                <th className="text-right py-2 font-medium w-32">Performance</th>
              </tr>
            </thead>
            <tbody>
              {data.anglePerf.map(a => (
                <tr key={a.angle} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 text-white font-medium">{angleLabels[a.angle] || a.angle}</td>
                  <td className="text-right text-gray-400">{a.sent}</td>
                  <td className="text-right text-yellow-400">{a.openRate}%</td>
                  <td className="text-right text-cyan-400">{a.clickRate}%</td>
                  <td className="text-right text-green-400 font-medium">{a.replyRate}%</td>
                  <td className="text-right py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${Math.min(a.replyRate * 5, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tier breakdown + Sentiment dist side by side */}
      <div className="grid grid-cols-2 gap-4">
        {/* Tier breakdown */}
        {data.tierPerf.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs font-medium text-gray-400 uppercase mb-3">Tier Performance</div>
            <div className="space-y-3">
              {data.tierPerf.map(t => (
                <div key={t.tier} className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-14 ${
                    t.tier === 'tier_1' ? 'text-yellow-400' :
                    t.tier === 'tier_2' ? 'text-blue-400' : 'text-gray-400'
                  }`}>
                    {(t.tier || 'unknown').replace('_', ' ').toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                      <span>{t.sent} sent</span>
                      <span>{t.replyRate}% replies</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(t.openRate, 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sentiment distribution */}
        {data.sentimentDist.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs font-medium text-gray-400 uppercase mb-3">Reply Sentiment</div>
            {/* Stacked bar */}
            <div className="flex h-4 rounded-full overflow-hidden mb-3">
              {data.sentimentDist.map(s => (
                <div
                  key={s.sentiment}
                  className={`${sentimentColors[s.sentiment] || 'bg-gray-500'}`}
                  style={{ width: `${(s.count / totalSentiment) * 100}%` }}
                  title={`${s.sentiment}: ${s.count}`}
                />
              ))}
            </div>
            <div className="space-y-1">
              {data.sentimentDist.map(s => (
                <div key={s.sentiment} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${sentimentColors[s.sentiment] || 'bg-gray-500'}`} />
                    <span className="text-gray-400 capitalize">{s.sentiment}</span>
                  </div>
                  <span className="text-white font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Best send hours */}
      {data.bestHours.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs font-medium text-gray-400 uppercase mb-3">Send Time Analysis (PT)</div>
          <div className="flex items-end gap-2 h-16">
            {data.bestHours.slice(0, 12).map(h => {
              const maxRate = Math.max(...data.bestHours.map(x => x.openRate), 1);
              const height = Math.max((h.openRate / maxRate) * 100, 8);
              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-blue-600 rounded-t"
                    style={{ height: `${height}%` }}
                    title={`${h.hour > 12 ? h.hour - 12 : h.hour}${h.hour >= 12 ? 'PM' : 'AM'}: ${h.openRate}% opens, ${h.replyRate}% replies`}
                  />
                  <span className="text-[9px] text-gray-600 mt-1">
                    {h.hour > 12 ? `${h.hour - 12}p` : `${h.hour}a`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500 uppercase">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value.toLocaleString()}</div>
      {sub && (
        <div className={`text-xs ${color} mt-0.5 flex items-center gap-1`}>
          <TrendingUp className="w-3 h-3" />
          {sub}
        </div>
      )}
    </div>
  );
}

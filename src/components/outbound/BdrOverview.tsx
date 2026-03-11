'use client';

import { useEffect, useState } from 'react';
import { Mail, MousePointerClick, MessageSquare, Calendar, Users, Send, Target, TrendingUp } from 'lucide-react';
import KpiGrid from '@/components/ui/KpiGrid';
import type { KpiItem } from '@/components/ui/KpiGrid';

interface BdrStats {
  pipeline: Array<{ status: string; count: number }>;
  emailStats: Record<string, string>;
  anglePerf: Array<Record<string, string>>;
  tierDist: Array<{ tier: string; count: number }>;
  recentReplies: Array<Record<string, unknown>>;
  demosFromOutreach: number;
}

const statusOrder = [
  'raw', 'enriched', 'scored', 'email_ready', 'approved', 'sent', 'replied', 'demo_opportunity', 'won', 'lost',
];

const statusColors: Record<string, string> = {
  raw: 'bg-gray-600',
  enriched: 'bg-blue-600',
  scored: 'bg-cyan-600',
  email_ready: 'bg-yellow-600',
  approved: 'bg-orange-600',
  sent: 'bg-purple-600',
  replied: 'bg-green-600',
  demo_opportunity: 'bg-emerald-600',
  won: 'bg-green-500',
  lost: 'bg-red-600',
  rejected: 'bg-red-500',
  hold: 'bg-gray-500',
  bounced: 'bg-red-400',
};

const angleLabels: Record<string, string> = {
  missed_calls: 'Missed Calls',
  commission_savings: 'Commission',
  delivery_ops: 'Delivery Ops',
  delivery_savings: 'Delivery Savings',
  tech_consolidation: 'Tech Stack',
  customer_experience: 'CX',
};

export default function BdrOverview() {
  const [stats, setStats] = useState<BdrStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/bdr/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center text-gray-500 py-12">Loading stats...</div>;
  }

  if (!stats) {
    return <div className="text-center text-red-400 py-12">Failed to load stats</div>;
  }

  const es = stats.emailStats;
  const totalLeads = stats.pipeline.reduce((sum, p) => sum + p.count, 0);

  const kpis: KpiItem[] = [
    { label: 'Total Leads', value: totalLeads, icon: Users },
    { label: 'Emails Sent', value: es.total_sent || '0', icon: Send },
    { label: 'Open Rate', value: `${es.open_rate || '0'}`, suffix: '%', icon: MousePointerClick },
    { label: 'Reply Rate', value: `${es.reply_rate || '0'}`, suffix: '%', icon: MessageSquare },
    { label: 'Opened', value: es.opened || '0', icon: Mail },
    { label: 'Replied', value: es.replied || '0', icon: MessageSquare, color: 'text-green-400' },
    { label: 'Demos', value: stats.demosFromOutreach, icon: Calendar, color: stats.demosFromOutreach > 0 ? 'text-green-400' : 'text-white' },
    { label: 'Email Ready', value: stats.pipeline.find(p => p.status === 'email_ready')?.count || 0, icon: Target, color: 'text-yellow-400' },
  ];

  // Sort pipeline by status order
  const sortedPipeline = [...stats.pipeline].sort((a, b) => {
    const ai = statusOrder.indexOf(a.status);
    const bi = statusOrder.indexOf(b.status);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-6">
      <KpiGrid items={kpis} />

      {/* Pipeline Funnel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Pipeline Funnel</h3>
        <div className="space-y-2">
          {sortedPipeline.map(({ status, count }) => {
            const pct = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="w-28 text-xs text-gray-400 text-right capitalize">{status.replace(/_/g, ' ')}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full ${statusColors[status] || 'bg-gray-600'} rounded-full flex items-center justify-end pr-2`}
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  >
                    {count > 0 && <span className="text-[10px] font-medium text-white">{count}</span>}
                  </div>
                </div>
                <span className="w-12 text-xs text-gray-500 text-right">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Angle Performance */}
      {stats.anglePerf.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Angle Performance
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left py-2">Angle</th>
                  <th className="text-right py-2">Sent</th>
                  <th className="text-right py-2">Opens</th>
                  <th className="text-right py-2">Replies</th>
                  <th className="text-right py-2">Open %</th>
                  <th className="text-right py-2">Reply %</th>
                </tr>
              </thead>
              <tbody>
                {stats.anglePerf.map((a) => (
                  <tr key={a.angle} className="border-t border-gray-800">
                    <td className="py-2 text-gray-300">{angleLabels[a.angle] || a.angle}</td>
                    <td className="py-2 text-right text-white">{a.sent}</td>
                    <td className="py-2 text-right text-white">{a.opens}</td>
                    <td className="py-2 text-right text-green-400">{a.replies}</td>
                    <td className="py-2 text-right text-white">{a.open_rate || '0'}%</td>
                    <td className="py-2 text-right text-white">{a.reply_rate || '0'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Replies */}
      {stats.recentReplies.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Replies</h3>
          <div className="space-y-2">
            {stats.recentReplies.map((r, i) => (
              <div key={i} className="bg-gray-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-white">{String(r.business_name || '')}</span>
                  {typeof r.reply_sentiment === 'string' && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      r.reply_sentiment === 'positive' ? 'bg-green-600/20 text-green-400' :
                      r.reply_sentiment === 'negative' ? 'bg-red-600/20 text-red-400' :
                      'bg-gray-600/20 text-gray-400'
                    }`}>
                      {r.reply_sentiment}
                    </span>
                  )}
                </div>
                {typeof r.reply_summary === 'string' && (
                  <p className="text-xs text-gray-400">{r.reply_summary}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

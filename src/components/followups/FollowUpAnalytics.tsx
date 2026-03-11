'use client';

import { useState, useEffect } from 'react';
import { Loader2, BarChart3, TrendingUp, Send, Edit3, Target } from 'lucide-react';

interface TouchStat {
  touch_number: number;
  total: number;
  sent: number;
  approved: number;
  pending: number;
}

interface StageBreakdown {
  pipeline_stage: string;
  count: number;
  with_campaign: number;
}

interface CompletionStat {
  completion_bucket: string;
  deal_count: number;
}

interface DailyActivity {
  action_date: string;
  action_count: number;
  sends: number;
  approvals: number;
  generations: number;
}

interface Analytics {
  overview: {
    total_deals: number;
    active_deals: number;
    total_drafts: number;
    total_sent: number;
    total_approved: number;
    total_pending: number;
  };
  touchStats: TouchStat[];
  stageBreakdown: StageBreakdown[];
  recentActivity: DailyActivity[];
  completionStats: CompletionStat[];
  editStats: { edited_count: number; untouched_count: number };
}

const completionColors: Record<string, string> = {
  complete: 'bg-green-500',
  in_progress: 'bg-yellow-500',
  not_started: 'bg-gray-600',
  no_campaign: 'bg-gray-800',
};

const completionLabels: Record<string, string> = {
  complete: 'All Sent',
  in_progress: 'In Progress',
  not_started: 'Not Started',
  no_campaign: 'No Campaign',
};

export default function FollowUpAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/followups/analytics');
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error('[analytics] fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { overview, touchStats, stageBreakdown, completionStats, editStats } = data;
  const maxTouchTotal = Math.max(...touchStats.map(t => Number(t.total)), 1);
  const totalCompletionDeals = completionStats.reduce((s, c) => s + Number(c.deal_count), 0) || 1;
  const totalEdited = Number(editStats.edited_count) + Number(editStats.untouched_count);
  const editRate = totalEdited > 0 ? Math.round((Number(editStats.edited_count) / totalEdited) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total Deals" value={overview.total_deals} icon={<Target className="w-4 h-4 text-blue-400" />} />
        <Kpi label="Emails Sent" value={overview.total_sent} icon={<Send className="w-4 h-4 text-green-400" />} />
        <Kpi label="Scheduled" value={overview.total_approved} icon={<TrendingUp className="w-4 h-4 text-yellow-400" />} />
        <Kpi label="Edit Rate" value={`${editRate}%`} icon={<Edit3 className="w-4 h-4 text-purple-400" />} subtitle={`${editStats.edited_count} of ${totalEdited} drafts`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Send rate by touch number */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-gray-300">Sends by Touch Number</span>
          </div>
          <div className="space-y-2">
            {touchStats.map(t => {
              const sentPct = Math.round((Number(t.sent) / Math.max(Number(t.total), 1)) * 100);
              return (
                <div key={t.touch_number} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-6 text-right">T{t.touch_number}</span>
                  <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-green-500/60 rounded-full transition-all"
                      style={{ width: `${(Number(t.sent) / maxTouchTotal) * 100}%` }}
                    />
                    <div
                      className="h-full bg-yellow-500/40 rounded-full absolute top-0"
                      style={{ left: `${(Number(t.sent) / maxTouchTotal) * 100}%`, width: `${(Number(t.approved) / maxTouchTotal) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 w-14 text-right">
                    {t.sent}/{t.total} ({sentPct}%)
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            Drop-off from T1 to T{touchStats.length} shows campaign follow-through.
          </p>
        </div>

        {/* Campaign completion funnel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-green-400" />
            <span className="text-xs font-semibold text-gray-300">Campaign Completion</span>
          </div>
          <div className="space-y-2">
            {completionStats.map(c => {
              const pct = Math.round((Number(c.deal_count) / totalCompletionDeals) * 100);
              return (
                <div key={c.completion_bucket} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-20 truncate">{completionLabels[c.completion_bucket] || c.completion_bucket}</span>
                  <div className="flex-1 h-4 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${completionColors[c.completion_bucket] || 'bg-gray-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 w-12 text-right">
                    {c.deal_count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>

          {/* Stage breakdown */}
          <div className="mt-4 pt-3 border-t border-gray-800">
            <span className="text-[10px] text-gray-500 uppercase">By Pipeline Stage</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {stageBreakdown.map(s => (
                <div key={s.pipeline_stage} className="bg-gray-800 rounded px-2 py-1">
                  <span className="text-[10px] text-gray-300">{s.pipeline_stage.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] text-gray-500 ml-1">
                    {s.count} ({s.with_campaign} w/ campaign)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon, subtitle }: { label: string; value: string | number; icon: React.ReactNode; subtitle?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-gray-500 uppercase">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">{value}</div>
      {subtitle && <span className="text-[10px] text-gray-600">{subtitle}</span>}
    </div>
  );
}

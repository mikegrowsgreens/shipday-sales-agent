'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import DateRangeSelector from '@/components/ui/DateRangeSelector';
import FunnelChart from '@/components/analytics/FunnelChart';
import TrendChart from '@/components/analytics/TrendChart';
import {
  Users,
  Workflow,
  ListTodo,
  Mail,
  MousePointerClick,
  MessageSquare,
  Calendar,
  Send,
  Target,
  Phone,
  ArrowRight,
  TrendingUp,
  Briefcase,
  FileText,
  AlertCircle,
  Loader2,
  Eye,
  BarChart3,
  Activity,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  crm: {
    total_contacts: number;
    active_sequences: number;
    pending_tasks: number;
    emails_sent: number;
    open_rate: number;
    reply_rate: number;
    demos_booked: number;
    contacts_by_stage: Record<string, number>;
    touchpoints_by_channel: Record<string, number>;
  };
  bdr: {
    total_leads: number;
    email_ready: number;
    sent: number;
    total_opens: number;
    open_rate: number;
    reply_rate: number;
    demo_opps: number;
  };
  postDemo: {
    active_deals: number;
    drafts_pending: number;
    followups_sent: number;
    response_rate: number;
  };
  actions: { label: string; count: number; href: string; color: string }[];
  replies: { lead_id: string; business_name: string; reply_snippet: string; replied_at: string; sentiment: string }[];
  trend?: { day: string; count: string }[];
  range: string;
}

// ─── Components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  suffix,
  color = 'text-white',
  trend,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  suffix?: string;
  color?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; label: string };
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{label}</span>
        <Icon className="w-3.5 h-3.5 text-gray-600" />
      </div>
      <div className={`text-xl font-bold ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="text-sm font-normal text-gray-400 ml-1">{suffix}</span>}
      </div>
      {trend && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className={`text-[10px] ${
            trend.direction === 'up' ? 'text-green-400' :
            trend.direction === 'down' ? 'text-red-400' : 'text-gray-500'
          }`}>
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.label}
          </span>
        </div>
      )}
    </div>
  );
}

const stageConfig = [
  { key: 'raw', label: 'Raw', color: 'bg-gray-600' },
  { key: 'enriched', label: 'Enriched', color: 'bg-blue-600' },
  { key: 'outreach', label: 'Outreach', color: 'bg-cyan-600' },
  { key: 'engaged', label: 'Engaged', color: 'bg-yellow-600' },
  { key: 'demo_completed', label: 'Demo', color: 'bg-orange-600' },
  { key: 'negotiation', label: 'Negotiation', color: 'bg-purple-600' },
  { key: 'won', label: 'Won', color: 'bg-green-600' },
  { key: 'lost', label: 'Lost', color: 'bg-red-600' },
  { key: 'nurture', label: 'Nurture', color: 'bg-pink-600' },
];

const sentimentColors: Record<string, string> = {
  positive: 'text-green-400 bg-green-600/20',
  neutral: 'text-gray-400 bg-gray-600/20',
  negative: 'text-red-400 bg-red-600/20',
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState('30d');

  const fetchData = useCallback(async (r: string, from?: string, to?: string) => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/dashboard?range=${r}`;
      if (r === 'custom' && from) {
        url += `&from=${from}`;
        if (to) url += `&to=${to}`;
      }
      const res = await fetch(url);
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API error ${res.status}: ${body}`);
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('API returned non-JSON response. You may need to log in again.');
      }
      setData(await res.json());
    } catch (err) {
      console.error('[dashboard] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(range);
  }, [fetchData, range]);

  const handleRangeChange = (newRange: string, from?: string, to?: string) => {
    setRange(newRange);
    fetchData(newRange, from, to);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-sm text-gray-300">{error}</p>
          <button
            onClick={() => fetchData(range)}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { crm: stats, bdr, postDemo, actions, replies, trend } = data;

  // Build funnel data from contacts_by_stage
  const funnelSteps = stageConfig
    .filter(s => (stats.contacts_by_stage[s.key] || 0) > 0)
    .map(s => ({
      stage: s.label,
      count: stats.contacts_by_stage[s.key] || 0,
      color: s.color,
    }));

  // Build trend data if available
  const trendData = (trend || []).map(t => ({
    label: new Date(t.day).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    value: parseInt(t.count),
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            Unified KPIs across all channels and touchpoints
          </p>
        </div>
        <DateRangeSelector value={range} onChange={handleRangeChange} />
      </div>

      {/* Action Summary */}
      {actions.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> Action Items
          </h2>
          <div className="flex flex-wrap gap-2">
            {actions.map(a => (
              <Link
                key={a.href + a.label}
                href={a.href}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors group"
              >
                <span className={`text-lg font-bold ${a.color}`}>{a.count}</span>
                <span className="text-xs text-gray-400 group-hover:text-gray-300">{a.label}</span>
                <ArrowRight className="w-3 h-3 text-gray-600 group-hover:text-gray-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* CRM KPIs */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3">CRM Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Contacts" value={stats.total_contacts} icon={Users} />
          <StatCard label="Active Sequences" value={stats.active_sequences} icon={Workflow} />
          <StatCard label="Pending Tasks" value={stats.pending_tasks} icon={ListTodo} color={stats.pending_tasks > 0 ? 'text-yellow-400' : 'text-white'} />
          <StatCard label="Calendly Demos" value={stats.demos_booked} icon={Calendar} color={stats.demos_booked > 0 ? 'text-green-400' : 'text-white'} />
        </div>
      </div>

      {/* Email Performance */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3">
          Email Performance
          <span className="font-normal text-gray-600 normal-case ml-2">All channels</span>
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Emails Sent" value={stats.emails_sent} icon={Mail} />
          <StatCard label="Open Rate" value={stats.emails_sent > 0 ? stats.open_rate.toFixed(1) : '0'} suffix={stats.emails_sent > 0 ? '%' : undefined} icon={MousePointerClick} />
          <StatCard label="Reply Rate" value={stats.emails_sent > 0 ? stats.reply_rate.toFixed(1) : '0'} suffix={stats.emails_sent > 0 ? '%' : undefined} icon={MessageSquare} />
        </div>
      </div>

      {/* BDR + Post-Demo KPIs side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BDR Outbound */}
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
            <Send className="w-3 h-3" /> BDR Outbound
            <span className="font-normal text-gray-600 normal-case">Cold outreach</span>
          </h2>
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Leads" value={bdr.total_leads} icon={Target} />
            <StatCard label="Emails Sent" value={bdr.sent} icon={Send} />
            <StatCard label="Total Opens" value={bdr.total_opens} icon={Eye} color={bdr.total_opens > 0 ? 'text-cyan-400' : 'text-white'} />
            <StatCard label="Open Rate" value={bdr.sent > 0 ? bdr.open_rate.toFixed(1) : '0'} suffix={bdr.sent > 0 ? '%' : undefined} icon={MousePointerClick} />
            <StatCard label="Reply Rate" value={bdr.sent > 0 ? bdr.reply_rate.toFixed(1) : '0'} suffix={bdr.sent > 0 ? '%' : undefined} icon={MessageSquare} />
            <StatCard label="Ready to Send" value={bdr.email_ready} icon={Mail} color={bdr.email_ready > 0 ? 'text-blue-400' : 'text-white'} />
            <StatCard label="Demo Stage" value={bdr.demo_opps} icon={Calendar} color={bdr.demo_opps > 0 ? 'text-green-400' : 'text-white'} />
          </div>
        </div>

        {/* Post-Demo Follow-Ups */}
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
            <Briefcase className="w-3 h-3" /> Post-Demo Pipeline
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Active Deals" value={postDemo.active_deals} icon={Briefcase} color={postDemo.active_deals > 0 ? 'text-purple-400' : 'text-white'} />
            <StatCard label="Drafts Pending" value={postDemo.drafts_pending} icon={FileText} color={postDemo.drafts_pending > 0 ? 'text-yellow-400' : 'text-white'} />
            <StatCard label="Follow-Ups Sent" value={postDemo.followups_sent} icon={Mail} />
            <StatCard label="Response Rate" value={postDemo.followups_sent > 0 ? postDemo.response_rate.toFixed(1) : '0'} suffix={postDemo.followups_sent > 0 ? '%' : undefined} icon={TrendingUp} />
          </div>
        </div>
      </div>

      {/* Funnel + Trend side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Funnel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Pipeline Funnel
            </h2>
            <Link href="/pipeline" className="text-[10px] text-blue-400 hover:text-blue-300">
              View Pipeline →
            </Link>
          </div>
          {funnelSteps.length > 0 ? (
            <FunnelChart steps={funnelSteps} />
          ) : (
            <p className="text-xs text-gray-500 text-center py-8">No pipeline data yet</p>
          )}
        </div>

        {/* Activity Trend */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Activity Trend
            </h2>
            <Link href="/analytics" className="text-[10px] text-blue-400 hover:text-blue-300">
              Full Analytics →
            </Link>
          </div>
          {trendData.length > 0 ? (
            <TrendChart data={trendData} color="bg-blue-600" />
          ) : (
            <p className="text-xs text-gray-500 text-center py-8">No activity data yet</p>
          )}
        </div>
      </div>

      {/* Recent Replies */}
      {replies.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Recent Replies
          </h2>
          <div className="space-y-2">
            {replies.map(r => (
              <div key={r.lead_id + r.replied_at} className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">{r.business_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sentimentColors[r.sentiment] || sentimentColors.neutral}`}>
                      {r.sentiment}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{r.reply_snippet}</p>
                </div>
                <span className="text-[10px] text-gray-600 whitespace-nowrap">
                  {r.replied_at ? new Date(r.replied_at).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Channel Activity */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Phone className="w-4 h-4" /> Channel Activity
        </h2>
        {Object.keys(stats.touchpoints_by_channel).length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(stats.touchpoints_by_channel)
              .sort(([, a], [, b]) => b - a)
              .map(([channel, count]) => (
                <div key={channel} className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-white">{count.toLocaleString()}</div>
                  <div className="text-xs text-gray-400 capitalize">{channel}</div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No touchpoints recorded yet. Enroll contacts in sequences to start tracking.</p>
        )}
      </div>
    </div>
  );
}

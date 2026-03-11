'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2, Mail, Phone, Star, ArrowRight, Clock, Users, Loader2,
  TrendingUp, Target, BarChart3, Zap, ChevronDown, ChevronUp, DollarSign,
} from 'lucide-react';
import { LifecycleStage } from '@/lib/types';

interface PipelineContact {
  contact_id: number;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  lifecycle_stage: LifecycleStage;
  lead_score: number;
  engagement_score: number;
  updated_at: string;
  last_touch: string | null;
  touch_count: number;
}

interface Forecast {
  weighted_pipeline: number;
  best_case: number;
  conservative: number;
  deals_by_stage: Record<string, { count: number; weighted_value: number }>;
}

interface Metrics {
  email: {
    sent: number;
    opened: number;
    replied: number;
    open_rate: number;
    reply_rate: number;
  };
  bdr_funnel: Record<string, number>;
  velocity: Record<string, number>;
  angle_performance: {
    angle: string;
    total: number;
    replied: number;
    demos: number;
    reply_rate: number;
  }[];
  forecast?: Forecast;
}

const columns: { key: LifecycleStage; label: string; color: string; dotColor: string }[] = [
  { key: 'outreach', label: 'Outreach', color: 'border-cyan-600', dotColor: 'bg-cyan-500' },
  { key: 'engaged', label: 'Engaged', color: 'border-yellow-600', dotColor: 'bg-yellow-500' },
  { key: 'demo_completed', label: 'Demo Done', color: 'border-orange-600', dotColor: 'bg-orange-500' },
  { key: 'negotiation', label: 'Negotiation', color: 'border-purple-600', dotColor: 'bg-purple-500' },
  { key: 'won', label: 'Won', color: 'border-green-600', dotColor: 'bg-green-500' },
  { key: 'lost', label: 'Lost', color: 'border-red-600', dotColor: 'bg-red-500' },
];

const angleLabels: Record<string, string> = {
  missed_calls: 'Missed Calls',
  commission_savings: 'Commission Savings',
  delivery_ops: 'Delivery Ops',
  delivery_savings: 'Delivery Savings',
  tech_consolidation: 'Tech Consolidation',
  customer_experience: 'Customer Experience',
};

function ContactCard({ contact }: { contact: PipelineContact }) {
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || 'Unknown';
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(contact.updated_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Link href={`/contacts/${contact.contact_id}`}>
      <div className="bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 rounded-lg p-3 cursor-pointer transition-all hover:border-gray-600 group">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {contact.business_name ? (
              <>
                <div className="flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-gray-400 shrink-0" />
                  <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white">{contact.business_name}</p>
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">{name}</p>
              </>
            ) : (
              <p className="text-sm font-medium text-gray-200 truncate group-hover:text-white">
                {name}
              </p>
            )}
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 shrink-0 mt-0.5" />
        </div>

        <div className="flex items-center gap-2 mt-2">
          {contact.lead_score > 0 && (
            <div className="flex items-center gap-0.5">
              <Star className="w-3 h-3 text-yellow-500" />
              <span className="text-[10px] text-yellow-500 font-medium">{contact.lead_score}</span>
            </div>
          )}
          {contact.email && <Mail className="w-3 h-3 text-gray-500" />}
          {contact.phone && <Phone className="w-3 h-3 text-gray-500" />}
          {contact.touch_count > 0 && (
            <span className="text-[10px] text-gray-500 ml-auto">
              {contact.touch_count} touch{contact.touch_count !== 1 ? 'es' : ''}
            </span>
          )}
          {daysSinceUpdate > 7 && (
            <div className="flex items-center gap-0.5 ml-auto">
              <Clock className="w-3 h-3 text-red-400" />
              <span className="text-[10px] text-red-400">{daysSinceUpdate}d</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function MetricCard({ label, value, subtitle, icon: Icon, color }: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: typeof TrendingUp;
  color: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export default function PipelinePage() {
  const [contacts, setContacts] = useState<PipelineContact[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [upstreamCounts, setUpstreamCounts] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('90d');
  const [sort, setSort] = useState('updated');
  const [showMetrics, setShowMetrics] = useState(true);

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range, sort });
      const res = await fetch(`/api/pipeline?${params}`);
      const data = await res.json();
      setContacts(data.contacts || []);
      setCounts(data.counts || {});
      setUpstreamCounts(data.upstreamCounts || {});
      setMetrics(data.metrics || null);
    } catch (err) {
      console.error('[pipeline] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [range, sort]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  // Group contacts by stage
  const grouped: Record<string, PipelineContact[]> = {};
  for (const col of columns) {
    grouped[col.key] = [];
  }
  for (const c of contacts) {
    if (grouped[c.lifecycle_stage]) {
      grouped[c.lifecycle_stage].push(c);
    }
  }

  const totalActive = Object.values(counts).reduce((a, b) => a + b, 0);
  const rawCount = upstreamCounts['raw'] || 0;
  const enrichedCount = upstreamCounts['enriched'] || 0;

  // Calculate conversion rates between adjacent stages
  const conversionRates: Record<string, number> = {};
  for (let i = 0; i < columns.length - 2; i++) {
    const fromCount = counts[columns[i].key] || 0;
    const toCount = counts[columns[i + 1].key] || 0;
    const key = `${columns[i].key}_to_${columns[i + 1].key}`;
    conversionRates[key] = fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0;
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pipeline</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalActive} active contacts · {rawCount + enrichedCount} upstream leads
          </p>
        </div>
        <button
          onClick={() => setShowMetrics(!showMetrics)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Metrics
          {showMetrics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Conversion Metrics Panel */}
      {showMetrics && metrics && (
        <div className="space-y-4">
          {/* KPI Row */}
          <div className="grid grid-cols-5 gap-3">
            <MetricCard
              label="Emails Sent (30d)"
              value={metrics.email.sent}
              subtitle={`${metrics.email.open_rate}% open rate`}
              icon={Mail}
              color="bg-blue-600"
            />
            <MetricCard
              label="Opens (30d)"
              value={metrics.email.opened}
              subtitle={`${metrics.email.open_rate}% of ${metrics.email.sent} sent`}
              icon={Target}
              color="bg-cyan-600"
            />
            <MetricCard
              label="Replies (30d)"
              value={metrics.email.replied}
              subtitle={`${metrics.email.reply_rate}% reply rate`}
              icon={TrendingUp}
              color="bg-green-600"
            />
            <MetricCard
              label="Won"
              value={counts['won'] || 0}
              subtitle="Closed deals"
              icon={Star}
              color="bg-yellow-600"
            />
            <MetricCard
              label="Pipeline Active"
              value={totalActive}
              subtitle={`${Object.keys(metrics.velocity).length} stages tracked`}
              icon={Zap}
              color="bg-purple-600"
            />
          </div>

          {/* Revenue Forecast */}
          {metrics.forecast && metrics.forecast.weighted_pipeline > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Revenue Forecast (Monthly)
              </h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 mb-1">Conservative</p>
                  <p className="text-lg font-bold text-gray-400">${metrics.forecast.conservative.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 mb-1">Weighted</p>
                  <p className="text-lg font-bold text-green-400">${metrics.forecast.weighted_pipeline.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 mb-1">Best Case</p>
                  <p className="text-lg font-bold text-blue-400">${metrics.forecast.best_case.toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {Object.entries(metrics.forecast.deals_by_stage).map(([stage, data]) => {
                  const maxVal = Math.max(...Object.values(metrics.forecast!.deals_by_stage).map(d => d.weighted_value), 1);
                  const pct = (data.weighted_value / maxVal) * 100;
                  const stageLabel = columns.find(c => c.key === stage)?.label || stage;
                  return (
                    <div key={stage} className="flex items-center gap-2">
                      <span className="w-20 text-[10px] text-gray-500 text-right">{stageLabel}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full bg-green-600/50 rounded-full transition-all"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 w-16 text-right">
                        ${data.weighted_value.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-gray-600 w-6 text-right">{data.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Funnel + Angle Performance */}
          <div className="grid grid-cols-2 gap-3">
            {/* Stage Funnel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-400 mb-3">Stage Conversion Funnel</h3>
              <div className="space-y-2">
                {columns.slice(0, -1).map((col, i) => {
                  const count = counts[col.key] || 0;
                  const maxCount = Math.max(...columns.map(c => counts[c.key] || 0), 1);
                  const barWidth = Math.max((count / maxCount) * 100, 4);
                  const nextCol = columns[i + 1];
                  const convKey = `${col.key}_to_${nextCol?.key}`;
                  const convRate = conversionRates[convKey] || 0;
                  const avgDays = metrics.velocity[col.key] || 0;

                  return (
                    <div key={col.key}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${col.dotColor} shrink-0`} />
                        <span className="text-xs text-gray-300 w-20 shrink-0">{col.label}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${col.dotColor} bg-opacity-40 flex items-center px-2`}
                            style={{ width: `${barWidth}%` }}
                          >
                            <span className="text-[10px] text-white font-medium whitespace-nowrap">{count}</span>
                          </div>
                        </div>
                        {avgDays > 0 && (
                          <span className="text-[10px] text-gray-600 w-12 text-right shrink-0">~{avgDays}d</span>
                        )}
                      </div>
                      {nextCol && i < columns.length - 2 && (
                        <div className="flex items-center gap-2 pl-4 py-0.5">
                          <span className="text-[10px] text-gray-600 ml-20">↓ {convRate}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Angle Performance */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-gray-400 mb-3">Email Angle Performance (90d)</h3>
              {metrics.angle_performance.length > 0 ? (
                <div className="space-y-2.5">
                  {metrics.angle_performance.map(a => {
                    const maxTotal = Math.max(...metrics.angle_performance.map(x => x.total), 1);
                    return (
                      <div key={a.angle} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-300">
                            {angleLabels[a.angle] || a.angle.replace(/_/g, ' ')}
                          </span>
                          <div className="flex items-center gap-3 text-[10px]">
                            <span className="text-gray-500">{a.total} sent</span>
                            <span className="text-blue-400">{a.replied} replies</span>
                            <span className="text-green-400">{a.demos} demos</span>
                            <span className="text-yellow-400 font-medium">{a.reply_rate}%</span>
                          </div>
                        </div>
                        <div className="flex gap-0.5 h-2">
                          <div
                            className="bg-blue-600/40 rounded-l"
                            style={{ width: `${(a.replied / Math.max(a.total, 1)) * (a.total / maxTotal) * 100}%` }}
                          />
                          <div
                            className="bg-gray-700 rounded-r"
                            style={{ width: `${((a.total - a.replied) / Math.max(a.total, 1)) * (a.total / maxTotal) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-600 text-center py-6">No angle data yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="7d">Last 7 days</option>
          <option value="14d">Last 14 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="updated">Sort by Last Updated</option>
          <option value="score">Sort by Lead Score</option>
          <option value="touches">Sort by Touches</option>
        </select>

        <div className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
          <Users className="w-3.5 h-3.5" />
          <span>Upstream: {rawCount} raw, {enrichedCount} enriched</span>
          <Link href="/outbound" className="text-blue-400 hover:text-blue-300 ml-2">
            View in Outbound →
          </Link>
        </div>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-6 px-6">
          {columns.map((col) => {
            const stageContacts = grouped[col.key] || [];
            const count = counts[col.key] || 0;
            const displayContacts = stageContacts.slice(0, 50);
            const overflow = count - displayContacts.length;

            return (
              <div
                key={col.key}
                className={`shrink-0 w-64 bg-gray-900/50 border-t-2 ${col.color} rounded-xl`}
              >
                <div className="p-3 border-b border-gray-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                        {col.label}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                      {count}
                    </span>
                  </div>
                  {metrics?.velocity[col.key] && metrics.velocity[col.key] > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-2.5 h-2.5 text-gray-600" />
                      <span className="text-[10px] text-gray-600">
                        ~{metrics.velocity[col.key]}d avg
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-2 space-y-2 max-h-[calc(100vh-500px)] overflow-y-auto scrollbar-thin">
                  {displayContacts.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs text-gray-600">No contacts</p>
                    </div>
                  ) : (
                    displayContacts.map((contact) => (
                      <ContactCard key={contact.contact_id} contact={contact} />
                    ))
                  )}
                  {overflow > 0 && (
                    <div className="text-center py-2">
                      <span className="text-[10px] text-gray-500">
                        +{overflow} more contacts
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

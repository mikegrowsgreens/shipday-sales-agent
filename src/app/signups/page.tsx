'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Search, MapPin, UserPlus, TrendingUp, ArrowRight,
  ChevronDown, ChevronUp, AlertTriangle, Users, Zap, Target,
  BarChart3, Linkedin, RefreshCw, Filter, ArrowUpRight,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Signup {
  signup_id: number;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  plan_type: string | null;
  state: string | null;
  city: string | null;
  phone_area_code: number | null;
  territory_match: boolean;
  signup_date: string | null;
  funnel_stage: string | null;
  attribution_channel: string | null;
  attribution_source: string | null;
  converted_to_lead: boolean;
  contact_id: number | null;
  contact_lifecycle: string | null;
}

interface CohortRow {
  cohort_week: string;
  total: number;
  signup: number;
  activation: number;
  first_delivery: number;
  retained: number;
  churned: number;
  converted: number;
}

interface CohortSummary {
  total: number;
  activation_rate: number;
  delivery_rate: number;
  retention_rate: number;
  churn_rate: number;
  avg_days_to_activation: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FUNNEL_STAGES = ['signup', 'activation', 'first_delivery', 'retained', 'churned'] as const;

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  signup: { label: 'Signed Up', color: 'text-blue-400', bg: 'bg-blue-600/20' },
  activation: { label: 'Activated', color: 'text-yellow-400', bg: 'bg-yellow-600/20' },
  first_delivery: { label: '1st Delivery', color: 'text-green-400', bg: 'bg-green-600/20' },
  retained: { label: 'Retained', color: 'text-emerald-400', bg: 'bg-emerald-600/20' },
  churned: { label: 'Churned', color: 'text-red-400', bg: 'bg-red-600/20' },
};

const CHANNEL_COLORS: Record<string, string> = {
  organic: 'bg-gray-500',
  email: 'bg-blue-500',
  linkedin: 'bg-sky-500',
  referral: 'bg-green-500',
  paid: 'bg-purple-500',
  chat: 'bg-yellow-500',
  cold_call: 'bg-orange-500',
  partner: 'bg-pink-500',
  other: 'bg-gray-600',
};

const ATTRIBUTION_CHANNELS = ['organic', 'email', 'linkedin', 'referral', 'paid', 'chat', 'cold_call', 'partner', 'other'];

// ─── Component ──────────────────────────────────────────────────────────────

export default function SignupsPage() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [territory, setTerritory] = useState('mine');
  const [stageFilter, setStageFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [territoryTotal, setTerritoryTotal] = useState(0);
  const [otherTotal, setOtherTotal] = useState(0);
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [attribution, setAttribution] = useState<Record<string, number>>({});
  const [stalledCount, setStalledCount] = useState(0);

  // Cohort state
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [cohortSummary, setCohortSummary] = useState<CohortSummary | null>(null);
  const [cohortWeeks, setCohortWeeks] = useState(12);
  const [showCohorts, setShowCohorts] = useState(false);

  // Actions
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<string | null>(null);
  const [updatingStage, setUpdatingStage] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'signups' | 'linkedin'>('signups');

  // LinkedIn activity
  const [liActivities, setLiActivities] = useState<Record<string, unknown>[]>([]);
  const [liStats, setLiStats] = useState<{ action_type: string; total: number; accepted: number; sent: number }[]>([]);
  const [liLoading, setLiLoading] = useState(false);

  // ─── Fetch signups ───────────────────────────────────────────────────────

  const fetchSignups = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ territory });
      if (search) params.set('search', search);
      if (stageFilter) params.set('stage', stageFilter);
      if (channelFilter) params.set('channel', channelFilter);
      const res = await fetch(`/api/signups?${params}`);
      const data = await res.json();
      setSignups(data.signups || []);
      setTerritoryTotal(parseInt(data.territory_total || '0'));
      setOtherTotal(parseInt(data.other_total || '0'));
      setFunnel(data.funnel || {});
      setAttribution(data.attribution || {});
      setStalledCount(data.stalled_count || 0);
    } catch (err) {
      console.error('[signups] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, territory, stageFilter, channelFilter]);

  // ─── Fetch cohorts ───────────────────────────────────────────────────────

  const fetchCohorts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ weeks: String(cohortWeeks), territory });
      const res = await fetch(`/api/signups/cohorts?${params}`);
      const data = await res.json();
      setCohorts(data.cohorts || []);
      setCohortSummary(data.summary || null);
    } catch (err) {
      console.error('[cohorts] fetch error:', err);
    }
  }, [cohortWeeks, territory]);

  // ─── Fetch LinkedIn activity ─────────────────────────────────────────────

  const fetchLinkedIn = useCallback(async () => {
    setLiLoading(true);
    try {
      const res = await fetch('/api/linkedin/activity?days=30&limit=20');
      const data = await res.json();
      setLiActivities(data.activities || []);
      setLiStats(data.stats || []);
    } catch (err) {
      console.error('[linkedin] fetch error:', err);
    } finally {
      setLiLoading(false);
    }
  }, []);

  useEffect(() => { fetchSignups(); }, [fetchSignups]);
  useEffect(() => { if (showCohorts) fetchCohorts(); }, [showCohorts, fetchCohorts]);
  useEffect(() => { if (activeTab === 'linkedin') fetchLinkedIn(); }, [activeTab, fetchLinkedIn]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const convertStalled = async () => {
    setConverting(true);
    setConvertResult(null);
    try {
      const res = await fetch('/api/signups/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stalled: true }),
      });
      const data = await res.json();
      setConvertResult(`Converted ${data.converted} of ${data.total_eligible} stalled signups to leads`);
      fetchSignups();
    } catch {
      setConvertResult('Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const convertSingle = async (signupId: number) => {
    try {
      await fetch('/api/signups/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signup_ids: [signupId] }),
      });
      fetchSignups();
    } catch (err) {
      console.error('[convert] error:', err);
    }
  };

  const updateFunnelStage = async (signupId: number, newStage: string) => {
    setUpdatingStage(signupId);
    try {
      await fetch('/api/signups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signup_id: signupId, funnel_stage: newStage }),
      });
      fetchSignups();
    } catch (err) {
      console.error('[stage update] error:', err);
    } finally {
      setUpdatingStage(null);
    }
  };

  const updateAttribution = async (signupId: number, channel: string) => {
    try {
      await fetch('/api/signups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signup_id: signupId, attribution_channel: channel }),
      });
      fetchSignups();
    } catch (err) {
      console.error('[attribution update] error:', err);
    }
  };

  // ─── Derived ─────────────────────────────────────────────────────────────

  const totalSignups = Object.values(funnel).reduce((a, b) => a + b, 0);
  const funnelTotal = totalSignups || 1;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Signups & Growth</h1>
          <p className="text-sm text-gray-400 mt-1">
            Funnel tracking, cohort analysis, attribution — {territoryTotal} in territory, {otherTotal} other
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSignups}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ═══ KPI Cards — Funnel Stages ═══ */}
      <div className="grid grid-cols-5 gap-3">
        {FUNNEL_STAGES.map((stage, i) => {
          const config = STAGE_CONFIG[stage];
          const count = funnel[stage] || 0;
          const pct = totalSignups > 0 ? ((count / totalSignups) * 100).toFixed(1) : '0';
          const prevCount = i > 0 ? (funnel[FUNNEL_STAGES[i - 1]] || 0) : totalSignups;
          const convRate = prevCount > 0 && i > 0 ? ((count / prevCount) * 100).toFixed(0) : null;

          return (
            <button
              key={stage}
              onClick={() => setStageFilter(stageFilter === stage ? '' : stage)}
              className={`bg-gray-900 border rounded-xl p-4 text-left transition-all ${
                stageFilter === stage ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}>
                  {config.label}
                </span>
                {convRate && (
                  <span className="text-[10px] text-gray-500">{convRate}% conv</span>
                )}
              </div>
              <div className="text-2xl font-bold text-white">{count}</div>
              <div className="text-[10px] text-gray-500 mt-1">{pct}% of total</div>
            </button>
          );
        })}
      </div>

      {/* ═══ Funnel Visualization ═══ */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          Signup Funnel
        </h3>
        <div className="flex items-center gap-1">
          {FUNNEL_STAGES.filter(s => s !== 'churned').map((stage, i) => {
            const config = STAGE_CONFIG[stage];
            const count = funnel[stage] || 0;
            const widthPct = Math.max((count / funnelTotal) * 100, 8);
            return (
              <div key={stage} className="flex items-center">
                <div
                  className={`${config.bg} rounded-lg py-3 px-4 flex items-center justify-center min-w-[60px] transition-all`}
                  style={{ width: `${widthPct}%`, minWidth: '80px' }}
                >
                  <div className="text-center">
                    <div className={`text-lg font-bold ${config.color}`}>{count}</div>
                    <div className="text-[10px] text-gray-400">{config.label}</div>
                  </div>
                </div>
                {i < 3 && (
                  <ArrowRight className="w-4 h-4 text-gray-600 mx-1 shrink-0" />
                )}
              </div>
            );
          })}
          {(funnel['churned'] || 0) > 0 && (
            <div className="ml-4 flex items-center gap-2">
              <div className="w-px h-8 bg-gray-700" />
              <div className={`${STAGE_CONFIG.churned.bg} rounded-lg py-2 px-3 text-center`}>
                <div className="text-sm font-bold text-red-400">{funnel['churned'] || 0}</div>
                <div className="text-[10px] text-gray-400">Churned</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Attribution + Stalled Alert Row ═══ */}
      <div className="grid grid-cols-3 gap-4">
        {/* Attribution Breakdown */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-400" />
            Channel Attribution
          </h3>
          <div className="space-y-2">
            {ATTRIBUTION_CHANNELS.filter(ch => (attribution[ch] || 0) > 0).map(ch => {
              const count = attribution[ch] || 0;
              const pct = totalSignups > 0 ? (count / totalSignups) * 100 : 0;
              return (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(channelFilter === ch ? '' : ch)}
                  className={`w-full flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${
                    channelFilter === ch ? 'bg-gray-800 ring-1 ring-blue-500/30' : 'hover:bg-gray-800/50'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${CHANNEL_COLORS[ch] || 'bg-gray-500'}`} />
                  <span className="text-xs text-gray-300 capitalize flex-1 text-left">{ch.replace('_', ' ')}</span>
                  <span className="text-xs text-gray-500">{count}</span>
                  <div className="w-24 bg-gray-800 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${CHANNEL_COLORS[ch] || 'bg-gray-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 w-10 text-right">{pct.toFixed(0)}%</span>
                </button>
              );
            })}
            {Object.values(attribution).every(v => v === 0) && (
              <p className="text-xs text-gray-500 py-2">No attribution data yet</p>
            )}
          </div>
        </div>

        {/* Stalled Signups Alert */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            Stalled Signups
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-yellow-400 mb-1">{stalledCount}</div>
            <p className="text-[10px] text-gray-500 text-center mb-4">
              Signed up 7+ days ago<br />still at signup stage
            </p>
            {stalledCount > 0 && (
              <button
                onClick={convertStalled}
                disabled={converting}
                className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600/20 text-yellow-400 text-xs font-medium rounded-lg hover:bg-yellow-600/30 transition-colors disabled:opacity-50"
              >
                {converting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <UserPlus className="w-3 h-3" />
                )}
                Convert All to Leads
              </button>
            )}
            {convertResult && (
              <p className="text-[10px] text-green-400 mt-2 text-center">{convertResult}</p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Cohort Analysis Toggle ═══ */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowCohorts(!showCohorts)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-green-400" />
            <span className="text-sm font-semibold text-white">Cohort Analysis</span>
            {cohortSummary && (
              <span className="text-[10px] text-gray-500">
                {cohortSummary.activation_rate.toFixed(0)}% activate · {cohortSummary.retention_rate.toFixed(0)}% retain
              </span>
            )}
          </div>
          {showCohorts ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {showCohorts && (
          <div className="border-t border-gray-800 p-4 space-y-4">
            {/* Summary KPIs */}
            {cohortSummary && (
              <div className="grid grid-cols-5 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-white">{cohortSummary.total}</div>
                  <div className="text-[10px] text-gray-500">Total Signups</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-yellow-400">{cohortSummary.activation_rate.toFixed(1)}%</div>
                  <div className="text-[10px] text-gray-500">Activation Rate</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-green-400">{cohortSummary.delivery_rate.toFixed(1)}%</div>
                  <div className="text-[10px] text-gray-500">Delivery Rate</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-emerald-400">{cohortSummary.retention_rate.toFixed(1)}%</div>
                  <div className="text-[10px] text-gray-500">Retention Rate</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-blue-400">{cohortSummary.avg_days_to_activation}</div>
                  <div className="text-[10px] text-gray-500">Avg Days to Activate</div>
                </div>
              </div>
            )}

            {/* Weeks selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Show:</span>
              {[4, 8, 12, 24].map(w => (
                <button
                  key={w}
                  onClick={() => setCohortWeeks(w)}
                  className={`px-2 py-0.5 text-[10px] rounded ${
                    cohortWeeks === w ? 'bg-blue-600/30 text-blue-400' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {w}w
                </button>
              ))}
            </div>

            {/* Cohort table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 px-3">Cohort Week</th>
                    <th className="text-right py-2 px-3">Total</th>
                    <th className="text-right py-2 px-3">Signup</th>
                    <th className="text-right py-2 px-3">Activated</th>
                    <th className="text-right py-2 px-3">1st Delivery</th>
                    <th className="text-right py-2 px-3">Retained</th>
                    <th className="text-right py-2 px-3">Churned</th>
                    <th className="text-right py-2 px-3">→ Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map(c => (
                    <tr key={c.cohort_week} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 px-3 text-gray-300 font-medium">
                        {new Date(c.cohort_week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-2 px-3 text-right text-white font-medium">{c.total}</td>
                      <td className="py-2 px-3 text-right text-blue-400">{c.signup}</td>
                      <td className="py-2 px-3 text-right text-yellow-400">{c.activation}</td>
                      <td className="py-2 px-3 text-right text-green-400">{c.first_delivery}</td>
                      <td className="py-2 px-3 text-right text-emerald-400">{c.retained}</td>
                      <td className="py-2 px-3 text-right text-red-400">{c.churned}</td>
                      <td className="py-2 px-3 text-right text-purple-400">{c.converted}</td>
                    </tr>
                  ))}
                  {cohorts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-gray-500">No cohort data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Tab Switcher: Signups / LinkedIn ═══ */}
      <div className="flex items-center gap-1 border-b border-gray-800">
        <button
          onClick={() => setActiveTab('signups')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'signups'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <Users className="w-3.5 h-3.5 inline mr-1.5" />
          Signups ({signups.length})
        </button>
        <button
          onClick={() => setActiveTab('linkedin')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'linkedin'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <Linkedin className="w-3.5 h-3.5 inline mr-1.5" />
          LinkedIn Activity
        </button>
      </div>

      {/* ═══ Signups Tab ═══ */}
      {activeTab === 'signups' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={territory}
              onChange={(e) => setTerritory(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="mine">My Territory</option>
              <option value="">All Signups</option>
            </select>

            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Stages</option>
              {FUNNEL_STAGES.map(s => (
                <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
              ))}
            </select>

            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Channels</option>
              {ATTRIBUTION_CHANNELS.map(ch => (
                <option key={ch} value={ch}>{ch.replace('_', ' ')}</option>
              ))}
            </select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search signups..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {(stageFilter || channelFilter) && (
              <button
                onClick={() => { setStageFilter(''); setChannelFilter(''); }}
                className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
              >
                <Filter className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>

          {/* Signup table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : signups.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-500">No signups found</p>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-3 px-4">Business</th>
                      <th className="text-left py-3 px-4">Contact</th>
                      <th className="text-left py-3 px-4">Location</th>
                      <th className="text-left py-3 px-4">Plan</th>
                      <th className="text-left py-3 px-4">Signup Date</th>
                      <th className="text-center py-3 px-4">Stage</th>
                      <th className="text-center py-3 px-4">Channel</th>
                      <th className="text-center py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signups.map(s => {
                      const stage = s.funnel_stage || 'signup';
                      const stageConf = STAGE_CONFIG[stage] || STAGE_CONFIG.signup;
                      return (
                        <tr key={s.signup_id} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                          <td className="py-2.5 px-4">
                            <span className="text-white font-medium">{s.business_name || '--'}</span>
                            {s.territory_match && (
                              <span className="ml-1.5 text-green-400 text-[9px] bg-green-600/20 px-1.5 py-0.5 rounded-full">territory</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="text-gray-300">{s.contact_name || '--'}</div>
                            <div className="text-gray-500">{s.contact_email || ''}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="flex items-center gap-1 text-gray-400">
                              <MapPin className="w-3 h-3" />
                              {s.city || '--'}, {s.state || '--'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-gray-400">{s.plan_type || '--'}</td>
                          <td className="py-2.5 px-4 text-gray-500">
                            {s.signup_date ? new Date(s.signup_date).toLocaleDateString() : '--'}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <select
                              value={stage}
                              onChange={(e) => updateFunnelStage(s.signup_id, e.target.value)}
                              disabled={updatingStage === s.signup_id}
                              className={`${stageConf.bg} ${stageConf.color} text-[10px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 bg-transparent`}
                              style={{ WebkitAppearance: 'none', appearance: 'none', paddingRight: '16px' }}
                            >
                              {FUNNEL_STAGES.map(fs => (
                                <option key={fs} value={fs}>{STAGE_CONFIG[fs].label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <select
                              value={s.attribution_channel || 'organic'}
                              onChange={(e) => updateAttribution(s.signup_id, e.target.value)}
                              className="bg-transparent text-[10px] text-gray-400 border-0 cursor-pointer focus:outline-none capitalize"
                              style={{ WebkitAppearance: 'none', appearance: 'none', paddingRight: '12px' }}
                            >
                              {ATTRIBUTION_CHANNELS.map(ch => (
                                <option key={ch} value={ch}>{ch.replace('_', ' ')}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {!s.converted_to_lead && s.contact_email ? (
                              <button
                                onClick={() => convertSingle(s.signup_id)}
                                className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto"
                              >
                                <ArrowUpRight className="w-3 h-3" /> Lead
                              </button>
                            ) : s.converted_to_lead ? (
                              <span className="text-[10px] text-green-400">Converted</span>
                            ) : (
                              <span className="text-[10px] text-gray-600">No email</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ LinkedIn Tab ═══ */}
      {activeTab === 'linkedin' && (
        <div className="space-y-4">
          {/* LinkedIn Stats */}
          {liStats.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {liStats.map(st => (
                <div key={st.action_type} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 capitalize">{st.action_type}s</div>
                  <div className="text-xl font-bold text-white">{st.total}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-green-400">{st.accepted} accepted</span>
                    <span className="text-[10px] text-gray-500">{st.sent} sent</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* LinkedIn Activity Log */}
          {liLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : liActivities.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <Linkedin className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No LinkedIn activity yet</p>
              <p className="text-gray-600 text-xs mt-1">LinkedIn actions from sequences and task queue will appear here</p>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-3 px-4">Contact</th>
                      <th className="text-left py-3 px-4">Action</th>
                      <th className="text-left py-3 px-4">Status</th>
                      <th className="text-left py-3 px-4">Message</th>
                      <th className="text-left py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liActivities.map((a: Record<string, unknown>, i) => {
                      const statusColor = a.status === 'accepted' ? 'text-green-400' :
                        a.status === 'sent' ? 'text-blue-400' :
                        a.status === 'failed' ? 'text-red-400' : 'text-gray-400';
                      return (
                        <tr key={i} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                          <td className="py-2.5 px-4">
                            <div className="text-white font-medium">
                              {(a.first_name as string) || ''} {(a.last_name as string) || ''}
                            </div>
                            <div className="text-gray-500">{(a.business_name as string) || ''}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="text-sky-400 capitalize">{(a.action_type as string) || ''}</span>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`${statusColor} text-[10px] capitalize font-medium`}>
                              {(a.status as string) || ''}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-gray-400 max-w-[200px] truncate">
                            {(a.message as string) || '--'}
                          </td>
                          <td className="py-2.5 px-4 text-gray-500">
                            {a.executed_at ? new Date(a.executed_at as string).toLocaleDateString() : '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

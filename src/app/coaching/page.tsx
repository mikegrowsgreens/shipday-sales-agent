'use client';

import { useState, useEffect } from 'react';
import {
  Loader2, Phone, TrendingUp, MessageSquare, AlertTriangle,
  Sparkles, ExternalLink, ChevronDown, ChevronUp, Zap,
  GraduationCap, Target, BarChart3, Trophy, Lightbulb,
  AlertCircle, ArrowRight, Clock, Users, GitBranch,
  CheckCircle2, XCircle, Building2, Link as LinkIcon,
  RefreshCw,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = 'coach' | 'calls' | 'benchmarks' | 'velocity' | 'winloss' | 'attribution';

interface CallMetrics {
  total_calls: string;
  avg_duration: string;
  avg_talk_ratio: string;
  avg_questions: string;
  avg_fillers: string;
  processed_count: string;
}

interface RecentCall {
  call_id: string;
  title: string | null;
  call_date: string | null;
  duration_seconds: number | null;
  talk_listen_ratio: number | null;
  question_count: number | null;
  filler_word_count: number | null;
  longest_monologue_seconds: number | null;
  call_type: string | null;
  meeting_summary: string | null;
  action_items: unknown;
  topics_discussed: unknown;
  fathom_url: string | null;
  extraction_status: string | null;
}

interface CoachInsight {
  type: string;
  icon: string;
  title: string;
  detail: string;
  action: string;
}

interface CoachingData {
  overall_grade: string;
  headline: string;
  insights: CoachInsight[];
  top_priority: string;
  angle_recommendation: string;
}

interface Benchmark {
  metric: string;
  label: string;
  current: number;
  target: number;
  period: string;
  pct: number;
  status: string;
}

interface VelocityStage {
  stage: string;
  count: string;
  avg_days_in_stage: string;
}

interface VelocityMetric {
  metric: string;
  avg_days: string;
  count: string;
}

interface Bottleneck {
  stage: string;
  contact_name: string;
  business_name: string | null;
  days_stuck: string;
  contact_id: number;
}

interface WonDeal {
  contact_id: number;
  contact_name: string;
  business_name: string | null;
  total_touches: string;
  channels_used: string;
  first_channel: string | null;
  days_to_win: string | null;
}

interface LostDeal {
  contact_id: number;
  contact_name: string;
  business_name: string | null;
  total_touches: string;
  last_event: string | null;
  last_channel: string | null;
  days_active: string | null;
}

interface ChannelWinRate {
  channel: string;
  total: string;
  won: string;
  lost: string;
  win_rate: string;
}

interface AttributionDeal {
  contact_id: number;
  contact_name: string;
  business_name: string | null;
  total_touches: string;
  days_to_close: string | null;
  touchChain: Array<{
    touchpoint_id: number;
    channel: string;
    event_type: string;
    occurred_at: string;
    subject: string | null;
  }>;
}

interface AnglePerf {
  angle: string;
  total_sent: string;
  total_replied: string;
  reply_rate: string;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CoachingPage() {
  const [tab, setTab] = useState<Tab>('coach');

  // Call data
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [unprocessedCount, setUnprocessedCount] = useState(0);
  const [callsLoading, setCallsLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  // Coach data
  const [coaching, setCoaching] = useState<CoachingData | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  // Benchmarks
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [benchmarksLoading, setBenchmarksLoading] = useState(false);

  // Velocity
  const [velocityStages, setVelocityStages] = useState<VelocityStage[]>([]);
  const [velocityMetrics, setVelocityMetrics] = useState<VelocityMetric[]>([]);
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([]);
  const [velocityLoading, setVelocityLoading] = useState(false);

  // Win/Loss
  const [wonDeals, setWonDeals] = useState<WonDeal[]>([]);
  const [lostDeals, setLostDeals] = useState<LostDeal[]>([]);
  const [winPatterns, setWinPatterns] = useState<Record<string, string>>({});
  const [lossPatterns, setLossPatterns] = useState<Record<string, string>>({});
  const [channelWinRate, setChannelWinRate] = useState<ChannelWinRate[]>([]);
  const [winlossLoading, setWinlossLoading] = useState(false);

  // Attribution
  const [attrDeals, setAttrDeals] = useState<AttributionDeal[]>([]);
  const [anglePerf, setAnglePerf] = useState<AnglePerf[]>([]);
  const [attrSummary, setAttrSummary] = useState<Record<string, string>>({});
  const [attrLoading, setAttrLoading] = useState(false);
  const [expandedDeal, setExpandedDeal] = useState<number | null>(null);

  // ─── Fetch functions ────────────────────────────────────────────────

  const fetchCalls = () => {
    fetch('/api/coaching')
      .then(r => r.json())
      .then(data => {
        setMetrics(data.callMetrics?.[0] || null);
        setRecentCalls(data.recentCalls || []);
        setUnprocessedCount(data.unprocessedCount || 0);
      })
      .catch(console.error)
      .finally(() => setCallsLoading(false));
  };

  const fetchCoaching = async () => {
    setCoachLoading(true);
    try {
      const res = await fetch('/api/coaching/ai-coach', { method: 'POST' });
      const data = await res.json();
      setCoaching(data.coaching);
    } catch (e) { console.error(e); }
    finally { setCoachLoading(false); }
  };

  const fetchBenchmarks = async () => {
    setBenchmarksLoading(true);
    try {
      const res = await fetch('/api/coaching/benchmarks');
      const data = await res.json();
      setBenchmarks(data.benchmarks || []);
    } catch (e) { console.error(e); }
    finally { setBenchmarksLoading(false); }
  };

  const fetchVelocity = async () => {
    setVelocityLoading(true);
    try {
      const res = await fetch('/api/coaching/velocity');
      const data = await res.json();
      setVelocityStages(data.stageDistribution || []);
      setVelocityMetrics(data.velocityMetrics || []);
      setBottlenecks(data.bottlenecks || []);
    } catch (e) { console.error(e); }
    finally { setVelocityLoading(false); }
  };

  const fetchWinLoss = async () => {
    setWinlossLoading(true);
    try {
      const res = await fetch('/api/coaching/winloss');
      const data = await res.json();
      setWonDeals(data.wonDeals || []);
      setLostDeals(data.lostDeals || []);
      setWinPatterns(data.winPatterns || {});
      setLossPatterns(data.lossPatterns || {});
      setChannelWinRate(data.channelWinRate || []);
    } catch (e) { console.error(e); }
    finally { setWinlossLoading(false); }
  };

  const fetchAttribution = async () => {
    setAttrLoading(true);
    try {
      const res = await fetch('/api/attribution');
      const data = await res.json();
      setAttrDeals(data.wonDeals || []);
      setAnglePerf(data.anglePerformance || []);
      setAttrSummary(data.summary || {});
    } catch (e) { console.error(e); }
    finally { setAttrLoading(false); }
  };

  useEffect(() => { fetchCalls(); }, []);

  useEffect(() => {
    if (tab === 'benchmarks' && benchmarks.length === 0) fetchBenchmarks();
    if (tab === 'velocity' && velocityStages.length === 0) fetchVelocity();
    if (tab === 'winloss' && wonDeals.length === 0 && lostDeals.length === 0) fetchWinLoss();
    if (tab === 'attribution' && attrDeals.length === 0) fetchAttribution();
  }, [tab]);

  const handleProcessAll = async () => {
    setProcessing(true);
    setProcessResult(null);
    try {
      const res = await fetch('/api/calls/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setProcessResult(`Processed ${data.processed} calls${data.failed ? `, ${data.failed} failed` : ''}`);
      fetchCalls();
    } catch {
      setProcessResult('Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────

  const formatDuration = (secs: number | null) => {
    if (!secs) return '--';
    return `${Math.floor(secs / 60)}m`;
  };

  const talkRatioColor = (ratio: number | null) => {
    if (ratio === null) return 'text-gray-500';
    if (ratio > 0.65) return 'text-red-400';
    if (ratio < 0.4) return 'text-green-400';
    return 'text-yellow-400';
  };

  const talkRatioLabel = (ratio: number | null) => {
    if (ratio === null) return null;
    if (ratio > 0.7) return 'Talking too much — let the prospect speak more';
    if (ratio > 0.6) return 'Slightly over-talking — aim for 40-60% range';
    if (ratio < 0.35) return 'Great listening — make sure you\'re also guiding the conversation';
    return 'Good balance';
  };

  const gradeColor = (grade: string) => {
    if (grade === 'A') return 'text-green-400 bg-green-600/20';
    if (grade === 'B') return 'text-blue-400 bg-blue-600/20';
    if (grade === 'C') return 'text-yellow-400 bg-yellow-600/20';
    return 'text-red-400 bg-red-600/20';
  };

  const insightIcon = (icon: string) => {
    if (icon === 'trophy') return Trophy;
    if (icon === 'alert') return AlertCircle;
    if (icon === 'lightbulb') return Lightbulb;
    return TrendingUp;
  };

  const insightColor = (type: string) => {
    if (type === 'strength') return 'border-green-800/30 bg-green-600/5';
    if (type === 'weakness') return 'border-red-800/30 bg-red-600/5';
    if (type === 'opportunity') return 'border-blue-800/30 bg-blue-600/5';
    return 'border-yellow-800/30 bg-yellow-600/5';
  };

  if (callsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  // ─── Tabs ───────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'coach', label: 'AI Coach', icon: Sparkles },
    { key: 'calls', label: 'Calls', icon: Phone },
    { key: 'benchmarks', label: 'Benchmarks', icon: Target },
    { key: 'velocity', label: 'Velocity', icon: TrendingUp },
    { key: 'winloss', label: 'Win/Loss', icon: BarChart3 },
    { key: 'attribution', label: 'Attribution', icon: GitBranch },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Coaching & Intelligence</h1>
          <p className="text-sm text-gray-400 mt-1">Performance analysis, attribution, and actionable insights</p>
        </div>
        {tab === 'calls' && unprocessedCount > 0 && (
          <button
            onClick={handleProcessAll}
            disabled={processing}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Process {unprocessedCount} Call{unprocessedCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {processResult && (
        <div className="bg-purple-600/10 border border-purple-700/30 rounded-lg px-4 py-2 text-sm text-purple-300">
          {processResult}
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon className="w-3 h-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ═══ AI Coach Tab ═══════════════════════════════════════════════ */}
      {tab === 'coach' && (
        <div className="space-y-4">
          {!coaching && !coachLoading && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <GraduationCap className="w-10 h-10 text-purple-400 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-white mb-2">AI Sales Coach</h2>
              <p className="text-sm text-gray-400 mb-4 max-w-md mx-auto">
                Get specific, data-driven coaching based on your last 14 days of performance.
                Not generic tips — real insights from your actual numbers.
              </p>
              <button
                onClick={fetchCoaching}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Get Coaching
              </button>
            </div>
          )}

          {coachLoading && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Analyzing your performance data...</p>
            </div>
          )}

          {coaching && !coachLoading && (
            <>
              {/* Grade + Headline */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold ${gradeColor(coaching.overall_grade)}`}>
                  {coaching.overall_grade}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-white font-medium">{coaching.headline}</p>
                  <p className="text-xs text-gray-500 mt-1">Based on your last 14 days</p>
                </div>
              </div>

              {/* Top Priority */}
              <div className="bg-gradient-to-r from-orange-600/10 to-red-600/10 border border-orange-800/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-semibold text-orange-300 uppercase">Top Priority Today</span>
                </div>
                <p className="text-sm text-orange-100">{coaching.top_priority}</p>
              </div>

              {/* Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {coaching.insights.map((insight, i) => {
                  const Icon = insightIcon(insight.icon);
                  return (
                    <div key={i} className={`border rounded-xl p-4 ${insightColor(insight.type)}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-gray-300" />
                        <span className="text-sm font-medium text-white">{insight.title}</span>
                      </div>
                      <p className="text-xs text-gray-300 mb-2">{insight.detail}</p>
                      <div className="flex items-center gap-1.5 text-xs text-blue-400">
                        <ArrowRight className="w-3 h-3" />
                        {insight.action}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Angle Recommendation */}
              {coaching.angle_recommendation && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Lightbulb className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs font-semibold text-gray-300 uppercase">Angle Strategy</span>
                  </div>
                  <p className="text-xs text-gray-400">{coaching.angle_recommendation}</p>
                </div>
              )}

              <button
                onClick={fetchCoaching}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Refresh Coaching
              </button>
            </>
          )}
        </div>
      )}

      {/* ═══ Calls Tab ═════════════════════════════════════════════════ */}
      {tab === 'calls' && (
        <div className="space-y-4">
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Calls (30d)', value: metrics.total_calls, icon: Phone, sub: `${metrics.processed_count} analyzed` },
                { label: 'Avg Duration', value: metrics.avg_duration ? `${Math.round(parseInt(metrics.avg_duration) / 60)}m` : '--', icon: Phone },
                { label: 'Talk Ratio', value: metrics.avg_talk_ratio ? `${(parseFloat(metrics.avg_talk_ratio) * 100).toFixed(0)}%` : '--', icon: TrendingUp, color: talkRatioColor(metrics.avg_talk_ratio ? parseFloat(metrics.avg_talk_ratio) : null) },
                { label: 'Avg Questions', value: metrics.avg_questions || '--', icon: MessageSquare },
                { label: 'Avg Fillers', value: metrics.avg_fillers || '--', icon: AlertTriangle },
              ].map(kpi => (
                <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <kpi.icon className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-[10px] text-gray-500 uppercase">{kpi.label}</span>
                  </div>
                  <span className={`text-lg font-bold ${'color' in kpi && kpi.color ? kpi.color : 'text-white'}`}>
                    {kpi.value}
                  </span>
                  {'sub' in kpi && kpi.sub && (
                    <p className="text-[10px] text-gray-600 mt-0.5">{kpi.sub as string}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {recentCalls.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-300">Recent Calls</h2>
              {recentCalls.map(call => {
                const isExpanded = expandedCall === call.call_id;
                const actionItems = Array.isArray(call.action_items) ? (call.action_items as string[]) : [];
                const topics = Array.isArray(call.topics_discussed) ? (call.topics_discussed as string[]) : [];
                const hasAnalysis = !!call.meeting_summary;

                return (
                  <div key={call.call_id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
                      onClick={() => setExpandedCall(isExpanded ? null : call.call_id)}
                    >
                      <Phone className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-white truncate block">{call.title || 'Untitled'}</span>
                        <span className="text-[10px] text-gray-500">
                          {call.call_date ? new Date(call.call_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '--'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-gray-400">{formatDuration(call.duration_seconds)}</span>
                        {call.talk_listen_ratio !== null && (
                          <span className={`px-1.5 py-0.5 rounded ${talkRatioColor(call.talk_listen_ratio)} bg-gray-800`}>
                            {(call.talk_listen_ratio * 100).toFixed(0)}%
                          </span>
                        )}
                        {call.question_count !== null && <span className="text-gray-400">{call.question_count}Q</span>}
                        {call.filler_word_count !== null && call.filler_word_count > 0 && (
                          <span className="text-yellow-600">{call.filler_word_count} fillers</span>
                        )}
                        {!hasAnalysis && <span className="text-gray-600 italic">not analyzed</span>}
                        {hasAnalysis && <Sparkles className="w-3 h-3 text-purple-500" />}
                      </div>
                      {call.fathom_url && (
                        <a href={call.fathom_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-purple-400 hover:text-purple-300">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </div>
                    {isExpanded && (
                      <div className="px-4 py-3 border-t border-gray-800 bg-gray-800/30 space-y-3">
                        {call.talk_listen_ratio !== null && (
                          <div className="flex items-start gap-2">
                            <TrendingUp className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-blue-300">{talkRatioLabel(call.talk_listen_ratio)}</p>
                          </div>
                        )}
                        {call.longest_monologue_seconds !== null && call.longest_monologue_seconds > 120 && (
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-yellow-300">
                              Longest monologue: {Math.round(call.longest_monologue_seconds / 60)}min — try to break up long stretches with questions
                            </p>
                          </div>
                        )}
                        {call.meeting_summary && (
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase">Summary</span>
                            <p className="text-xs text-gray-300 mt-0.5">{call.meeting_summary}</p>
                          </div>
                        )}
                        {actionItems.length > 0 && (
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase">Action Items</span>
                            <ul className="mt-1 space-y-0.5">
                              {actionItems.map((item, i) => (
                                <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                                  <span className="text-green-500 mt-0.5">-</span> {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {topics.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {topics.map((topic, i) => (
                              <span key={i} className="text-[10px] bg-purple-600/10 text-purple-400 px-2 py-0.5 rounded">{topic}</span>
                            ))}
                          </div>
                        )}
                        {!hasAnalysis && (
                          <p className="text-xs text-gray-600 italic">
                            This call hasn&apos;t been analyzed yet. Click &quot;Process Calls&quot; above to extract insights.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ Benchmarks Tab ════════════════════════════════════════════ */}
      {tab === 'benchmarks' && (
        <div className="space-y-4">
          {benchmarksLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {benchmarks.map(b => (
                  <div key={b.metric} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">{b.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        b.status === 'complete' ? 'bg-green-600/20 text-green-400' :
                        b.status === 'on_track' ? 'bg-yellow-600/20 text-yellow-400' :
                        'bg-red-600/20 text-red-400'
                      }`}>
                        {b.pct}%
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-xl font-bold text-white">{b.current}</span>
                      <span className="text-xs text-gray-500">/ {b.target}</span>
                    </div>
                    <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          b.status === 'complete' ? 'bg-green-500' :
                          b.status === 'on_track' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(b.pct, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1 capitalize">{b.period} goal</p>
                  </div>
                ))}
              </div>

              {benchmarks.length === 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                  <Target className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No benchmarks configured. Run the schema migration to set up default goals.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ Velocity Tab ══════════════════════════════════════════════ */}
      {tab === 'velocity' && (
        <div className="space-y-4">
          {velocityLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Velocity Metrics */}
              <div className="grid grid-cols-3 gap-3">
                {velocityMetrics.map(vm => (
                  <div key={vm.metric} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <span className="text-xs text-gray-400">
                      {vm.metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-bold text-white">{vm.avg_days || '--'}</span>
                      <span className="text-xs text-gray-500">days avg</span>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-0.5">{vm.count} contacts</p>
                  </div>
                ))}
              </div>

              {/* Pipeline Stage Distribution */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Pipeline Stage Distribution
                </h3>
                <div className="space-y-2">
                  {velocityStages.map(vs => {
                    const maxCount = Math.max(...velocityStages.map(s => parseInt(s.count)), 1);
                    const pct = (parseInt(vs.count) / maxCount) * 100;
                    return (
                      <div key={vs.stage} className="flex items-center gap-3">
                        <span className="w-28 text-xs text-gray-400 capitalize text-right">{vs.stage.replace(/_/g, ' ')}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden relative">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(pct, 3)}%` }}
                          />
                          <span className="absolute inset-y-0 right-2 flex items-center text-[10px] text-gray-400">
                            {vs.count}
                          </span>
                        </div>
                        <span className="w-20 text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {vs.avg_days_in_stage || '--'}d
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottlenecks */}
              {bottlenecks.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-400" /> Stalled Contacts (14+ days in stage)
                  </h3>
                  <div className="space-y-2">
                    {bottlenecks.map(b => (
                      <div key={b.contact_id} className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                        <span className="text-xs text-yellow-400 bg-yellow-600/10 px-2 py-0.5 rounded capitalize">
                          {b.stage.replace(/_/g, ' ')}
                        </span>
                        <a href={`/contacts/${b.contact_id}`} className="text-sm text-white hover:text-blue-400">{b.contact_name}</a>
                        {b.business_name && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> {b.business_name}
                          </span>
                        )}
                        <span className="text-xs text-red-400 ml-auto">{b.days_stuck} days</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ Win/Loss Tab ══════════════════════════════════════════════ */}
      {tab === 'winloss' && (
        <div className="space-y-4">
          {winlossLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Win vs Loss Patterns */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-green-800/30 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Win Patterns
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Won</span>
                      <span className="text-white font-medium">{winPatterns.total_won || '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Touches to Win</span>
                      <span className="text-white font-medium">{winPatterns.avg_touches || '--'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Days to Close</span>
                      <span className="text-white font-medium">{winPatterns.avg_days || '--'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Top First Channel</span>
                      <span className="text-white font-medium capitalize">{winPatterns.most_common_first_channel || '--'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 border border-red-800/30 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> Loss Patterns
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Lost</span>
                      <span className="text-white font-medium">{lossPatterns.total_lost || '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Touches Before Loss</span>
                      <span className="text-white font-medium">{lossPatterns.avg_touches || '--'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Days Before Loss</span>
                      <span className="text-white font-medium">{lossPatterns.avg_days || '--'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Common Last Event</span>
                      <span className="text-white font-medium capitalize">{(lossPatterns.most_common_last_event || '--').replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Channel Win Rate */}
              {channelWinRate.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Win Rate by First-Touch Channel
                  </h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left py-2">Channel</th>
                        <th className="text-right py-2">Total</th>
                        <th className="text-right py-2">Won</th>
                        <th className="text-right py-2">Lost</th>
                        <th className="text-right py-2">Win Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelWinRate.map(c => (
                        <tr key={c.channel} className="border-t border-gray-800">
                          <td className="py-2 text-gray-300 capitalize">{c.channel}</td>
                          <td className="py-2 text-right text-white">{c.total}</td>
                          <td className="py-2 text-right text-green-400">{c.won}</td>
                          <td className="py-2 text-right text-red-400">{c.lost}</td>
                          <td className="py-2 text-right font-medium text-yellow-400">{c.win_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Recent Wins */}
              {wonDeals.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Wins</h3>
                  <div className="space-y-2">
                    {wonDeals.slice(0, 10).map(d => (
                      <div key={d.contact_id} className="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <a href={`/contacts/${d.contact_id}`} className="text-sm text-white hover:text-blue-400">{d.contact_name}</a>
                        {d.business_name && <span className="text-xs text-gray-500">{d.business_name}</span>}
                        <span className="text-xs text-gray-500 ml-auto">{d.total_touches} touches</span>
                        <span className="text-xs text-gray-500">{d.days_to_win}d</span>
                        <span className="text-xs text-gray-500 capitalize">{d.channels_used}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Losses */}
              {lostDeals.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Losses</h3>
                  <div className="space-y-2">
                    {lostDeals.slice(0, 10).map(d => (
                      <div key={d.contact_id} className="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg">
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <a href={`/contacts/${d.contact_id}`} className="text-sm text-white hover:text-blue-400">{d.contact_name}</a>
                        {d.business_name && <span className="text-xs text-gray-500">{d.business_name}</span>}
                        <span className="text-xs text-gray-500 ml-auto">{d.total_touches} touches</span>
                        <span className="text-xs text-gray-500">{d.days_active}d</span>
                        <span className="text-xs text-red-400 capitalize">{(d.last_event || '').replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ Attribution Tab ═══════════════════════════════════════════ */}
      {tab === 'attribution' && (
        <div className="space-y-4">
          {attrLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Attribution Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <span className="text-xs text-gray-400">Total Converted</span>
                  <p className="text-xl font-bold text-white mt-1">{attrSummary.total_won || '0'}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <span className="text-xs text-gray-400">Avg Touches to Convert</span>
                  <p className="text-xl font-bold text-white mt-1">{attrSummary.avg_touches || '--'}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <span className="text-xs text-gray-400">Avg Days to Close</span>
                  <p className="text-xl font-bold text-white mt-1">{attrSummary.avg_days || '--'}</p>
                </div>
              </div>

              {/* Email Angle Performance */}
              {anglePerf.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4" /> Email Angle Performance
                  </h3>
                  <div className="space-y-3">
                    {anglePerf.map(ap => {
                      const sent = parseInt(ap.total_sent);
                      const replied = parseInt(ap.total_replied);
                      const replyPct = sent > 0 ? (replied / sent) * 100 : 0;
                      return (
                        <div key={ap.angle}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-300 capitalize">{ap.angle.replace(/_/g, ' ')}</span>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-gray-500">{ap.total_sent} sent</span>
                              <span className="text-green-400">{ap.total_replied} replied</span>
                              <span className="text-yellow-400 font-medium">{ap.reply_rate}%</span>
                            </div>
                          </div>
                          <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all"
                              style={{ width: `${Math.max(replyPct, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Deal Touch Chains */}
              {attrDeals.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                    <GitBranch className="w-4 h-4" /> Deal Touch Chains
                  </h3>
                  <div className="space-y-2">
                    {attrDeals.slice(0, 15).map(deal => {
                      const isExpanded = expandedDeal === deal.contact_id;
                      return (
                        <div key={deal.contact_id} className="border border-gray-800 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedDeal(isExpanded ? null : deal.contact_id)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            <span className="text-sm text-white">{deal.contact_name}</span>
                            {deal.business_name && (
                              <span className="text-xs text-gray-500">{deal.business_name}</span>
                            )}
                            <span className="text-xs text-gray-500 ml-auto">{deal.total_touches} touches</span>
                            {deal.days_to_close && (
                              <span className="text-xs text-gray-500">{deal.days_to_close}d</span>
                            )}
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                          </button>

                          {isExpanded && deal.touchChain.length > 0 && (
                            <div className="px-4 py-3 border-t border-gray-800 bg-gray-800/20">
                              <div className="relative pl-4 space-y-3">
                                {/* Vertical line */}
                                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-700" />

                                {deal.touchChain.map((touch, i) => {
                                  const channelColors: Record<string, string> = {
                                    email: 'bg-blue-500',
                                    phone: 'bg-green-500',
                                    linkedin: 'bg-cyan-500',
                                    sms: 'bg-purple-500',
                                    calendly: 'bg-yellow-500',
                                    fathom: 'bg-pink-500',
                                    manual: 'bg-gray-500',
                                  };
                                  return (
                                    <div key={touch.touchpoint_id} className="flex items-start gap-3 relative">
                                      <div className={`w-3.5 h-3.5 rounded-full ${channelColors[touch.channel] || 'bg-gray-500'} shrink-0 relative z-10 border-2 border-gray-900`} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-gray-300 capitalize">{touch.channel}</span>
                                          <span className="text-xs text-gray-500">{touch.event_type.replace(/_/g, ' ')}</span>
                                          <span className="text-[10px] text-gray-600 ml-auto">
                                            {new Date(touch.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </span>
                                        </div>
                                        {touch.subject && (
                                          <p className="text-[10px] text-gray-500 truncate mt-0.5">{touch.subject}</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {attrDeals.length === 0 && anglePerf.length === 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                  <GitBranch className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No attribution data yet. As deals close, their touch chains will appear here.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

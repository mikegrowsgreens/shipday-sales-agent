'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, AlertCircle, Bot, Phone, Brain, TrendingUp,
  MessageSquare, Clock, Target, ArrowRightLeft, Search,
  ChevronLeft, ChevronRight, AlertTriangle, Shield,
  Users, Zap, BarChart3, Award, Eye, BookOpen,
} from 'lucide-react';
import TrendChart from '@/components/analytics/TrendChart';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatbotData {
  summary: {
    total_conversations: number;
    avg_messages: number;
    demo_booking_rate: string;
    lead_capture_rate: string;
    abandonment_rate: string;
    avg_qualification: number;
    avg_duration_minutes: number;
    demo_booked_count: number;
    lead_captured_count: number;
  };
  dailyTrend: { day: string; count: string }[];
  terminalStates: { terminal_state: string; count: string }[];
  abandonmentByQual: { bucket: string; count: string }[];
  topObjections: { objection: string; count: string }[];
  topEffectivePatterns: { pattern: string; count: string }[];
}

interface VoiceData {
  summary: {
    total_calls: number;
    avg_duration_minutes: number;
    completed_calls: number;
    transferred_calls: number;
    handoff_rate: string;
    completion_rate: string;
    avg_messages: number;
    roi_presented_rate: string;
  };
  dailyTrend: { day: string; count: string }[];
  statusBreakdown: { status: string; count: string }[];
  stageDistribution: { final_stage: string; count: string }[];
  handoffReasons: { handoff_reason: string; count: string }[];
  durationBuckets: { bucket: string; count: string }[];
}

interface BrainPattern {
  id: string;
  pattern_type: string;
  pattern_text: string;
  effectiveness_score: string;
  times_referenced: string;
  owner_email: string;
  created_at: string;
  updated_at: string;
}

interface BrainHealthData {
  patternsByType: { pattern_type: string; count: string; avg_effectiveness: string }[];
  recentPatternsCount: number;
  confidenceDistribution: { bucket: string; count: string }[];
  topPatterns: {
    id: string; pattern_type: string; pattern_text: string;
    effectiveness_score: string; times_referenced: string; owner_email: string;
  }[];
  stalePatterns: {
    id: string; pattern_type: string; pattern_text: string;
    effectiveness_score: string; updated_at: string;
  }[];
  autoLearnedSummary: { source_type: string; count: string; avg_confidence: string }[];
  intelSummary: { intel_type: string; count: string; verified_count: string }[];
  unverifiedIntel: {
    id: string; intel_type: string; competitor_name: string;
    content: string; source_type: string; created_at: string;
  }[];
  leaderboard: {
    owner_email: string; pattern_count: string;
    avg_effectiveness: string; total_references: string;
  }[];
  patterns: {
    items: BrainPattern[];
    total: number;
    page: number;
    limit: number;
  };
  trainingQueue: {
    struggledConversations: {
      conversation_id: string; started_at: string; messages_count: string;
      qualification_completeness: string; terminal_state: string;
      objections_raised: string[];
    }[];
    unverifiedIntelCount: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const periods = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
] as const;

const tabs = [
  { key: 'chatbot', label: 'Chatbot', icon: MessageSquare },
  { key: 'voice', label: 'Voice Agent', icon: Phone },
  { key: 'brain', label: 'Knowledge Base', icon: Brain },
  { key: 'patterns', label: 'Pattern Explorer', icon: Search },
  { key: 'training', label: 'Training Queue', icon: AlertTriangle },
] as const;

const patternTypeColors: Record<string, string> = {
  objection_handling: 'bg-red-500/20 text-red-400',
  discovery_question: 'bg-blue-500/20 text-blue-400',
  roi_story: 'bg-green-500/20 text-green-400',
  closing_technique: 'bg-purple-500/20 text-purple-400',
  competitor_counter: 'bg-orange-500/20 text-orange-400',
  prospect_pain_verbatim: 'bg-yellow-500/20 text-yellow-400',
};

function formatPatternType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function KpiCard({ icon: Icon, label, value, subValue, color = 'text-white' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {subValue && <p className="text-[10px] text-gray-500 mt-0.5">{subValue}</p>}
    </div>
  );
}

function DistributionBar({ items, maxCount }: {
  items: { label: string; count: number; color?: string }[];
  maxCount?: number;
}) {
  const max = maxCount || Math.max(...items.map(i => i.count), 1);
  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-24 text-[10px] text-gray-500 text-right truncate capitalize">
            {item.label.replace(/_/g, ' ')}
          </span>
          <div className="flex-1 bg-gray-800 rounded-full h-5 overflow-hidden">
            <div
              className={`h-full ${item.color || 'bg-blue-600'} rounded-full flex items-center transition-all duration-500`}
              style={{ width: `${Math.max((item.count / max) * 100, 2)}%` }}
            >
              <span className="text-[10px] text-white pl-2 whitespace-nowrap">{item.count}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<string>('chatbot');
  const [period, setPeriod] = useState<string>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chatbotData, setChatbotData] = useState<ChatbotData | null>(null);
  const [voiceData, setVoiceData] = useState<VoiceData | null>(null);
  const [brainData, setBrainData] = useState<BrainHealthData | null>(null);

  // Pattern explorer state
  const [patternSearch, setPatternSearch] = useState('');
  const [patternType, setPatternType] = useState('');
  const [patternPage, setPatternPage] = useState(1);

  const fetchAll = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const [chatRes, voiceRes, brainRes] = await Promise.all([
        fetch(`/api/analytics/chatbot?period=${p}`),
        fetch(`/api/analytics/voice?period=${p}`),
        fetch(`/api/analytics/brain-health`),
      ]);

      if (chatRes.status === 401 || voiceRes.status === 401 || brainRes.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (!chatRes.ok || !voiceRes.ok || !brainRes.ok) {
        throw new Error('API error loading analytics');
      }

      const [chat, voice, brain] = await Promise.all([
        chatRes.json(), voiceRes.json(), brainRes.json(),
      ]);

      setChatbotData(chat);
      setVoiceData(voice);
      setBrainData(brain);
    } catch (err) {
      console.error('[agent-analytics] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBrainPatterns = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (patternType) params.set('type', patternType);
      if (patternSearch) params.set('q', patternSearch);
      params.set('page', String(patternPage));

      const res = await fetch(`/api/analytics/brain-health?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setBrainData(data);
    } catch (err) {
      console.error('[pattern-explorer] fetch error:', err);
    }
  }, [patternType, patternSearch, patternPage]);

  useEffect(() => {
    fetchAll(period);
  }, [fetchAll, period]);

  useEffect(() => {
    if (activeTab === 'patterns' || activeTab === 'training') {
      fetchBrainPatterns();
    }
  }, [activeTab, fetchBrainPatterns]);

  // ─── Loading / Error ────────────────────────────────────────────────────────

  if (loading && !chatbotData) {
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
          <button onClick={() => fetchAll(period)} className="text-xs text-blue-400 hover:text-blue-300 underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-blue-400" />
            Agent Analytics
          </h1>
          <p className="text-sm text-gray-400 mt-1">AI chatbot, voice agent, and knowledge base performance</p>
        </div>
        <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                period === p.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'chatbot' && chatbotData && <ChatbotTab data={chatbotData} period={period} />}
      {activeTab === 'voice' && voiceData && <VoiceTab data={voiceData} period={period} />}
      {activeTab === 'brain' && brainData && <BrainHealthTab data={brainData} />}
      {activeTab === 'patterns' && brainData && (
        <PatternExplorer
          data={brainData}
          search={patternSearch}
          typeFilter={patternType}
          page={patternPage}
          onSearchChange={setPatternSearch}
          onTypeChange={setPatternType}
          onPageChange={setPatternPage}
        />
      )}
      {activeTab === 'training' && brainData && <TrainingQueue data={brainData} />}
    </div>
  );
}

// ─── Chatbot Tab ──────────────────────────────────────────────────────────────

function ChatbotTab({ data, period }: { data: ChatbotData; period: string }) {
  const { summary, dailyTrend, terminalStates, abandonmentByQual, topObjections, topEffectivePatterns } = data;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={MessageSquare} label="Conversations" value={summary.total_conversations} />
        <KpiCard icon={Target} label="Demo Booking Rate" value={`${summary.demo_booking_rate}%`} color="text-green-400" subValue={`${summary.demo_booked_count} booked`} />
        <KpiCard icon={Users} label="Lead Capture Rate" value={`${summary.lead_capture_rate}%`} color="text-blue-400" subValue={`${summary.lead_captured_count} captured`} />
        <KpiCard icon={AlertCircle} label="Abandonment Rate" value={`${summary.abandonment_rate}%`} color="text-red-400" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={BarChart3} label="Avg Messages" value={summary.avg_messages} />
        <KpiCard icon={Clock} label="Avg Duration" value={`${summary.avg_duration_minutes} min`} />
        <KpiCard icon={TrendingUp} label="Avg Qualification" value={`${summary.avg_qualification}%`} color="text-yellow-400" />
        <KpiCard icon={Zap} label="Conversations/Day" value={dailyTrend.length > 0 ? (summary.total_conversations / dailyTrend.length).toFixed(1) : '0'} />
      </div>

      {/* Daily Trend */}
      {dailyTrend.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <TrendChart
            title={`Chatbot Conversations (${period})`}
            data={dailyTrend.map(t => ({ label: formatDate(t.day), value: parseInt(t.count) }))}
            color="bg-blue-600"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Terminal State Breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Target className="w-4 h-4" /> Conversation Outcomes
          </h3>
          {terminalStates.length > 0 ? (
            <DistributionBar
              items={terminalStates.map(s => ({
                label: s.terminal_state,
                count: parseInt(s.count),
                color: s.terminal_state === 'demo_booked' ? 'bg-green-600'
                  : s.terminal_state === 'lead_captured' ? 'bg-blue-600'
                  : s.terminal_state === 'abandoned' ? 'bg-red-600'
                  : s.terminal_state === 'escalated' ? 'bg-orange-600'
                  : 'bg-gray-600',
              }))}
            />
          ) : <p className="text-xs text-gray-500">No conversation data yet</p>}
        </div>

        {/* Abandonment by Qualification */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Abandonment by Qualification Stage
          </h3>
          {abandonmentByQual.length > 0 ? (
            <DistributionBar
              items={abandonmentByQual.map(a => ({
                label: a.bucket,
                count: parseInt(a.count),
                color: 'bg-red-600',
              }))}
            />
          ) : <p className="text-xs text-gray-500">No abandonment data</p>}
        </div>

        {/* Top Objections */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Top Objections Raised
          </h3>
          {topObjections.length > 0 ? (
            <div className="space-y-2">
              {topObjections.map((obj, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 truncate max-w-[200px]">{obj.objection}</span>
                  <span className="text-gray-500 ml-2">{obj.count}x</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-500">No objection data</p>}
        </div>

        {/* Top Effective Patterns */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Top Winning Patterns
          </h3>
          {topEffectivePatterns.length > 0 ? (
            <div className="space-y-2">
              {topEffectivePatterns.map((pat, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 truncate max-w-[200px]">{pat.pattern}</span>
                  <span className="text-green-400 ml-2">{pat.count}x used</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-500">No pattern data</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Voice Tab ────────────────────────────────────────────────────────────────

function VoiceTab({ data, period }: { data: VoiceData; period: string }) {
  const { summary, dailyTrend, statusBreakdown, stageDistribution, handoffReasons, durationBuckets } = data;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Phone} label="Total Calls" value={summary.total_calls} />
        <KpiCard icon={Clock} label="Avg Duration" value={`${summary.avg_duration_minutes} min`} />
        <KpiCard icon={Target} label="Completion Rate" value={`${summary.completion_rate}%`} color="text-green-400" />
        <KpiCard icon={ArrowRightLeft} label="Handoff Rate" value={`${summary.handoff_rate}%`} color="text-orange-400" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={BarChart3} label="Avg Messages" value={summary.avg_messages} />
        <KpiCard icon={TrendingUp} label="ROI Presented" value={`${summary.roi_presented_rate}%`} color="text-blue-400" />
        <KpiCard icon={Users} label="Completed" value={summary.completed_calls} color="text-green-400" />
        <KpiCard icon={ArrowRightLeft} label="Transferred" value={summary.transferred_calls} color="text-yellow-400" />
      </div>

      {/* Daily Trend */}
      {dailyTrend.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <TrendChart
            title={`Voice Agent Calls (${period})`}
            data={dailyTrend.map(t => ({ label: formatDate(t.day), value: parseInt(t.count) }))}
            color="bg-purple-600"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Call Status
          </h3>
          {statusBreakdown.length > 0 ? (
            <DistributionBar
              items={statusBreakdown.map(s => ({
                label: s.status,
                count: parseInt(s.count),
                color: s.status === 'completed' ? 'bg-green-600'
                  : s.status === 'transferred' ? 'bg-blue-600'
                  : s.status === 'failed' ? 'bg-red-600'
                  : 'bg-gray-600',
              }))}
            />
          ) : <p className="text-xs text-gray-500">No call data</p>}
        </div>

        {/* Stage Distribution */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Target className="w-4 h-4" /> Final Stage Reached
          </h3>
          {stageDistribution.length > 0 ? (
            <DistributionBar
              items={stageDistribution.map(s => ({
                label: s.final_stage,
                count: parseInt(s.count),
                color: 'bg-purple-600',
              }))}
            />
          ) : <p className="text-xs text-gray-500">No stage data</p>}
        </div>

        {/* Duration Distribution */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Call Duration Distribution
          </h3>
          {durationBuckets.length > 0 ? (
            <DistributionBar
              items={durationBuckets.map(d => ({
                label: d.bucket,
                count: parseInt(d.count),
                color: 'bg-cyan-600',
              }))}
            />
          ) : <p className="text-xs text-gray-500">No duration data</p>}
        </div>

        {/* Handoff Reasons */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" /> Handoff Reasons
          </h3>
          {handoffReasons.length > 0 ? (
            <DistributionBar
              items={handoffReasons.map(h => ({
                label: h.handoff_reason,
                count: parseInt(h.count),
                color: 'bg-orange-600',
              }))}
            />
          ) : <p className="text-xs text-gray-500">No handoff data</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Brain Health Tab ─────────────────────────────────────────────────────────

function BrainHealthTab({ data }: { data: BrainHealthData }) {
  const totalPatterns = data.patternsByType.reduce((sum, p) => sum + parseInt(p.count), 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Brain} label="Total Patterns" value={totalPatterns} />
        <KpiCard icon={Zap} label="Learned This Week" value={data.recentPatternsCount} color="text-green-400" />
        <KpiCard
          icon={AlertTriangle}
          label="Stale Patterns"
          value={data.stalePatterns.length}
          color="text-yellow-400"
          subValue="Low effectiveness, 30+ days old"
        />
        <KpiCard
          icon={Eye}
          label="Unverified Intel"
          value={data.unverifiedIntel.length}
          color="text-orange-400"
          subValue="Needs human review"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Patterns by Type */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4" /> Patterns by Type
          </h3>
          {data.patternsByType.length > 0 ? (
            <div className="space-y-3">
              {data.patternsByType.map(p => (
                <div key={p.pattern_type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${patternTypeColors[p.pattern_type] || 'bg-gray-700 text-gray-300'}`}>
                      {formatPatternType(p.pattern_type)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-400">{p.count} patterns</span>
                    <span className="text-gray-500">avg {(parseFloat(p.avg_effectiveness) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-500">No patterns yet</p>}
        </div>

        {/* Confidence Distribution */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Effectiveness Distribution
          </h3>
          {data.confidenceDistribution.length > 0 ? (
            <DistributionBar
              items={data.confidenceDistribution.map(c => ({
                label: c.bucket,
                count: parseInt(c.count),
                color: c.bucket.startsWith('High') ? 'bg-green-600'
                  : c.bucket.startsWith('Good') ? 'bg-blue-600'
                  : c.bucket.startsWith('Medium') ? 'bg-yellow-600'
                  : c.bucket.startsWith('Low') ? 'bg-orange-600'
                  : 'bg-red-600',
              }))}
            />
          ) : <p className="text-xs text-gray-500">No distribution data</p>}
        </div>

        {/* Auto-learned Summary */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Auto-Learned Patterns by Source
          </h3>
          {data.autoLearnedSummary.length > 0 ? (
            <div className="space-y-2">
              {data.autoLearnedSummary.map(s => (
                <div key={s.source_type} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 capitalize">{s.source_type.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-white">{s.count} patterns</span>
                    <span className="text-gray-500">{(parseFloat(s.avg_confidence) * 100).toFixed(0)}% confidence</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-500">No auto-learned data</p>}
        </div>

        {/* External Intelligence */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Competitive Intelligence
          </h3>
          {data.intelSummary.length > 0 ? (
            <div className="space-y-2">
              {data.intelSummary.map(i => (
                <div key={i.intel_type} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 capitalize">{i.intel_type.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-white">{i.count} items</span>
                    <span className="text-green-400">{i.verified_count} verified</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-gray-500">No intelligence data</p>}
        </div>
      </div>

      {/* Top Performing Patterns */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Award className="w-4 h-4" /> Top 10 Performing Patterns
        </h3>
        {data.topPatterns.length > 0 ? (
          <div className="space-y-3">
            {data.topPatterns.map((p, i) => (
              <div key={p.id} className="flex items-start gap-3 text-xs border-b border-gray-800 pb-3 last:border-0">
                <span className="text-gray-600 w-5 text-right shrink-0">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${patternTypeColors[p.pattern_type] || 'bg-gray-700 text-gray-300'}`}>
                      {formatPatternType(p.pattern_type)}
                    </span>
                    <span className="text-gray-500">{p.owner_email}</span>
                  </div>
                  <p className="text-gray-300 line-clamp-2">{p.pattern_text}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-green-400 font-medium">{(parseFloat(p.effectiveness_score) * 100).toFixed(0)}%</div>
                  <div className="text-gray-500">{p.times_referenced}x used</div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-gray-500">No patterns yet</p>}
      </div>

      {/* Team Leaderboard */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" /> Team Pattern Leaderboard
        </h3>
        {data.leaderboard.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left py-2">Rep</th>
                <th className="text-right py-2">Patterns</th>
                <th className="text-right py-2">Avg Effectiveness</th>
                <th className="text-right py-2">Times Referenced</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.map(l => (
                <tr key={l.owner_email} className="border-t border-gray-800">
                  <td className="py-2 text-gray-300">{l.owner_email}</td>
                  <td className="py-2 text-right text-white">{l.pattern_count}</td>
                  <td className="py-2 text-right text-green-400">{(parseFloat(l.avg_effectiveness) * 100).toFixed(0)}%</td>
                  <td className="py-2 text-right text-blue-400">{l.total_references}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-xs text-gray-500">No leaderboard data</p>}
      </div>
    </div>
  );
}

// ─── Pattern Explorer ─────────────────────────────────────────────────────────

function PatternExplorer({ data, search, typeFilter, page, onSearchChange, onTypeChange, onPageChange }: {
  data: BrainHealthData;
  search: string;
  typeFilter: string;
  page: number;
  onSearchChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onPageChange: (v: number) => void;
}) {
  const { patterns } = data;
  const totalPages = Math.ceil(patterns.total / patterns.limit);

  const patternTypes = ['', 'objection_handling', 'discovery_question', 'roi_story', 'closing_technique', 'competitor_counter', 'prospect_pain_verbatim'];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search patterns..."
              value={search}
              onChange={e => { onSearchChange(e.target.value); onPageChange(1); }}
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => { onTypeChange(e.target.value); onPageChange(1); }}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">All Types</option>
            {patternTypes.filter(Boolean).map(t => (
              <option key={t} value={t}>{formatPatternType(t)}</option>
            ))}
          </select>
          <span className="text-xs text-gray-500">{patterns.total} patterns</span>
        </div>
      </div>

      {/* Pattern List */}
      <div className="space-y-2">
        {patterns.items.length > 0 ? patterns.items.map(p => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${patternTypeColors[p.pattern_type] || 'bg-gray-700 text-gray-300'}`}>
                    {formatPatternType(p.pattern_type)}
                  </span>
                  {p.owner_email && (
                    <span className="text-[10px] text-gray-500">{p.owner_email}</span>
                  )}
                  <span className="text-[10px] text-gray-600">{formatDate(p.created_at)}</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{p.pattern_text}</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <div className={`text-sm font-bold ${
                  parseFloat(p.effectiveness_score) >= 0.7 ? 'text-green-400'
                    : parseFloat(p.effectiveness_score) >= 0.4 ? 'text-yellow-400'
                    : 'text-red-400'
                }`}>
                  {(parseFloat(p.effectiveness_score) * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-gray-500">{p.times_referenced}x used</div>
              </div>
            </div>
          </div>
        )) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-500">No patterns found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Training Queue ───────────────────────────────────────────────────────────

function TrainingQueue({ data }: { data: BrainHealthData }) {
  const { trainingQueue, stalePatterns, unverifiedIntel } = data;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          icon={AlertTriangle}
          label="Struggled Conversations"
          value={trainingQueue.struggledConversations.length}
          color="text-red-400"
          subValue="Low qualification + abandoned/escalated"
        />
        <KpiCard
          icon={Eye}
          label="Unverified Intel"
          value={unverifiedIntel.length}
          color="text-orange-400"
          subValue="Needs human review"
        />
        <KpiCard
          icon={AlertCircle}
          label="Stale Patterns"
          value={stalePatterns.length}
          color="text-yellow-400"
          subValue="Low effectiveness, 30+ days old"
        />
      </div>

      {/* Struggled Conversations */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" /> Conversations Where Agent Struggled
        </h3>
        {trainingQueue.struggledConversations.length > 0 ? (
          <div className="space-y-3">
            {trainingQueue.struggledConversations.map(c => (
              <div key={c.conversation_id} className="flex items-start justify-between border-b border-gray-800 pb-3 last:border-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      c.terminal_state === 'abandoned' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      {c.terminal_state}
                    </span>
                    <span className="text-[10px] text-gray-500">{formatDate(c.started_at)}</span>
                    <span className="text-[10px] text-gray-600">{c.messages_count} msgs</span>
                  </div>
                  {c.objections_raised && c.objections_raised.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-gray-500">Objections:</span>
                      {c.objections_raised.slice(0, 3).map((obj, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] text-gray-400">{obj}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-red-400">{c.qualification_completeness}% qualified</div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-gray-500">No struggled conversations found</p>}
      </div>

      {/* Stale Patterns */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-yellow-400" /> Stale Patterns (Consider Removing)
        </h3>
        {stalePatterns.length > 0 ? (
          <div className="space-y-3">
            {stalePatterns.map(p => (
              <div key={p.id} className="flex items-start justify-between border-b border-gray-800 pb-3 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${patternTypeColors[p.pattern_type] || 'bg-gray-700 text-gray-300'}`}>
                      {formatPatternType(p.pattern_type)}
                    </span>
                    <span className="text-[10px] text-gray-600">Last updated {formatDate(p.updated_at)}</span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{p.pattern_text}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-xs text-red-400">{(parseFloat(p.effectiveness_score) * 100).toFixed(0)}%</div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-gray-500">No stale patterns</p>}
      </div>

      {/* Unverified Intelligence */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
          <Eye className="w-4 h-4 text-orange-400" /> Unverified Competitive Intelligence
        </h3>
        {unverifiedIntel.length > 0 ? (
          <div className="space-y-3">
            {unverifiedIntel.map(intel => (
              <div key={intel.id} className="flex items-start justify-between border-b border-gray-800 pb-3 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px] font-medium capitalize">
                      {intel.intel_type.replace(/_/g, ' ')}
                    </span>
                    {intel.competitor_name && (
                      <span className="text-[10px] text-gray-400">{intel.competitor_name}</span>
                    )}
                    <span className="text-[10px] text-gray-600">via {intel.source_type}</span>
                  </div>
                  <p className="text-xs text-gray-300 line-clamp-2">{intel.content}</p>
                </div>
                <span className="text-[10px] text-gray-600 shrink-0 ml-2">{formatDate(intel.created_at)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-gray-500">No unverified intelligence</p>}
      </div>
    </div>
  );
}

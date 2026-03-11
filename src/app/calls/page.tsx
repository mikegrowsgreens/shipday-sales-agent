'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Search, Phone, Clock, MessageSquare, ExternalLink, Video, Bot,
  PhoneCall, PhoneOff, PhoneMissed, Voicemail, CalendarCheck, Filter,
  ChevronDown, ChevronUp, BarChart3, ListTodo, Brain, Mail, Send,
  TrendingUp, Zap, Target, ArrowRight, AlertCircle, CheckCircle2,
  X, MessageCircle, FileText,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface PhoneCall {
  call_id: number;
  contact_id: number;
  direction: string;
  from_number: string | null;
  to_number: string | null;
  twilio_sid: string | null;
  status: string;
  disposition: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  notes: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  lifecycle_stage: string;
  lead_score: number;
  engagement_score: number;
}

interface FathomCall {
  call_id: string;
  title: string | null;
  call_date: string | null;
  duration_seconds: number | null;
  fathom_url: string | null;
  fathom_summary: string | null;
  meeting_summary: string | null;
  talk_listen_ratio: number | null;
  question_count: number | null;
  filler_word_count: number | null;
  longest_monologue_seconds: number | null;
  call_type: string | null;
  meeting_type: string | null;
  action_items: unknown;
  topics_discussed: unknown;
}

interface QueueItem {
  source: string;
  task_id?: number;
  contact_id: number;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  lifecycle_stage: string;
  lead_score: number;
  engagement_score: number;
  title?: string;
  instructions?: string | null;
  priority?: number;
  due_at?: string | null;
  reason?: string;
}

interface TalkTrack {
  opener: string;
  key_points: string[];
  objection_prep: string[];
  close_strategy: string;
  risk_flags: string[];
}

interface BriefData {
  contact: Record<string, unknown>;
  email_engagement: Record<string, number>;
  recent_touchpoints: Array<{
    channel: string; event_type: string; direction: string;
    subject: string | null; occurred_at: string;
  }>;
  call_history: Array<{
    disposition: string | null; duration_seconds: number | null;
    notes: string | null; created_at: string;
  }>;
  bdr_info: Record<string, unknown> | null;
  active_sequences: Array<{ sequence_name: string; status: string }>;
  talk_track: TalkTrack | null;
}

interface AnalyticsData {
  summary: {
    total_calls: number;
    connected: number;
    voicemails: number;
    no_answers: number;
    meetings_booked: number;
    avg_duration: number;
    total_duration: number;
    connect_rate: number;
  };
  volume_trend: Array<{ date: string; calls: number; connected: number }>;
  disposition_breakdown: Array<{ disposition: string; count: number }>;
  hourly_analysis: Array<{ hour: number; total: number; connected: number; connect_rate: number }>;
  day_of_week: Array<{ dow: number; day_name: string; total: number; connected: number; connect_rate: number }>;
  best_calling_time: string;
  best_calling_day: string;
  days: number;
}

interface SmsTemplate {
  id: string;
  name: string;
  category: string;
  template: string;
}

type TabKey = 'queue' | 'calls' | 'fathom' | 'analytics';

// ─── Main Page ──────────────────────────────────────────────────────

export default function CallsPage() {
  const [tab, setTab] = useState<TabKey>('queue');

  const tabs: { key: TabKey; label: string; icon: typeof Phone; desc: string }[] = [
    { key: 'queue', label: 'Call Queue', icon: ListTodo, desc: 'Today\'s prioritized calls' },
    { key: 'calls', label: 'Call Log', icon: PhoneCall, desc: 'All phone call history' },
    { key: 'fathom', label: 'Fathom', icon: Video, desc: 'Fathom call recordings' },
    { key: 'analytics', label: 'Analytics', icon: BarChart3, desc: 'Call performance metrics' },
  ];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Phone Agent</h1>
        <p className="text-sm text-gray-400 mt-1">
          {tabs.find(t => t.key === tab)?.desc}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-px">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              tab === t.key
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'queue' && <CallQueueTab />}
      {tab === 'calls' && <CallLogTab />}
      {tab === 'fathom' && <FathomTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </div>
  );
}

// ─── Call Queue Tab ─────────────────────────────────────────────────

function CallQueueTab() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [briefContactId, setBriefContactId] = useState<number | null>(null);
  const [callingId, setCallingId] = useState<number | null>(null);
  const [outcomeCallId, setOutcomeCallId] = useState<number | null>(null);
  const [outcomeContactId, setOutcomeContactId] = useState<number | null>(null);
  const [counts, setCounts] = useState({ tasks: 0, hot_leads: 0, email_openers: 0, total: 0 });

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/phone/queue');
      const data = await res.json();
      setQueue(data.queue || []);
      setCounts(data.counts || { tasks: 0, hot_leads: 0, email_openers: 0, total: 0 });
    } catch (err) {
      console.error('[queue] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCall = async (contactId: number, taskId?: number) => {
    setCallingId(contactId);
    try {
      const res = await fetch('/api/twilio/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, task_id: taskId }),
      });
      const data = await res.json();
      if (data.success) {
        // Show outcome logger for this call
        setOutcomeContactId(contactId);
        // Try to get the call_id
        const callRes = await fetch(`/api/phone/calls?search=&days=1&limit=1`);
        const callData = await callRes.json();
        if (callData.calls?.[0]?.contact_id === contactId) {
          setOutcomeCallId(callData.calls[0].call_id);
        }
      } else {
        alert(`Call failed: ${data.error}`);
      }
    } catch {
      alert('Call failed - check Twilio config');
    } finally {
      setCallingId(null);
    }
  };

  const sourceLabels: Record<string, { label: string; color: string }> = {
    task: { label: 'Task', color: 'bg-blue-900/40 text-blue-400' },
    hot_lead: { label: 'Hot Lead', color: 'bg-red-900/40 text-red-400' },
    email_opener: { label: 'Email Signal', color: 'bg-yellow-900/40 text-yellow-400' },
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Queue summary */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Queue" value={counts.total} icon={ListTodo} color="text-white" />
        <StatCard label="Tasks" value={counts.tasks} icon={Target} color="text-blue-400" />
        <StatCard label="Hot Leads" value={counts.hot_leads} icon={Zap} color="text-red-400" />
        <StatCard label="Email Signals" value={counts.email_openers} icon={Mail} color="text-yellow-400" />
      </div>

      {queue.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-gray-400">No calls queued. All caught up!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {queue.map((item, i) => {
            const name = [item.first_name, item.last_name].filter(Boolean).join(' ') || item.email || 'Unknown';
            const src = sourceLabels[item.source] || { label: item.source, color: 'bg-gray-800 text-gray-400' };

            return (
              <div key={`${item.contact_id}-${i}`} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <a href={`/contacts/${item.contact_id}`} className="text-sm font-medium text-white hover:text-blue-400">
                        {name}
                      </a>
                      {item.business_name && (
                        <span className="text-xs text-gray-500">{item.business_name}</span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${src.color}`}>
                        {src.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.title || item.reason || item.phone || ''}
                    </p>
                    {item.instructions && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{item.instructions}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Score: {item.lead_score}</span>
                    <span>Eng: {item.engagement_score}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Pre-call brief */}
                    <button
                      onClick={() => setBriefContactId(briefContactId === item.contact_id ? null : item.contact_id)}
                      className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-yellow-400 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                      title="Pre-call brief"
                    >
                      <Brain className="w-3 h-3" /> Brief
                    </button>

                    {/* Call button */}
                    <button
                      onClick={() => handleCall(item.contact_id, item.task_id)}
                      disabled={callingId === item.contact_id || !item.phone}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                      title={item.phone ? 'Click to call' : 'No phone number'}
                    >
                      {callingId === item.contact_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
                      Call
                    </button>
                  </div>
                </div>

                {/* Pre-call brief inline */}
                {briefContactId === item.contact_id && (
                  <PreCallBrief contactId={item.contact_id} onClose={() => setBriefContactId(null)} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Outcome logger modal */}
      {outcomeContactId && (
        <OutcomeLogger
          callId={outcomeCallId}
          contactId={outcomeContactId}
          onClose={() => { setOutcomeCallId(null); setOutcomeContactId(null); fetchQueue(); }}
        />
      )}
    </div>
  );
}

// ─── Call Log Tab ───────────────────────────────────────────────────

function CallLogTab() {
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [days, setDays] = useState('30');
  const [disposition, setDisposition] = useState('');
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [outcomeCallId, setOutcomeCallId] = useState<number | null>(null);
  const [emailBridgeCallId, setEmailBridgeCallId] = useState<number | null>(null);
  const [smsContactId, setSmsContactId] = useState<number | null>(null);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days, search });
      if (disposition) params.set('disposition', disposition);
      const res = await fetch(`/api/phone/calls?${params}`);
      const data = await res.json();
      setCalls(data.calls || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('[calls] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, days, disposition]);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  const dispositionIcons: Record<string, { icon: typeof Phone; color: string }> = {
    connected: { icon: PhoneCall, color: 'text-green-400' },
    voicemail: { icon: Voicemail, color: 'text-yellow-400' },
    'no-answer': { icon: PhoneMissed, color: 'text-red-400' },
    busy: { icon: PhoneOff, color: 'text-orange-400' },
    'wrong-number': { icon: AlertCircle, color: 'text-red-500' },
    'meeting-booked': { icon: CalendarCheck, color: 'text-blue-400' },
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={days} onChange={(e) => setDays(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500">
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>

        <select value={disposition} onChange={(e) => setDisposition(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500">
          <option value="">All Outcomes</option>
          <option value="connected">Connected</option>
          <option value="voicemail">Voicemail</option>
          <option value="no-answer">No Answer</option>
          <option value="busy">Busy</option>
          <option value="meeting-booked">Meeting Booked</option>
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search calls by name, company, notes..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>
      ) : calls.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500">No phone calls found</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{total} calls</p>
          {calls.map(call => {
            const isExpanded = expandedId === call.call_id;
            const name = [call.first_name, call.last_name].filter(Boolean).join(' ') || call.email || 'Unknown';
            const dispo = dispositionIcons[call.disposition || ''];
            const DispoIcon = dispo?.icon || Phone;

            return (
              <div key={call.call_id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : call.call_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
                >
                  <DispoIcon className={`w-4 h-4 ${dispo?.color || 'text-gray-400'} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{name}</span>
                      {call.business_name && (
                        <span className="text-xs text-gray-500">{call.business_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {new Date(call.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {call.disposition && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          call.disposition === 'connected' ? 'bg-green-900/40 text-green-400' :
                          call.disposition === 'meeting-booked' ? 'bg-blue-900/40 text-blue-400' :
                          call.disposition === 'voicemail' ? 'bg-yellow-900/40 text-yellow-400' :
                          'bg-gray-800 text-gray-400'
                        }`}>
                          {call.disposition}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-gray-400">
                      <Clock className="w-3 h-3" /> {formatDuration(call.duration_seconds)}
                    </span>
                  </div>

                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>

                {isExpanded && (
                  <div className="px-4 py-3 border-t border-gray-800 bg-gray-800/30 space-y-3">
                    {call.notes && (
                      <div>
                        <span className="text-[10px] text-gray-500 uppercase">Notes</span>
                        <p className="text-xs text-gray-300 mt-1">{call.notes}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div><div className="text-[10px] text-gray-500">Duration</div><div className="text-xs text-white">{formatDuration(call.duration_seconds)}</div></div>
                      <div><div className="text-[10px] text-gray-500">Direction</div><div className="text-xs text-white capitalize">{call.direction}</div></div>
                      <div><div className="text-[10px] text-gray-500">Status</div><div className="text-xs text-white">{call.status}</div></div>
                      <div><div className="text-[10px] text-gray-500">Contact</div><div className="text-xs text-white">{call.phone || '--'}</div></div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-800/50">
                      {!call.disposition && (
                        <button onClick={() => setOutcomeCallId(call.call_id)}
                          className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg">
                          <CheckCircle2 className="w-3 h-3" /> Log Outcome
                        </button>
                      )}
                      <button onClick={() => setEmailBridgeCallId(call.call_id)}
                        className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg">
                        <Mail className="w-3 h-3" /> Send Follow-Up
                      </button>
                      <button onClick={() => setSmsContactId(call.contact_id)}
                        className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 rounded-lg">
                        <MessageCircle className="w-3 h-3" /> SMS
                      </button>
                      <a href={`/contacts/${call.contact_id}`}
                        className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg">
                        <ExternalLink className="w-3 h-3" /> Contact
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {outcomeCallId && (
        <OutcomeLogger callId={outcomeCallId} onClose={() => { setOutcomeCallId(null); fetchCalls(); }} />
      )}
      {emailBridgeCallId && (
        <EmailBridge callId={emailBridgeCallId} onClose={() => setEmailBridgeCallId(null)} />
      )}
      {smsContactId && (
        <SmsTemplatePanel contactId={smsContactId} onClose={() => setSmsContactId(null)} />
      )}
    </div>
  );
}

// ─── Fathom Tab ─────────────────────────────────────────────────────

function FathomTab() {
  const [calls, setCalls] = useState<FathomCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [days, setDays] = useState('30');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days, type: 'fathom' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/calls?${params}`);
      const data = await res.json();
      setCalls(data.calls || []);
    } catch (err) {
      console.error('[fathom] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, days]);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={days} onChange={(e) => setDays(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500">
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Fathom calls..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>
      ) : calls.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center"><p className="text-gray-500">No Fathom calls found</p></div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{calls.length} calls</p>
          {calls.map(call => {
            const isExpanded = expandedId === call.call_id;
            const actionItems = Array.isArray(call.action_items) ? (call.action_items as string[]) : [];
            const topics = Array.isArray(call.topics_discussed) ? (call.topics_discussed as string[]) : [];

            return (
              <div key={call.call_id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : call.call_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors">
                  <Video className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white truncate block">{call.title || 'Untitled Call'}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{call.call_date ? new Date(call.call_date).toLocaleDateString() : '--'}</span>
                      {call.call_type && <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{call.call_type}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-gray-400"><Clock className="w-3 h-3" /> {formatDuration(call.duration_seconds)}</span>
                    {call.talk_listen_ratio !== null && (
                      <span className={`${call.talk_listen_ratio > 0.65 ? 'text-red-400' : call.talk_listen_ratio < 0.4 ? 'text-green-400' : 'text-yellow-400'}`}>
                        Talk: {(call.talk_listen_ratio * 100).toFixed(0)}%
                      </span>
                    )}
                    {call.question_count !== null && (
                      <span className="flex items-center gap-1 text-gray-400"><MessageSquare className="w-3 h-3" /> {call.question_count} Q</span>
                    )}
                  </div>
                  {call.fathom_url && (
                    <a href={call.fathom_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-400 hover:text-blue-300 p-1">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </button>
                {isExpanded && (
                  <div className="px-4 py-3 border-t border-gray-800 bg-gray-800/30 space-y-3">
                    {(call.fathom_summary || call.meeting_summary) && (
                      <div><span className="text-[10px] text-gray-500 uppercase">Summary</span><p className="text-xs text-gray-400 mt-1">{call.meeting_summary || call.fathom_summary}</p></div>
                    )}
                    {actionItems.length > 0 && (
                      <div><span className="text-[10px] text-gray-500 uppercase">Action Items</span>
                        <ul className="mt-1 space-y-1">{actionItems.map((item, i) => (
                          <li key={i} className="text-xs text-gray-400 flex items-start gap-1"><span className="text-gray-600">-</span> {typeof item === 'string' ? item : JSON.stringify(item)}</li>
                        ))}</ul>
                      </div>
                    )}
                    {topics.length > 0 && (
                      <div><span className="text-[10px] text-gray-500 uppercase">Topics</span>
                        <div className="flex flex-wrap gap-1 mt-1">{topics.map((t, i) => (
                          <span key={i} className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{typeof t === 'string' ? t : JSON.stringify(t)}</span>
                        ))}</div>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center"><div className="text-[10px] text-gray-500">Duration</div><div className="text-xs text-white">{formatDuration(call.duration_seconds)}</div></div>
                      <div className="text-center"><div className="text-[10px] text-gray-500">Talk Ratio</div><div className="text-xs text-white">{call.talk_listen_ratio ? `${(call.talk_listen_ratio * 100).toFixed(0)}%` : '--'}</div></div>
                      <div className="text-center"><div className="text-[10px] text-gray-500">Questions</div><div className="text-xs text-white">{call.question_count ?? '--'}</div></div>
                      <div className="text-center"><div className="text-[10px] text-gray-500">Fillers</div><div className="text-xs text-white">{call.filler_word_count ?? '--'}</div></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Analytics Tab ──────────────────────────────────────────────────

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/phone/analytics?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>;
  if (!data) return <div className="text-center text-gray-500 py-12">Failed to load analytics</div>;

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <select value={days} onChange={(e) => setDays(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500">
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Calls" value={s.total_calls} icon={Phone} color="text-white" />
        <StatCard label="Connect Rate" value={`${s.connect_rate}%`} icon={PhoneCall} color="text-green-400" />
        <StatCard label="Avg Duration" value={formatDuration(s.avg_duration)} icon={Clock} color="text-blue-400" />
        <StatCard label="Meetings Booked" value={s.meetings_booked} icon={CalendarCheck} color="text-purple-400" />
      </div>

      {/* Disposition breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Outcomes</h3>
          <div className="space-y-2">
            {data.disposition_breakdown.map(d => {
              const pct = s.total_calls > 0 ? Math.round(100 * d.count / s.total_calls) : 0;
              return (
                <div key={d.disposition} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-24 capitalize">{d.disposition.replace(/-/g, ' ')}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div className={`h-2 rounded-full ${
                      d.disposition === 'connected' ? 'bg-green-500' :
                      d.disposition === 'meeting-booked' ? 'bg-blue-500' :
                      d.disposition === 'voicemail' ? 'bg-yellow-500' :
                      d.disposition === 'no-answer' ? 'bg-red-500' :
                      'bg-gray-600'
                    }`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-12 text-right">{d.count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Best Times to Call</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3.5 h-3.5 text-green-400" />
              <span className="text-gray-300">Best hour: <span className="text-white font-medium">{data.best_calling_time}</span></span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CalendarCheck className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-gray-300">Best day: <span className="text-white font-medium">{data.best_calling_day}</span></span>
            </div>
            <div className="mt-3 space-y-1">
              {data.hourly_analysis.filter(h => h.total > 0).slice(0, 8).map(h => (
                <div key={h.hour} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 w-12">{h.hour}:00</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-green-500/60" style={{ width: `${h.connect_rate}%` }} />
                  </div>
                  <span className="text-gray-400 w-16 text-right">{h.connect_rate}% ({h.total})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Volume Trend */}
      {data.volume_trend.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Call Volume Trend</h3>
          <div className="flex items-end gap-1 h-32">
            {data.volume_trend.map((d, i) => {
              const maxCalls = Math.max(...data.volume_trend.map(v => v.calls), 1);
              const height = (d.calls / maxCalls) * 100;
              const connectedHeight = (d.connected / maxCalls) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div className="w-full relative" style={{ height: `${height}%`, minHeight: d.calls > 0 ? '4px' : '0' }}>
                    <div className="absolute inset-0 bg-gray-700 rounded-t" />
                    <div className="absolute bottom-0 left-0 right-0 bg-green-500 rounded-t" style={{ height: `${d.calls > 0 ? (connectedHeight / height) * 100 : 0}%` }} />
                  </div>
                  <div className="absolute -top-6 bg-gray-700 text-[10px] text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {d.calls} calls, {d.connected} connected
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-gray-700" /> Total</span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500" /> Connected</span>
          </div>
        </div>
      )}

      {/* Day of week */}
      {data.day_of_week.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Day of Week Performance</h3>
          <div className="grid grid-cols-7 gap-2">
            {data.day_of_week.map(d => (
              <div key={d.dow} className="text-center">
                <div className="text-[10px] text-gray-500 mb-1">{d.day_name.trim().substring(0, 3)}</div>
                <div className="text-sm font-bold text-white">{d.total}</div>
                <div className="text-[10px] text-green-400">{d.connect_rate}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pre-Call Brief Component ───────────────────────────────────────

function PreCallBrief({ contactId, onClose }: { contactId: number; onClose: () => void }) {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/phone/brief?contact_id=${contactId}`)
      .then(r => r.json())
      .then(setBrief)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [contactId]);

  if (loading) {
    return (
      <div className="mt-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3 h-3 animate-spin" /> Generating pre-call brief...</div>
      </div>
    );
  }

  if (!brief) return null;

  const tt = brief.talk_track;

  return (
    <div className="mt-3 p-4 bg-gray-800/50 rounded-lg border border-yellow-900/30 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400">
          <Brain className="w-3.5 h-3.5" /> Pre-Call Intelligence Brief
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* Email engagement */}
      <div className="grid grid-cols-4 gap-2">
        {Object.entries(brief.email_engagement).map(([type, count]) => (
          <div key={type} className="text-center bg-gray-900/50 rounded p-2">
            <div className="text-sm font-bold text-white">{count}</div>
            <div className="text-[10px] text-gray-500 capitalize">{type.replace(/_/g, ' ')}</div>
          </div>
        ))}
      </div>

      {/* Previous calls */}
      {brief.call_history.length > 0 && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase">Previous Calls</span>
          <div className="space-y-1 mt-1">
            {brief.call_history.map((ch, i) => (
              <div key={i} className="text-xs text-gray-400">
                {ch.disposition || 'unknown'} - {formatDuration(ch.duration_seconds)} - {ch.notes || 'no notes'} ({new Date(ch.created_at).toLocaleDateString()})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active sequences */}
      {brief.active_sequences.length > 0 && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase">Active Sequences</span>
          <div className="flex gap-1 mt-1">
            {brief.active_sequences.map((s, i) => (
              <span key={i} className="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded">{s.sequence_name}</span>
            ))}
          </div>
        </div>
      )}

      {/* AI Talk Track */}
      {tt && (
        <div className="space-y-2 pt-2 border-t border-gray-700">
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Opener</span>
            <p className="text-xs text-green-400 mt-0.5">&ldquo;{tt.opener}&rdquo;</p>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Key Points</span>
            <ul className="mt-0.5 space-y-0.5">
              {tt.key_points.map((p, i) => (
                <li key={i} className="text-xs text-gray-300 flex items-start gap-1"><ArrowRight className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" /> {p}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Objection Prep</span>
            <ul className="mt-0.5 space-y-0.5">
              {tt.objection_prep.map((o, i) => (
                <li key={i} className="text-xs text-gray-400 flex items-start gap-1"><AlertCircle className="w-3 h-3 text-yellow-400 shrink-0 mt-0.5" /> {o}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Close Strategy</span>
            <p className="text-xs text-gray-300 mt-0.5">{tt.close_strategy}</p>
          </div>
          {tt.risk_flags.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase">Risk Flags</span>
              <ul className="mt-0.5">
                {tt.risk_flags.map((f, i) => (
                  <li key={i} className="text-xs text-red-400">{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Outcome Logger Component ───────────────────────────────────────

function OutcomeLogger({ callId, contactId, onClose }: { callId: number | null; contactId?: number; onClose: () => void }) {
  const [disposition, setDisposition] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ auto_actions: string[] } | null>(null);

  const dispositions = [
    { value: 'connected', label: 'Connected', icon: PhoneCall, color: 'bg-green-600 hover:bg-green-700' },
    { value: 'voicemail', label: 'Voicemail', icon: Voicemail, color: 'bg-yellow-600 hover:bg-yellow-700' },
    { value: 'no-answer', label: 'No Answer', icon: PhoneMissed, color: 'bg-red-600 hover:bg-red-700' },
    { value: 'busy', label: 'Busy', icon: PhoneOff, color: 'bg-orange-600 hover:bg-orange-700' },
    { value: 'meeting-booked', label: 'Meeting Booked', icon: CalendarCheck, color: 'bg-blue-600 hover:bg-blue-700' },
    { value: 'wrong-number', label: 'Wrong Number', icon: AlertCircle, color: 'bg-gray-600 hover:bg-gray-700' },
  ];

  const handleSave = async () => {
    if (!disposition) return;
    setSaving(true);
    try {
      const res = await fetch('/api/phone/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId, disposition, notes }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch {
      alert('Failed to log outcome');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Log Call Outcome</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">Outcome logged: {disposition}</span>
            </div>
            {result.auto_actions.length > 0 && (
              <div>
                <span className="text-[10px] text-gray-500 uppercase">Auto-Actions Triggered</span>
                <ul className="mt-1 space-y-1">
                  {result.auto_actions.map((a, i) => (
                    <li key={i} className="text-xs text-blue-400 flex items-center gap-1"><Zap className="w-3 h-3" /> {a}</li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={onClose} className="w-full bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded-lg">Done</button>
          </div>
        ) : (
          <>
            {/* Quick disposition buttons */}
            <div className="grid grid-cols-3 gap-2">
              {dispositions.map(d => {
                const Icon = d.icon;
                return (
                  <button key={d.value}
                    onClick={() => setDisposition(d.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg text-white text-xs transition-all ${
                      disposition === d.value ? d.color + ' ring-2 ring-white/30' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}>
                    <Icon className="w-4 h-4" />
                    {d.label}
                  </button>
                );
              })}
            </div>

            {/* Notes */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Call notes (optional)..."
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />

            <button
              onClick={handleSave}
              disabled={!disposition || saving}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm py-2 rounded-lg flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Log Outcome
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Email Bridge Component ─────────────────────────────────────────

function EmailBridge({ callId, onClose }: { callId: number; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState({ subject: '', body: '', contact_email: '', contact_name: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch('/api/phone/email-bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: callId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          alert(data.error);
          onClose();
        } else {
          setEmail(data);
        }
      })
      .catch(() => { alert('Failed to generate email'); onClose(); })
      .finally(() => setLoading(false));
  }, [callId, onClose]);

  const handleSend = async () => {
    setSending(true);
    // In production, this would send via Gmail API
    // For now, copy to clipboard
    await navigator.clipboard.writeText(`To: ${email.contact_email}\nSubject: ${email.subject}\n\n${email.body}`);
    setSent(true);
    setSending(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5"><Mail className="w-4 h-4 text-blue-400" /> Send What We Discussed</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-8"><Loader2 className="w-4 h-4 animate-spin" /> Generating follow-up email from call notes...</div>
        ) : sent ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-gray-300">Email copied to clipboard!</p>
            <p className="text-xs text-gray-500 mt-1">Paste into Gmail to send to {email.contact_email}</p>
            <button onClick={onClose} className="mt-3 bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg">Done</button>
          </div>
        ) : (
          <>
            <div>
              <span className="text-[10px] text-gray-500 uppercase">To</span>
              <p className="text-xs text-gray-300">{email.contact_name} &lt;{email.contact_email}&gt;</p>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase">Subject</span>
              <input
                type="text"
                value={email.subject}
                onChange={(e) => setEmail(prev => ({ ...prev, subject: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase">Body</span>
              <textarea
                value={email.body}
                onChange={(e) => setEmail(prev => ({ ...prev, body: e.target.value }))}
                rows={8}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-white mt-1 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm py-2 rounded-lg flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Copy to Clipboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SMS Template Panel ─────────────────────────────────────────────

function SmsTemplatePanel({ contactId, onClose }: { contactId: number; onClose: () => void }) {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [selected, setSelected] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch('/api/phone/sms-templates')
      .then(r => r.json())
      .then(data => setTemplates(data.templates || []))
      .catch(console.error);
  }, []);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/phone/sms-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          template_id: selected || undefined,
          custom_body: customBody || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
      } else {
        alert(`SMS failed: ${data.error}`);
      }
    } catch {
      alert('SMS failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5"><MessageCircle className="w-4 h-4 text-purple-400" /> SMS Templates</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X className="w-4 h-4" /></button>
        </div>

        {sent ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-gray-300">SMS sent!</p>
            <button onClick={onClose} className="mt-3 bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg">Done</button>
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {templates.map(t => (
                <button key={t.id}
                  onClick={() => { setSelected(t.id); setCustomBody(''); }}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected === t.id ? 'border-purple-500 bg-purple-900/20' : 'border-gray-800 bg-gray-800/50 hover:border-gray-700'
                  }`}>
                  <div className="text-xs font-medium text-gray-200">{t.name}</div>
                  <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{t.template}</p>
                </button>
              ))}
            </div>

            <div className="border-t border-gray-800 pt-3">
              <span className="text-[10px] text-gray-500 uppercase">Or custom message</span>
              <textarea
                value={customBody}
                onChange={(e) => { setCustomBody(e.target.value); setSelected(''); }}
                placeholder="Type a custom SMS..."
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-white mt-1 placeholder:text-gray-500 focus:outline-none focus:border-purple-500 resize-none"
              />
            </div>

            <button
              onClick={handleSend}
              disabled={(!selected && !customBody.trim()) || sending}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm py-2 rounded-lg flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send SMS
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof Phone; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function formatDuration(secs: number | null | undefined): string {
  if (!secs) return '--';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

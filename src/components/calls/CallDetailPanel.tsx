'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Loader2, Phone, Clock, MessageSquare, ExternalLink, Video,
  PhoneCall, PhoneOff, PhoneMissed, Voicemail, CalendarCheck,
  ChevronUp, BarChart3, ListTodo, Brain, Mail, Send,
  AlertCircle, CheckCircle2, X, MessageCircle, FileText,
  Play, Pause, Volume2, User, ArrowRight, Mic, MicOff,
  Edit3, Save, XCircle,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface PhoneCallData {
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

interface FathomData {
  fathom_call_id: string;
  title: string | null;
  call_date: string | null;
  fathom_duration: number | null;
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

interface CallDetailPanelProps {
  call: PhoneCallData;
  onClose: () => void;
  onNotesUpdated?: (callId: number, notes: string) => void;
  onDispositionUpdated?: (callId: number, disposition: string) => void;
  onEmailBridge?: (callId: number) => void;
  onSms?: (contactId: number) => void;
}

// ─── Audio Player ───────────────────────────────────────────────────

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleEnded = () => setPlaying(false);

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-900/80 rounded-lg p-3 border border-gray-700/50">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center transition-colors flex-shrink-0"
        >
          {playing ? <Pause className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 text-white ml-0.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-gray-500">{fmt(currentTime)}</span>
            <span className="text-[10px] text-gray-500">{fmt(duration)}</span>
          </div>
        </div>
        <button
          onClick={cycleSpeed}
          className="text-[10px] text-gray-400 hover:text-white bg-gray-800 px-1.5 py-0.5 rounded transition-colors flex-shrink-0"
        >
          {playbackRate}x
        </button>
        <Volume2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
      </div>
    </div>
  );
}

// ─── Inline Notes Editor ────────────────────────────────────────────

function NotesEditor({
  callId,
  initialNotes,
  onSaved,
}: {
  callId: number;
  initialNotes: string;
  onSaved: (notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/phone/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        onSaved(notes);
        setEditing(false);
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(initialNotes);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="group">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Notes</span>
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-all"
          >
            <Edit3 className="w-3 h-3" /> Edit
          </button>
        </div>
        {notes ? (
          <p className="text-xs text-gray-300 whitespace-pre-wrap">{notes}</p>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-gray-600 hover:text-gray-400 italic transition-colors"
          >
            Click to add notes...
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Notes</span>
      <textarea
        ref={textareaRef}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        className="w-full bg-gray-900 border border-blue-500/50 rounded-lg px-3 py-2 text-xs text-white mt-1 focus:outline-none focus:border-blue-500 resize-none"
        placeholder="Add call notes..."
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] px-2.5 py-1 rounded transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
        <button
          onClick={handleCancel}
          className="flex items-center gap-1 text-gray-400 hover:text-gray-300 text-[10px] px-2 py-1 rounded transition-colors"
        >
          <XCircle className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Fathom Metrics Card ────────────────────────────────────────────

function FathomMetrics({ fathom }: { fathom: FathomData }) {
  const actionItems = Array.isArray(fathom.action_items) ? (fathom.action_items as string[]) : [];
  const topics = Array.isArray(fathom.topics_discussed) ? (fathom.topics_discussed as string[]) : [];

  const talkPct = fathom.talk_listen_ratio !== null ? (fathom.talk_listen_ratio * 100).toFixed(0) : null;
  const listenPct = fathom.talk_listen_ratio !== null ? ((1 - fathom.talk_listen_ratio) * 100).toFixed(0) : null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[10px] text-purple-400 uppercase tracking-wider font-medium">Fathom AI Insights</span>
        </div>
        {fathom.fathom_url && (
          <a
            href={fathom.fathom_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Open in Fathom
          </a>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-2">
        <MetricCard
          label="Talk / Listen"
          value={talkPct !== null ? `${talkPct}% / ${listenPct}%` : '--'}
          icon={fathom.talk_listen_ratio && fathom.talk_listen_ratio > 0.65 ? MicOff : Mic}
          color={
            fathom.talk_listen_ratio === null ? 'text-gray-400' :
            fathom.talk_listen_ratio > 0.65 ? 'text-red-400' :
            fathom.talk_listen_ratio < 0.4 ? 'text-green-400' : 'text-yellow-400'
          }
        />
        <MetricCard
          label="Questions Asked"
          value={fathom.question_count ?? '--'}
          icon={MessageSquare}
          color={fathom.question_count !== null && fathom.question_count >= 5 ? 'text-green-400' : 'text-gray-400'}
        />
        <MetricCard
          label="Filler Words"
          value={fathom.filler_word_count ?? '--'}
          icon={AlertCircle}
          color={fathom.filler_word_count !== null && fathom.filler_word_count > 20 ? 'text-red-400' : 'text-gray-400'}
        />
        <MetricCard
          label="Longest Monologue"
          value={fathom.longest_monologue_seconds ? formatDuration(fathom.longest_monologue_seconds) : '--'}
          icon={Clock}
          color={fathom.longest_monologue_seconds !== null && fathom.longest_monologue_seconds > 120 ? 'text-yellow-400' : 'text-gray-400'}
        />
      </div>

      {/* Talk / Listen ratio bar */}
      {fathom.talk_listen_ratio !== null && (
        <div>
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
            <span>You talked {talkPct}%</span>
            <span>They talked {listenPct}%</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div
              className={`${fathom.talk_listen_ratio > 0.65 ? 'bg-red-500' : fathom.talk_listen_ratio > 0.5 ? 'bg-yellow-500' : 'bg-green-500'} transition-all`}
              style={{ width: `${fathom.talk_listen_ratio * 100}%` }}
            />
            <div className="bg-blue-500 flex-1" />
          </div>
        </div>
      )}

      {/* Summary */}
      {(fathom.meeting_summary || fathom.fathom_summary) && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Summary</span>
          <p className="text-xs text-gray-300 mt-1 leading-relaxed">
            {fathom.meeting_summary || fathom.fathom_summary}
          </p>
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <ListTodo className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Action Items</span>
          </div>
          <ul className="space-y-1">
            {actionItems.map((item, i) => (
              <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                <span className="w-4 h-4 rounded border border-gray-700 flex-shrink-0 mt-0.5" />
                <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Topics */}
      {topics.length > 0 && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Topics Discussed</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {topics.map((t, i) => (
              <span key={i} className="text-[10px] bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded-full">
                {typeof t === 'string' ? t : JSON.stringify(t)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Meeting type */}
      {fathom.meeting_type && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">Meeting Type:</span>
          <span className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded capitalize">{fathom.meeting_type}</span>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof Phone;
  color: string;
}) {
  return (
    <div className="bg-gray-900/60 rounded-lg p-2.5 text-center">
      <Icon className={`w-3.5 h-3.5 ${color} mx-auto mb-1`} />
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────

export default function CallDetailPanel({
  call,
  onClose,
  onNotesUpdated,
  onDispositionUpdated,
  onEmailBridge,
  onSms,
}: CallDetailPanelProps) {
  const [fathom, setFathom] = useState<FathomData | null>(null);
  const [loadingFathom, setLoadingFathom] = useState(true);
  const [savingDisposition, setSavingDisposition] = useState(false);

  const name = [call.first_name, call.last_name].filter(Boolean).join(' ') || call.email || 'Unknown';

  useEffect(() => {
    fetch(`/api/phone/calls/${call.call_id}`)
      .then(r => r.json())
      .then(data => {
        if (data.fathom) setFathom(data.fathom);
      })
      .catch(console.error)
      .finally(() => setLoadingFathom(false));
  }, [call.call_id]);

  const dispositionOptions = [
    { value: 'connected', label: 'Connected', icon: PhoneCall, color: 'bg-green-600 hover:bg-green-700' },
    { value: 'voicemail', label: 'Voicemail', icon: Voicemail, color: 'bg-yellow-600 hover:bg-yellow-700' },
    { value: 'no-answer', label: 'No Answer', icon: PhoneMissed, color: 'bg-red-600 hover:bg-red-700' },
    { value: 'busy', label: 'Busy', icon: PhoneOff, color: 'bg-orange-600 hover:bg-orange-700' },
    { value: 'meeting-booked', label: 'Meeting Booked', icon: CalendarCheck, color: 'bg-blue-600 hover:bg-blue-700' },
    { value: 'wrong-number', label: 'Wrong Number', icon: AlertCircle, color: 'bg-gray-600 hover:bg-gray-700' },
  ];

  const handleDisposition = async (disposition: string) => {
    setSavingDisposition(true);
    try {
      const res = await fetch(`/api/phone/calls/${call.call_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disposition }),
      });
      if (res.ok) {
        onDispositionUpdated?.(call.call_id, disposition);
      }
    } catch {
      // silently fail
    } finally {
      setSavingDisposition(false);
    }
  };

  const dispositionIcon = (d: string) => {
    const found = dispositionOptions.find(o => o.value === d);
    return found ? found : null;
  };

  const currentDispo = call.disposition ? dispositionIcon(call.disposition) : null;

  return (
    <div className="px-4 py-4 border-t border-gray-700/50 bg-gray-800/40 space-y-4">
      {/* ─── Header: Contact info + quick actions ─── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
            <User className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <a
                href={`/contacts/${call.contact_id}`}
                className="text-sm font-semibold text-white hover:text-blue-400 transition-colors"
              >
                {name}
              </a>
              {call.business_name && (
                <span className="text-xs text-gray-500">{call.business_name}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
              {call.phone && <span>{call.phone}</span>}
              {call.email && <span>{call.email}</span>}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors p-1"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {/* ─── Call Metadata Grid ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-gray-900/60 rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Direction</div>
          <div className="text-xs text-white capitalize mt-0.5 flex items-center gap-1">
            {call.direction === 'outbound' ? <ArrowRight className="w-3 h-3 text-blue-400" /> : <Phone className="w-3 h-3 text-green-400" />}
            {call.direction}
          </div>
        </div>
        <div className="bg-gray-900/60 rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Duration</div>
          <div className="text-xs text-white mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3 text-gray-400" />
            {formatDuration(call.duration_seconds)}
          </div>
        </div>
        <div className="bg-gray-900/60 rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Status</div>
          <div className="text-xs text-white capitalize mt-0.5">{call.status}</div>
        </div>
        <div className="bg-gray-900/60 rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Disposition</div>
          <div className="text-xs mt-0.5 flex items-center gap-1">
            {currentDispo ? (
              <span className={`flex items-center gap-1 ${
                call.disposition === 'connected' ? 'text-green-400' :
                call.disposition === 'meeting-booked' ? 'text-blue-400' :
                call.disposition === 'voicemail' ? 'text-yellow-400' :
                call.disposition === 'no-answer' ? 'text-red-400' :
                'text-gray-400'
              }`}>
                {call.disposition?.replace(/-/g, ' ')}
              </span>
            ) : (
              <span className="text-gray-600 italic">Not set</span>
            )}
          </div>
        </div>
        <div className="bg-gray-900/60 rounded-lg p-2.5">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">When</div>
          <div className="text-xs text-white mt-0.5">
            {call.started_at
              ? new Date(call.started_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })
              : new Date(call.created_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
          </div>
        </div>
      </div>

      {/* ─── Recording Player ─── */}
      {call.recording_url && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Volume2 className="w-3.5 h-3.5 text-green-400" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Recording</span>
          </div>
          <AudioPlayer url={call.recording_url} />
        </div>
      )}

      {/* ─── Notes (editable) ─── */}
      <NotesEditor
        callId={call.call_id}
        initialNotes={call.notes || ''}
        onSaved={(notes) => onNotesUpdated?.(call.call_id, notes)}
      />

      {/* ─── Disposition Quick-Set (if not already set) ─── */}
      {!call.disposition && (
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Log Disposition</span>
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {dispositionOptions.map(d => {
              const Icon = d.icon;
              return (
                <button
                  key={d.value}
                  onClick={() => handleDisposition(d.value)}
                  disabled={savingDisposition}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-[10px] font-medium transition-all ${d.color} disabled:opacity-50`}
                >
                  <Icon className="w-3 h-3" />
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Fathom AI Section ─── */}
      {loadingFathom ? (
        <div className="flex items-center gap-2 text-[10px] text-gray-500 py-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking for Fathom data...
        </div>
      ) : fathom ? (
        <div className="border-t border-gray-700/50 pt-4">
          <FathomMetrics fathom={fathom} />
        </div>
      ) : null}

      {/* ─── Quick Actions ─── */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-700/50">
        {onEmailBridge && (
          <button
            onClick={() => onEmailBridge(call.call_id)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            <Mail className="w-3 h-3" /> Send Follow-Up
          </button>
        )}
        {onSms && (
          <button
            onClick={() => onSms(call.contact_id)}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            <MessageCircle className="w-3 h-3" /> SMS
          </button>
        )}
        <a
          href={`/contacts/${call.contact_id}`}
          className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> View Contact
        </a>
        {call.twilio_sid && (
          <span className="ml-auto text-[10px] text-gray-600 font-mono">
            SID: {call.twilio_sid.slice(-8)}
          </span>
        )}
      </div>
    </div>
  );
}

function formatDuration(secs: number | null | undefined): string {
  if (!secs) return '--';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

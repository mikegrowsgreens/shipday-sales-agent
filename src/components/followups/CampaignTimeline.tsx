'use client';

import { useState, useEffect } from 'react';
import { Check, Clock, Edit3, X, Loader2, Calendar, Send, FlaskConical, CalendarClock, ChevronDown, ChevronUp, Mail, MailCheck, MailX } from 'lucide-react';
import DraftEditor from '@/components/followups/DraftEditor';

interface Draft {
  id: number;
  deal_id: string;
  touch_number: number;
  subject: string | null;
  body_plain: string | null;
  status: string;
  suggested_send_time: string | null;
  scheduled_at?: string | null;
  sent_at: string | null;
  approved_at: string | null;
  mike_edited: boolean;
}

interface CampaignTimelineProps {
  drafts: Draft[];
  onSaveDraft: (id: number, subject: string, body: string) => Promise<void>;
  onApproveDraft: (ids: number[], scheduleMap?: Record<number, string>) => Promise<void>;
  onRescheduleDraft?: (id: number, scheduledAt: string) => Promise<void>;
  onRegenerateDraft?: (id: number) => Promise<void>;
}

const statusConfig: Record<string, { color: string; bg: string; iconColor: string; label: string }> = {
  draft: { color: 'border-gray-600 text-gray-400', bg: 'bg-gray-600', iconColor: 'text-gray-400', label: 'Draft' },
  approved: { color: 'border-yellow-600 text-yellow-400', bg: 'bg-yellow-500', iconColor: 'text-yellow-400', label: 'Scheduled' },
  sent: { color: 'border-green-600 text-green-400', bg: 'bg-green-500', iconColor: 'text-green-400', label: 'Sent' },
  rejected: { color: 'border-red-600 text-red-400', bg: 'bg-red-500', iconColor: 'text-red-400', label: 'Rejected' },
};

function toLocalDateTimeString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

const CADENCE_OPTIONS = {
  tight: { label: 'Tight (1-2 day gaps)', days: [0, 1, 2, 4, 6, 9, 13] },
  standard: { label: 'Standard (2-7 day gaps)', days: [0, 2, 4, 7, 10, 14, 21] },
  relaxed: { label: 'Relaxed (3-7 day gaps)', days: [0, 3, 7, 14, 21, 28, 35] },
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'sent': return <MailCheck className="w-3.5 h-3.5" />;
    case 'approved': return <Clock className="w-3.5 h-3.5" />;
    case 'rejected': return <MailX className="w-3.5 h-3.5" />;
    default: return <Mail className="w-3.5 h-3.5" />;
  }
}

export default function CampaignTimeline({ drafts, onSaveDraft, onApproveDraft, onRescheduleDraft, onRegenerateDraft }: CampaignTimelineProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [testSendingId, setTestSendingId] = useState<number | null>(null);
  const [testSentId, setTestSentId] = useState<number | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  // Per-touch scheduling
  const [touchSchedules, setTouchSchedules] = useState<Record<number, string>>({});
  const [savingScheduleId, setSavingScheduleId] = useState<number | null>(null);
  const [cadence, setCadence] = useState<keyof typeof CADENCE_OPTIONS>('standard');
  const [baseDate, setBaseDate] = useState('');

  useEffect(() => {
    const schedules: Record<number, string> = {};
    let hasAnyDate = false;
    for (const draft of drafts) {
      const time = draft.scheduled_at || draft.suggested_send_time;
      if (time && draft.status === 'draft') {
        schedules[draft.id] = toLocalDateTimeString(new Date(time));
        hasAnyDate = true;
      }
    }
    setTouchSchedules(prev => {
      const merged = { ...schedules };
      for (const [id, time] of Object.entries(prev)) {
        if (time && drafts.find(d => d.id === Number(id) && d.status === 'draft')) {
          merged[Number(id)] = time;
        }
      }
      return merged;
    });

    const pending = drafts.filter(d => d.status === 'draft');
    if (pending.length > 0 && !hasAnyDate && !baseDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      setBaseDate(toLocalDateTimeString(tomorrow));
    }

    // Auto-collapse sent touches
    const sentIds = new Set<number>();
    for (const d of drafts) {
      if (d.status === 'sent') sentIds.add(d.id);
    }
    setCollapsedIds(sentIds);
  }, [drafts]);

  const toggleCollapse = (id: number) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveTouchSchedule = async (draftId: number, dateTimeLocal: string) => {
    setSavingScheduleId(draftId);
    try {
      const isoTime = new Date(dateTimeLocal).toISOString();
      await fetch(`/api/followups/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggested_send_time: isoTime }),
      });
    } finally {
      setSavingScheduleId(null);
    }
  };

  const handleTouchScheduleChange = (draftId: number, value: string) => {
    setTouchSchedules(prev => ({ ...prev, [draftId]: value }));
    if (value) {
      saveTouchSchedule(draftId, value);
    }
  };

  const handleQuickFill = () => {
    if (!baseDate) return;
    const spacing = CADENCE_OPTIONS[cadence].days;
    const base = new Date(baseDate);
    const pending = drafts.filter(d => d.status === 'draft');

    const newSchedules = { ...touchSchedules };
    for (const draft of pending) {
      const dayOffset = spacing[Math.min(draft.touch_number - 1, spacing.length - 1)] || (draft.touch_number - 1) * 3;
      const sendDate = new Date(base);
      sendDate.setDate(sendDate.getDate() + dayOffset);
      const val = toLocalDateTimeString(sendDate);
      newSchedules[draft.id] = val;
      saveTouchSchedule(draft.id, val);
    }
    setTouchSchedules(newSchedules);
  };

  const handleApproveAll = async () => {
    const pending = drafts.filter(d => d.status === 'draft');
    if (pending.length === 0) return;

    const draftIds = pending.map(d => d.id);
    const scheduleMap: Record<number, string> = {};
    for (const draft of pending) {
      if (touchSchedules[draft.id]) {
        scheduleMap[draft.id] = new Date(touchSchedules[draft.id]).toISOString();
      }
    }

    setApproving(true);
    try {
      await onApproveDraft(draftIds, Object.keys(scheduleMap).length > 0 ? scheduleMap : undefined);
    } finally {
      setApproving(false);
    }
  };

  const handleApproveSingle = async (draftId: number) => {
    const scheduleMap: Record<number, string> = {};
    if (touchSchedules[draftId]) {
      scheduleMap[draftId] = new Date(touchSchedules[draftId]).toISOString();
    }
    await onApproveDraft([draftId], Object.keys(scheduleMap).length > 0 ? scheduleMap : undefined);
  };

  const handleReschedule = async (draftId: number) => {
    if (!rescheduleDate || !onRescheduleDraft) return;
    setRescheduleSaving(true);
    try {
      await onRescheduleDraft(draftId, new Date(rescheduleDate).toISOString());
      setReschedulingId(null);
      setRescheduleDate('');
    } finally {
      setRescheduleSaving(false);
    }
  };

  const handleTestSend = async (draftId: number) => {
    setTestSendingId(draftId);
    try {
      await fetch('/api/followups/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId }),
      });
      setTestSentId(draftId);
      setTimeout(() => setTestSentId(null), 3000);
    } finally {
      setTestSendingId(null);
    }
  };

  const pendingDrafts = drafts.filter(d => d.status === 'draft');
  const sentCount = drafts.filter(d => d.status === 'sent').length;
  const approvedCount = drafts.filter(d => d.status === 'approved').length;
  const totalTouches = drafts.length;
  const progressPct = totalTouches > 0 ? Math.round(((sentCount + approvedCount) / totalTouches) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Campaign Progress — visual header */}
      {totalTouches > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-300">Campaign Progress</span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-green-400">
                <div className="w-2 h-2 rounded-full bg-green-500" /> {sentCount} sent
              </span>
              <span className="flex items-center gap-1 text-yellow-400">
                <div className="w-2 h-2 rounded-full bg-yellow-500" /> {approvedCount} scheduled
              </span>
              <span className="flex items-center gap-1 text-gray-400">
                <div className="w-2 h-2 rounded-full bg-gray-600" /> {pendingDrafts.length} pending
              </span>
            </div>
          </div>

          {/* Interactive progress bar with touch nodes */}
          <div className="relative">
            {/* Track */}
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-yellow-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {/* Touch nodes */}
            <div className="flex justify-between mt-1">
              {drafts.map((draft) => {
                const cfg = statusConfig[draft.status] || statusConfig.draft;
                const scheduledTime = draft.sent_at || draft.scheduled_at || draft.suggested_send_time;
                return (
                  <button
                    key={draft.id}
                    onClick={() => toggleCollapse(draft.id)}
                    className={`flex flex-col items-center gap-0.5 group relative ${cfg.iconColor} hover:opacity-80 transition-opacity`}
                    title={`Touch ${draft.touch_number}: ${cfg.label}`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 ${cfg.color} bg-gray-950 flex items-center justify-center`}>
                      <StatusIcon status={draft.status} />
                    </div>
                    <span className="text-[9px] text-gray-500">T{draft.touch_number}</span>
                    {scheduledTime && (
                      <span className="text-[9px] text-gray-600">
                        {new Date(scheduledTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Timeline + Approve All */}
      {pendingDrafts.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-gray-300">Schedule Timeline</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Start from:</span>
            <input
              type="datetime-local"
              value={baseDate}
              onChange={(e) => setBaseDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as keyof typeof CADENCE_OPTIONS)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              {Object.entries(CADENCE_OPTIONS).map(([key, opt]) => (
                <option key={key} value={key}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={handleQuickFill}
              disabled={!baseDate}
              className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white px-3 py-1 rounded transition-colors"
            >
              Auto-fill dates
            </button>
          </div>

          <p className="text-[10px] text-gray-600">
            Or set each touch individually below. Times save automatically.
          </p>

          <div className="flex justify-end">
            <button
              onClick={handleApproveAll}
              disabled={approving}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs px-4 py-2 rounded-lg transition-colors"
            >
              {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Approve All ({pendingDrafts.length})
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-800" />

        {drafts.map((draft) => {
          const config = statusConfig[draft.status] || statusConfig.draft;
          const isEditing = editingId === draft.id;
          const isRescheduling = reschedulingId === draft.id;
          const isCollapsed = collapsedIds.has(draft.id) && !isEditing;
          const scheduledTime = draft.scheduled_at || draft.suggested_send_time;
          const canEdit = draft.status !== 'sent';
          const canReschedule = draft.status === 'approved' && !draft.sent_at;
          const isDraft = draft.status === 'draft';

          return (
            <div key={draft.id} className="relative pl-10 pb-4">
              {/* Timeline node */}
              <div className={`absolute left-2 top-1.5 w-4 h-4 rounded-full border-2 bg-gray-950 flex items-center justify-center ${config.color}`}>
                <StatusIcon status={draft.status} />
              </div>

              <div className={`bg-gray-900 border border-gray-800 rounded-xl transition-all ${isCollapsed ? 'p-3' : 'p-4'}`}>
                {/* Touch header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleCollapse(draft.id)}
                      className="flex items-center gap-1.5 hover:opacity-80"
                    >
                      {isCollapsed ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronUp className="w-3 h-3 text-gray-500" />}
                      <span className="text-xs font-semibold text-white">Touch {draft.touch_number}</span>
                    </button>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${config.color}`}>
                      {config.label}
                    </span>
                    {draft.mike_edited && (
                      <span className="text-[10px] text-blue-400">edited</span>
                    )}
                    {/* Collapsed: show subject preview */}
                    {isCollapsed && draft.subject && (
                      <span className="text-xs text-gray-500 truncate max-w-[300px]">{draft.subject}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && !isEditing && (
                      <button onClick={() => { setEditingId(draft.id); setCollapsedIds(prev => { const n = new Set(prev); n.delete(draft.id); return n; }); }} className="p-1 text-gray-500 hover:text-white" title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isDraft && !isEditing && (
                      <button onClick={() => handleApproveSingle(draft.id)} className="p-1 text-gray-500 hover:text-green-400" title="Approve">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {draft.status !== 'sent' && (
                      <button
                        onClick={() => handleTestSend(draft.id)}
                        disabled={testSendingId === draft.id}
                        className="p-1 text-gray-500 hover:text-blue-400"
                        title="Send test to your email"
                      >
                        {testSendingId === draft.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : testSentId === draft.id ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <FlaskConical className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    {canReschedule && (
                      <button
                        onClick={() => {
                          setReschedulingId(isRescheduling ? null : draft.id);
                          if (scheduledTime) {
                            setRescheduleDate(toLocalDateTimeString(new Date(scheduledTime)));
                          }
                        }}
                        className="p-1 text-gray-500 hover:text-yellow-400"
                        title="Reschedule"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {draft.sent_at && (
                      <span className="text-[10px] text-gray-500 flex items-center gap-1">
                        <Send className="w-2.5 h-2.5" />
                        Sent {new Date(draft.sent_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content (collapsible) */}
                {!isCollapsed && (
                  <div className="mt-2">
                    {isEditing ? (
                      <DraftEditor
                        draftId={draft.id}
                        subject={draft.subject || ''}
                        body={draft.body_plain || ''}
                        onSave={async (id, subject, body) => {
                          await onSaveDraft(id, subject, body);
                          setEditingId(null);
                        }}
                        onRegenerate={onRegenerateDraft}
                        onClose={() => setEditingId(null)}
                      />
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-200 mb-1">{draft.subject || 'No subject'}</p>
                        <p className="text-xs text-gray-400 whitespace-pre-line line-clamp-4">
                          {draft.body_plain || 'No content'}
                        </p>
                      </>
                    )}

                    {/* Per-touch schedule picker for draft-status touches */}
                    {isDraft && !isEditing && (
                      <div className="mt-2 flex items-center gap-2">
                        <Calendar className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <span className="text-[10px] text-gray-400">Send:</span>
                        <input
                          type="datetime-local"
                          value={touchSchedules[draft.id] || ''}
                          onChange={(e) => handleTouchScheduleChange(draft.id, e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                        {savingScheduleId === draft.id && (
                          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                        )}
                        {touchSchedules[draft.id] && savingScheduleId !== draft.id && (
                          <span className="text-[10px] text-gray-600">
                            {new Date(touchSchedules[draft.id]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Reschedule UI for approved drafts */}
                    {isRescheduling && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="datetime-local"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => handleReschedule(draft.id)}
                          disabled={rescheduleSaving || !rescheduleDate}
                          className="flex items-center gap-1 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-xs px-2 py-1 rounded"
                        >
                          {rescheduleSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
                          Update
                        </button>
                        <button onClick={() => setReschedulingId(null)} className="text-xs text-gray-400 hover:text-white">
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Timing display for approved/sent */}
                    {!isDraft && scheduledTime && !isRescheduling && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-500">
                        <Clock className="w-3 h-3" />
                        {draft.status === 'sent' ? 'Sent' : 'Scheduled'}:{' '}
                        {new Date(scheduledTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' at '}
                        {new Date(scheduledTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

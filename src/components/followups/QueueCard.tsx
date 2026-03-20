'use client';

import { useState } from 'react';
import { Check, Clock, Edit3, X, Loader2, Calendar, Send, ChevronDown, ChevronUp, Mail, MailCheck, CalendarPlus, RefreshCw, Eye } from 'lucide-react';
import DraftEditor from '@/components/followups/DraftEditor';
import TestSendButton from '@/components/ui/TestSendButton';

export interface QueueItem {
  id: number;
  deal_id: string;
  touch_number: number;
  subject: string | null;
  body_plain: string | null;
  status: string;
  suggested_send_time: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  approved_at: string | null;
  mike_edited: boolean;
  contact_name: string | null;
  contact_email: string | null;
  business_name: string | null;
  pipeline_stage: string | null;
  fathom_summary: string | null;
  next_touch_due: string | null;
  demo_date: string | null;
  total_touches: number;
  sent_touches: number;
}

interface QueueCardProps {
  item: QueueItem;
  onSave: (id: number, subject: string, body: string) => Promise<void>;
  onApprove: (ids: number[], scheduleMap?: Record<number, string>) => Promise<void>;
  onReschedule: (id: number, scheduledAt: string) => Promise<void>;
  onRegenerate: (id: number) => Promise<void>;
  onViewDeal: (dealId: string) => void;
  onBookCall: (dealId: string) => void;
}

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  draft: { color: 'border-gray-600 text-gray-400', bg: 'bg-gray-600', label: 'Draft' },
  approved: { color: 'border-yellow-600 text-yellow-400', bg: 'bg-yellow-500', label: 'Scheduled' },
  sent: { color: 'border-green-600 text-green-400', bg: 'bg-green-500', label: 'Sent' },
  rejected: { color: 'border-red-600 text-red-400', bg: 'bg-red-500', label: 'Rejected' },
};

function toLocalDateTimeString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

export default function QueueCard({ item, onSave, onApprove, onReschedule, onRegenerate, onViewDeal, onBookCall }: QueueCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(
    item.scheduled_at || item.suggested_send_time
      ? toLocalDateTimeString(new Date(item.scheduled_at || item.suggested_send_time!))
      : ''
  );
  const [savingSchedule, setSavingSchedule] = useState(false);

  const config = statusConfig[item.status] || statusConfig.draft;
  const sendTime = item.scheduled_at || item.suggested_send_time;
  const isDraft = item.status === 'draft';
  const canEdit = item.status !== 'sent';

  const handleApprove = async () => {
    setApproving(true);
    try {
      const scheduleMap: Record<number, string> = {};
      if (scheduleDate) {
        scheduleMap[item.id] = new Date(scheduleDate).toISOString();
      }
      await onApprove([item.id], Object.keys(scheduleMap).length > 0 ? scheduleMap : undefined);
    } finally {
      setApproving(false);
    }
  };

  const handleScheduleChange = async (value: string) => {
    setScheduleDate(value);
    if (!value) return;
    setSavingSchedule(true);
    try {
      await onReschedule(item.id, new Date(value).toISOString());
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleTestSend = async (email: string) => {
    const res = await fetch('/api/followups/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id: item.id, recipient_email: email }),
    });
    if (!res.ok) throw new Error('Test send failed');
  };

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden transition-all ${
      expanded ? 'ring-1 ring-gray-700' : 'hover:border-gray-700'
    }`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Status indicator */}
        <div className={`w-2 h-8 rounded-full flex-shrink-0 ${config.bg}`} />

        {/* Contact / Business */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {item.business_name || 'Unknown Business'}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${config.color}`}>
              T{item.touch_number} · {config.label}
            </span>
            <span className="text-[10px] text-gray-600">
              {item.sent_touches}/{item.total_touches} sent
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400 truncate">{item.contact_name || 'No contact'}</span>
            {item.subject && (
              <span className="text-xs text-gray-500 truncate max-w-[300px]">
                — {item.subject}
              </span>
            )}
          </div>
        </div>

        {/* Send time */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isDraft ? (
            <div className="flex items-center gap-1">
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => handleScheduleChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 w-[175px]"
              />
              {savingSchedule && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
            </div>
          ) : sendTime ? (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(sendTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' '}
              {new Date(sendTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {isDraft && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex items-center gap-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
              title="Approve & schedule"
            >
              {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Approve
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => { setEditing(!editing); setExpanded(true); }}
              className="p-1.5 text-gray-500 hover:text-white transition-colors"
              title="Edit"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
          {item.status !== 'sent' && (
            <TestSendButton onSend={handleTestSend} size="sm" />
          )}
          <button
            onClick={() => onBookCall(item.deal_id)}
            className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors"
            title="Book follow-up call"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewDeal(item.deal_id)}
            className="p-1.5 text-gray-500 hover:text-white transition-colors"
            title="View deal"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-gray-400 hover:text-white transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800 bg-gray-800/20">
          {editing ? (
            <div className="pt-3">
              <DraftEditor
                draftId={item.id}
                subject={item.subject || ''}
                body={item.body_plain || ''}
                onSave={async (id, subject, body) => {
                  await onSave(id, subject, body);
                  setEditing(false);
                }}
                onRegenerate={onRegenerate ? (id) => onRegenerate(id) : undefined}
                onClose={() => setEditing(false)}
              />
            </div>
          ) : (
            <div className="pt-3 space-y-3">
              {/* Email preview */}
              <div>
                <p className="text-sm font-medium text-gray-200 mb-1">{item.subject || 'No subject'}</p>
                <p className="text-xs text-gray-400 whitespace-pre-line line-clamp-6">
                  {item.body_plain || 'No content'}
                </p>
              </div>

              {/* Deal context */}
              <div className="flex items-center gap-4 pt-2 border-t border-gray-800/50">
                {item.contact_email && (
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {item.contact_email}
                  </span>
                )}
                {item.demo_date && (
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Demo: {new Date(item.demo_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {item.pipeline_stage && (
                  <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full">
                    {item.pipeline_stage.replace(/_/g, ' ')}
                  </span>
                )}
              </div>

              {/* Fathom summary snippet */}
              {item.fathom_summary && (
                <div>
                  <span className="text-[10px] text-gray-500 uppercase">Demo Summary</span>
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{item.fathom_summary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

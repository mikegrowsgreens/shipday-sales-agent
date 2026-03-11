'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone, MessageSquare, Linkedin, CheckCircle2, SkipForward,
  Loader2, Send,
} from 'lucide-react';

interface TaskData {
  task_id: number;
  contact_id: number;
  task_type: string;
  contact_phone: string | null;
  contact_email: string;
  contact_name: string;
  linkedin_url: string | null;
}

export default function TaskActions({ task }: { task: TaskData }) {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [showSms, setShowSms] = useState(false);
  const [smsBody, setSmsBody] = useState('');
  const [outcome, setOutcome] = useState('');
  const [showOutcome, setShowOutcome] = useState(false);

  const handleCall = async () => {
    if (!task.contact_phone) return;
    setLoading('call');
    try {
      const res = await fetch('/api/twilio/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: task.contact_id, task_id: task.task_id }),
      });
      const data = await res.json();
      if (data.success) {
        setShowOutcome(true);
      } else {
        alert(`Call failed: ${data.error || 'Unknown error'}`);
      }
    } catch (e) {
      alert('Call failed - check Twilio config');
    } finally {
      setLoading('');
    }
  };

  const handleSms = async () => {
    if (!smsBody.trim()) return;
    setLoading('sms');
    try {
      const res = await fetch('/api/twilio/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: task.contact_id, body: smsBody, task_id: task.task_id }),
      });
      const data = await res.json();
      if (data.success) {
        setShowSms(false);
        setSmsBody('');
        handleComplete('SMS sent');
      } else {
        alert(`SMS failed: ${data.error}`);
      }
    } catch {
      alert('SMS failed');
    } finally {
      setLoading('');
    }
  };

  const handleLinkedIn = async () => {
    setLoading('linkedin');
    try {
      const res = await fetch('/api/linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: task.contact_id,
          action: task.task_type === 'linkedin_connect' ? 'connect' :
                  task.task_type === 'linkedin_view' ? 'view' : 'message',
          task_id: task.task_id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        handleComplete('LinkedIn action triggered');
      } else {
        alert(`LinkedIn failed: ${data.error}`);
      }
    } catch {
      alert('LinkedIn trigger failed');
    } finally {
      setLoading('');
    }
  };

  const handleComplete = async (notes?: string) => {
    setLoading('complete');
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.task_id,
          status: 'completed',
          outcome: notes || outcome || 'completed',
        }),
      });
      router.refresh();
    } catch {
      alert('Failed to update task');
    } finally {
      setLoading('');
      setShowOutcome(false);
    }
  };

  const handleSkip = async () => {
    setLoading('skip');
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.task_id,
          status: 'skipped',
          outcome: 'skipped',
        }),
      });
      router.refresh();
    } catch {
      alert('Failed to skip task');
    } finally {
      setLoading('');
    }
  };

  if (showOutcome) {
    return (
      <div className="flex flex-col gap-2 shrink-0">
        <input
          type="text"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Call outcome..."
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-40 focus:outline-none focus:border-blue-500"
          autoFocus
        />
        <button
          onClick={() => handleComplete()}
          disabled={loading === 'complete'}
          className="flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded transition-colors"
        >
          {loading === 'complete' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Log & Complete
        </button>
      </div>
    );
  }

  if (showSms) {
    return (
      <div className="flex flex-col gap-2 shrink-0">
        <textarea
          value={smsBody}
          onChange={(e) => setSmsBody(e.target.value)}
          placeholder="SMS message..."
          rows={2}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-48 focus:outline-none focus:border-blue-500 resize-none"
          autoFocus
        />
        <div className="flex gap-1">
          <button
            onClick={handleSms}
            disabled={loading === 'sms' || !smsBody.trim()}
            className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs px-2 py-1 rounded transition-colors"
          >
            {loading === 'sms' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Send
          </button>
          <button onClick={() => setShowSms(false)} className="text-xs text-gray-500 hover:text-gray-300 px-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Channel-specific action */}
      {task.task_type === 'call' && task.contact_phone && (
        <button
          onClick={handleCall}
          disabled={loading === 'call'}
          className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          title="Click to call via Twilio"
        >
          {loading === 'call' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
          Call
        </button>
      )}

      {task.task_type === 'sms' && task.contact_phone && (
        <button
          onClick={() => setShowSms(true)}
          className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          title="Send SMS"
        >
          <MessageSquare className="w-3 h-3" /> SMS
        </button>
      )}

      {task.task_type.startsWith('linkedin') && (
        <button
          onClick={handleLinkedIn}
          disabled={loading === 'linkedin'}
          className="flex items-center gap-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          title="Trigger LinkedIn automation"
        >
          {loading === 'linkedin' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Linkedin className="w-3 h-3" />}
          Send
        </button>
      )}

      {/* Complete & Skip */}
      <button
        onClick={() => handleComplete()}
        disabled={!!loading}
        className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-green-400 text-xs px-2 py-1.5 rounded-lg transition-colors"
        title="Mark complete"
      >
        {loading === 'complete' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
      </button>
      <button
        onClick={handleSkip}
        disabled={!!loading}
        className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-400 text-xs px-2 py-1.5 rounded-lg transition-colors"
        title="Skip"
      >
        {loading === 'skip' ? <Loader2 className="w-3 h-3 animate-spin" /> : <SkipForward className="w-3 h-3" />}
      </button>
    </div>
  );
}

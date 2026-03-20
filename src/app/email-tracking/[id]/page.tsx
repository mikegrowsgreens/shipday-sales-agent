'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  Eye,
  MousePointerClick,
  MessageSquare,
  Clock,
  Send,
  User,
  Circle,
} from 'lucide-react';
import { EmailTrackingNav } from '@/components/email-tracking/EmailTrackingNav';
import { ActivityTimeline, type TimelineEvent } from '@/components/email-tracking/ActivityTimeline';

interface EmailDetail {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  open_count: number;
  click_count: number;
  replied: boolean;
  reply_at: string | null;
  reply_classification: string | null;
  first_open_at: string | null;
  last_open_at: string | null;
  sent_at: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_business: string | null;
  contact_email: string | null;
}

interface DetailResponse {
  email: EmailDetail;
  events: TimelineEvent[];
  totalEvents: number;
}

export default function EmailDetailPage() {
  const router = useRouter();
  const params = useParams();
  const emailId = params.id as string;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/email-tracking/${emailId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (res.status === 404) {
        setError('Email not found');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch');

      const json: DetailResponse = await res.json();
      setData(json);
    } catch {
      setError('Failed to load email details');
    } finally {
      setLoading(false);
    }
  }, [emailId, router]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-center py-24">
          <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
          <span className="ml-3 text-gray-400 text-sm">Loading email details...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <button
          onClick={() => router.push('/email-tracking')}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to tracked emails
        </button>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
          <p className="text-red-400">{error || 'Something went wrong'}</p>
          <button
            onClick={fetchDetail}
            className="mt-3 text-sm text-red-400 underline hover:text-red-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { email, events, totalEvents } = data;
  const recipientName = getRecipientName(email);
  const status = getStatus(email);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push('/email-tracking')}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to tracked emails
      </button>

      <EmailTrackingNav />

      {/* Subject heading + Open in Gmail */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white truncate">
            {email.subject || '(no subject)'}
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <Circle className={`w-2.5 h-2.5 fill-current ${status.color}`} />
            <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
          </div>
        </div>
        {email.gmail_thread_id && (
          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${email.gmail_thread_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/15 rounded-lg transition-colors shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Gmail
          </a>
        )}
      </div>

      {/* Metadata card */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Recipient */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-700/50 rounded-lg">
              <User className="w-4 h-4 text-gray-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Recipient</p>
              <p className="text-sm font-medium text-white truncate">{recipientName}</p>
              <p className="text-xs text-gray-400 truncate">{email.to_email}</p>
              {email.contact_business && (
                <p className="text-xs text-gray-500 truncate mt-0.5">{email.contact_business}</p>
              )}
            </div>
          </div>

          {/* Sent Date */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-700/50 rounded-lg">
              <Send className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Sent</p>
              <p className="text-sm font-medium text-white">{formatFullDate(email.sent_at)}</p>
              <p className="text-xs text-gray-400">{formatTime(email.sent_at)}</p>
            </div>
          </div>

          {/* Activity Summary */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-700/50 rounded-lg">
              <Eye className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Activity</p>
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-green-400">
                  <Eye className="w-3.5 h-3.5" />
                  {email.open_count}
                </span>
                <span className="flex items-center gap-1 text-blue-400">
                  <MousePointerClick className="w-3.5 h-3.5" />
                  {email.click_count}
                </span>
                {email.replied && (
                  <span className="flex items-center gap-1 text-purple-400">
                    <MessageSquare className="w-3.5 h-3.5" />
                    1
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Timing */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gray-700/50 rounded-lg">
              <Clock className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Timing</p>
              {email.first_open_at ? (
                <>
                  <p className="text-sm text-white">
                    First open: {formatRelative(email.first_open_at)}
                  </p>
                  {email.last_open_at && email.last_open_at !== email.first_open_at && (
                    <p className="text-xs text-gray-400">
                      Last open: {formatRelative(email.last_open_at)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">Not opened yet</p>
              )}
            </div>
          </div>
        </div>

        {/* From email */}
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Mail className="w-3.5 h-3.5" />
            <span>From: {email.from_email}</span>
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Email Activity</h2>
          <span className="text-sm text-gray-500">
            {totalEvents} event{totalEvents !== 1 ? 's' : ''}
          </span>
        </div>

        <ActivityTimeline
          events={events}
          recipientEmail={email.to_email}
          recipientName={recipientName !== email.to_email ? recipientName : undefined}
        />
      </div>
    </div>
  );
}

function getRecipientName(email: EmailDetail): string {
  if (email.contact_first_name || email.contact_last_name) {
    return [email.contact_first_name, email.contact_last_name].filter(Boolean).join(' ');
  }
  return email.to_email;
}

function getStatus(email: EmailDetail): { label: string; color: string } {
  if (email.replied) return { label: 'Replied', color: 'text-purple-400' };
  if (email.click_count > 0) return { label: 'Clicked', color: 'text-blue-400' };
  if (email.open_count > 0) return { label: 'Opened', color: 'text-green-400' };
  return { label: 'Sent', color: 'text-gray-400' };
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

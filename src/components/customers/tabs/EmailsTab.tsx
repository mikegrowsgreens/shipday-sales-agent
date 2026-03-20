'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, Paperclip, RefreshCw, Loader2, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { CustomerEmail } from '@/lib/types';

interface ThreadSummary {
  thread_id: string;
  subject: string;
  message_count: number;
  latest_date: string;
  earliest_date: string;
  participants: string[];
}

interface EmailsTabProps {
  customerId: number;
  initialEmails: CustomerEmail[];
  initialEmailCount: number;
}

type ViewMode = 'threads' | 'all';

export function EmailsTab({ customerId, initialEmails, initialEmailCount }: EmailsTabProps) {
  const [emails, setEmails] = useState<CustomerEmail[]>(initialEmails);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [total, setTotal] = useState(initialEmailCount);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('threads');
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const [threadEmails, setThreadEmails] = useState<Record<string, CustomerEmail[]>>({});
  const [loadingThread, setLoadingThread] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/emails?limit=100`);
      const data = await res.json();
      setEmails(data.emails || []);
      setThreads(data.threads || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch emails:', err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await fetch('https://automation.mikegrowsgreens.com/webhook/customer-email-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId }),
        mode: 'no-cors',
      });
      // Wait a bit then refresh
      setTimeout(() => { fetchEmails(); setSyncing(false); }, 5000);
    } catch {
      setSyncing(false);
    }
  };

  const toggleThread = async (threadId: string) => {
    if (expandedThread === threadId) {
      setExpandedThread(null);
      return;
    }

    setExpandedThread(threadId);

    if (!threadEmails[threadId]) {
      setLoadingThread(threadId);
      try {
        const res = await fetch(`/api/customers/${customerId}/emails?thread_id=${threadId}`);
        const data = await res.json();
        setThreadEmails(prev => ({ ...prev, [threadId]: data.emails || [] }));
      } catch (err) {
        console.error('Failed to fetch thread:', err);
      } finally {
        setLoadingThread(null);
      }
    }
  };

  // Empty state
  if (!loading && total === 0) {
    return (
      <div className="text-center py-12">
        <Mail className="w-10 h-10 text-gray-700 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-300 mb-2">No emails yet</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
          Email history will appear here after Gmail sync is configured.
        </p>
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-600/30 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync Now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('threads')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'threads' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Thread View
          </button>
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'all' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            All Messages
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{total} emails</span>
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
        </div>
      ) : viewMode === 'threads' ? (
        /* Thread View */
        <div className="space-y-1">
          {threads.map(thread => (
            <div key={thread.thread_id}>
              <button
                onClick={() => toggleThread(thread.thread_id)}
                className="w-full flex items-start gap-3 px-4 py-3 rounded-lg hover:bg-gray-800/50 transition-colors text-left"
              >
                {/* Direction icon from latest message */}
                <div className="mt-0.5">
                  {expandedThread === thread.thread_id ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-200 truncate">{thread.subject || '(no subject)'}</p>
                    <span className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                      <MessageSquare className="w-3 h-3" />
                      {thread.message_count}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {thread.participants.join(', ')}
                  </p>
                </div>

                <span className="text-xs text-gray-600 whitespace-nowrap shrink-0">
                  {thread.latest_date ? formatDate(thread.latest_date) : ''}
                </span>
              </button>

              {/* Expanded thread messages */}
              {expandedThread === thread.thread_id && (
                <div className="ml-7 pl-4 border-l border-gray-800 space-y-1 mb-2">
                  {loadingThread === thread.thread_id ? (
                    <div className="py-3 flex justify-center">
                      <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
                    </div>
                  ) : (
                    (threadEmails[thread.thread_id] || []).map(email => (
                      <EmailRow key={email.id} email={email} />
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* All Messages View */
        <div className="space-y-1">
          {emails.map(email => (
            <EmailRow key={email.id} email={email} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmailRow({ email }: { email: CustomerEmail }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="px-4 py-2.5 rounded-lg hover:bg-gray-800/50 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
          email.direction === 'outbound' ? 'bg-blue-600/20' : 'bg-green-600/20'
        }`}>
          <span className={`text-xs ${email.direction === 'outbound' ? 'text-blue-400' : 'text-green-400'}`}>
            {email.direction === 'outbound' ? '↗' : '↙'}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-200 truncate">{email.subject || '(no subject)'}</p>
            {email.has_attachment && <Paperclip className="w-3 h-3 text-gray-600 shrink-0" />}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {email.direction === 'outbound' ? `To: ${email.to_email}` : `From: ${email.from_email}`}
          </p>
          {!expanded && email.snippet && (
            <p className="text-xs text-gray-600 mt-1 line-clamp-1">{email.snippet}</p>
          )}
          {expanded && (
            <div className="mt-2 text-xs text-gray-400 whitespace-pre-wrap bg-gray-800/50 rounded p-3">
              {email.body_preview || email.snippet || 'No content available'}
            </div>
          )}
        </div>

        <span className="text-xs text-gray-600 whitespace-nowrap shrink-0">
          {email.date ? formatDate(email.date) : ''}
        </span>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

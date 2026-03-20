'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mail,
  Eye,
  MousePointerClick,
  MessageSquare,
  Download,
  Circle,
} from 'lucide-react';
import { EmailTrackingNav } from '@/components/email-tracking/EmailTrackingNav';
import { ActivityBadge } from '@/components/email-tracking/ActivityBadge';

interface TrackedEmail {
  id: string;
  to_email: string;
  from_email: string;
  subject: string;
  gmail_thread_id: string | null;
  open_count: number;
  click_count: number;
  replied: boolean;
  reply_at: string | null;
  first_open_at: string | null;
  last_open_at: string | null;
  sent_at: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_business: string | null;
  last_event_at: string | null;
  last_event_type: string | null;
}

interface ApiResponse {
  emails: TrackedEmail[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SortOption = 'last_sent' | 'last_opened' | 'most_opens' | 'most_clicks';

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'last_sent', label: 'Last sent' },
  { value: 'last_opened', label: 'Last opened' },
  { value: 'most_opens', label: 'Most opens' },
  { value: 'most_clicks', label: 'Most clicks' },
];

export default function EmailTrackingPage() {
  const router = useRouter();
  const [emails, setEmails] = useState<TrackedEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortOption>('last_sent');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sort,
        page: String(page),
        limit: '50',
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/email-tracking?${params}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch');

      const data: ApiResponse = await res.json();
      setEmails(data.emails);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setError('Failed to load tracked emails');
    } finally {
      setLoading(false);
    }
  }, [sort, page, search, router]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleExportCsv = async () => {
    const params = new URLSearchParams({ sort, limit: '10000' });
    if (search) params.set('search', search);
    const res = await fetch(`/api/email-tracking?${params}`);
    if (!res.ok) return;
    const data: ApiResponse = await res.json();

    const header = 'Recipient,Email,Subject,Opens,Clicks,Replied,Sent At,Last Open\n';
    const rows = data.emails.map((e) => {
      const name = getRecipientName(e);
      return [
        `"${name}"`,
        `"${e.to_email}"`,
        `"${(e.subject || '').replace(/"/g, '""')}"`,
        e.open_count,
        e.click_count,
        e.replied ? 'Yes' : 'No',
        e.sent_at ? new Date(e.sent_at).toISOString() : '',
        e.last_open_at ? new Date(e.last_open_at).toISOString() : '',
      ].join(',');
    });

    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tracked-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Email Tracking</h1>
        <p className="text-sm text-gray-400 mt-1">
          Monitor opens, clicks, and replies for your tracked emails
        </p>
      </div>

      <EmailTrackingNav />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by recipient or subject..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 hover:border-gray-600 transition-colors"
            >
              {sortOptions.find((o) => o.value === sort)?.label}
              <ChevronDown className="w-4 h-4" />
            </button>
            {sortOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 py-1">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSort(option.value);
                      setPage(1);
                      setSortOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      sort === option.value
                        ? 'text-blue-400 bg-blue-600/10'
                        : 'text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Export */}
        <button
          onClick={handleExportCsv}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500 mb-3">
        {loading ? 'Loading...' : `${total} tracked email${total !== 1 ? 's' : ''}`}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={fetchEmails}
            className="mt-2 text-sm text-red-400 underline hover:text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Recipient
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subject
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Activity
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Activity
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {loading && emails.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
                    Loading tracked emails...
                  </div>
                </td>
              </tr>
            ) : emails.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  <Mail className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                  <p className="text-sm">No tracked emails found</p>
                  {search && (
                    <p className="text-xs mt-1">Try adjusting your search terms</p>
                  )}
                </td>
              </tr>
            ) : (
              emails.map((email) => (
                <EmailRow key={email.id} email={email} onClick={() => router.push(`/email-tracking/${email.id}`)} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EmailRow({ email, onClick }: { email: TrackedEmail; onClick: () => void }) {
  const name = getRecipientName(email);
  const status = getStatus(email);

  return (
    <tr
      onClick={onClick}
      className="hover:bg-gray-800/50 cursor-pointer transition-colors"
    >
      {/* Recipient */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-300 shrink-0">
            {getInitials(email)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{name}</p>
            {email.contact_business && (
              <p className="text-xs text-gray-500 truncate">{email.contact_business}</p>
            )}
          </div>
        </div>
      </td>

      {/* Subject */}
      <td className="px-4 py-3.5">
        <p className="text-sm text-white truncate max-w-[300px]">
          {email.subject || '(no subject)'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Sent {formatDate(email.sent_at)}
        </p>
      </td>

      {/* Activity */}
      <td className="px-4 py-3.5">
        <ActivityBadge
          openCount={email.open_count}
          clickCount={email.click_count}
          replied={email.replied}
          lastOpenAt={email.last_open_at}
          replyAt={email.reply_at}
        />
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Circle className={`w-2.5 h-2.5 fill-current ${status.color}`} />
          <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
        </div>
      </td>

      {/* Last Activity */}
      <td className="px-4 py-3.5">
        {email.last_event_at ? (
          <div>
            <div className="flex items-center gap-1.5 text-sm text-gray-300">
              <EventIcon type={email.last_event_type} />
              <span className="capitalize">{email.last_event_type}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatRelative(email.last_event_at)}
            </p>
          </div>
        ) : (
          <span className="text-xs text-gray-600">--</span>
        )}
      </td>
    </tr>
  );
}

function EventIcon({ type }: { type: string | null }) {
  switch (type) {
    case 'open':
      return <Eye className="w-3.5 h-3.5 text-green-400" />;
    case 'click':
      return <MousePointerClick className="w-3.5 h-3.5 text-blue-400" />;
    case 'reply':
      return <MessageSquare className="w-3.5 h-3.5 text-purple-400" />;
    default:
      return <Mail className="w-3.5 h-3.5 text-gray-500" />;
  }
}

function getRecipientName(email: TrackedEmail): string {
  if (email.contact_first_name || email.contact_last_name) {
    return [email.contact_first_name, email.contact_last_name].filter(Boolean).join(' ');
  }
  return email.to_email;
}

function getInitials(email: TrackedEmail): string {
  if (email.contact_first_name && email.contact_last_name) {
    return `${email.contact_first_name[0]}${email.contact_last_name[0]}`.toUpperCase();
  }
  if (email.contact_first_name) return email.contact_first_name[0].toUpperCase();
  return email.to_email[0].toUpperCase();
}

function getStatus(email: TrackedEmail): { label: string; color: string } {
  if (email.replied) return { label: 'Replied', color: 'text-purple-400' };
  if (email.click_count > 0) return { label: 'Clicked', color: 'text-blue-400' };
  if (email.open_count > 0) return { label: 'Opened', color: 'text-green-400' };
  return { label: 'Sent', color: 'text-gray-400' };
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

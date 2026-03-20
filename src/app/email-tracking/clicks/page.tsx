'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MousePointerClick,
  Users,
  Link2,
  TrendingUp,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { EmailTrackingNav } from '@/components/email-tracking/EmailTrackingNav';
import KpiGrid, { type KpiItem } from '@/components/ui/KpiGrid';
import DateRangeSelector from '@/components/ui/DateRangeSelector';

interface ClickRow {
  to_email: string;
  url: string;
  send_id: string | null;
  subject: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_business: string | null;
  total_clicks: number;
  first_clicked_at: string;
  last_clicked_at: string;
}

interface ClickStats {
  totalClicks: number;
  uniqueRecipients: number;
  uniqueUrls: number;
  clickThroughRate: number;
  mostClickedUrl: string | null;
}

interface ApiResponse {
  clicks: ClickRow[];
  stats: ClickStats;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SortOption = 'last_clicked' | 'total_clicks' | 'recipient';

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'last_clicked', label: 'Last clicked' },
  { value: 'total_clicks', label: 'Most clicks' },
  { value: 'recipient', label: 'Recipient' },
];

export default function ClickReportPage() {
  const router = useRouter();
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [stats, setStats] = useState<ClickStats>({
    totalClicks: 0,
    uniqueRecipients: 0,
    uniqueUrls: 0,
    clickThroughRate: 0,
    mostClickedUrl: null,
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortOption>('last_clicked');
  const [range, setRange] = useState('30d');
  const [customFrom, setCustomFrom] = useState<string | undefined>();
  const [customTo, setCustomTo] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const fetchClicks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sort,
        range,
        page: String(page),
        limit: '50',
      });
      if (customFrom) params.set('from', customFrom);
      if (customTo) params.set('to', customTo);

      const res = await fetch(`/api/email-tracking/clicks?${params}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch');

      const data: ApiResponse = await res.json();
      setClicks(data.clicks);
      setStats(data.stats);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setError('Failed to load click report');
    } finally {
      setLoading(false);
    }
  }, [sort, range, customFrom, customTo, page, router]);

  useEffect(() => {
    fetchClicks();
  }, [fetchClicks]);

  const handleDateChange = (newRange: string, from?: string, to?: string) => {
    setRange(newRange);
    setCustomFrom(from);
    setCustomTo(to);
    setPage(1);
  };

  const handleExportCsv = async () => {
    const params = new URLSearchParams({ sort, range, limit: '10000' });
    if (customFrom) params.set('from', customFrom);
    if (customTo) params.set('to', customTo);
    const res = await fetch(`/api/email-tracking/clicks?${params}`);
    if (!res.ok) return;
    const data: ApiResponse = await res.json();

    const header = 'Recipient,Email,URL,Email Subject,Total Clicks,First Clicked,Last Clicked\n';
    const rows = data.clicks.map((c) => {
      const name = getRecipientName(c);
      return [
        `"${name}"`,
        `"${c.to_email}"`,
        `"${(c.url || '').replace(/"/g, '""')}"`,
        `"${(c.subject || '').replace(/"/g, '""')}"`,
        c.total_clicks,
        c.first_clicked_at ? new Date(c.first_clicked_at).toISOString() : '',
        c.last_clicked_at ? new Date(c.last_clicked_at).toISOString() : '',
      ].join(',');
    });

    const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `click-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpiItems: KpiItem[] = [
    { label: 'Total Clicks', value: stats.totalClicks, icon: MousePointerClick, color: 'text-blue-400' },
    { label: 'Unique Recipients', value: stats.uniqueRecipients, icon: Users, color: 'text-green-400' },
    { label: 'Unique URLs', value: stats.uniqueUrls, icon: Link2, color: 'text-purple-400' },
    { label: 'Click-Through Rate', value: `${stats.clickThroughRate}%`, icon: TrendingUp, color: 'text-yellow-400' },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Email Tracking</h1>
        <p className="text-sm text-gray-400 mt-1">
          See which links your recipients are clicking
        </p>
      </div>

      <EmailTrackingNav />

      {/* KPI Cards */}
      <div className="mb-6">
        <KpiGrid items={kpiItems} />
      </div>

      {/* Most clicked URL */}
      {stats.mostClickedUrl && (
        <div className="mb-4 bg-gray-800 rounded-xl border border-gray-700 px-5 py-3 flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider shrink-0">
            Most clicked
          </span>
          <a
            href={stats.mostClickedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 truncate transition-colors"
          >
            {stats.mostClickedUrl}
          </a>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 flex-1">
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

          {/* Date range */}
          <DateRangeSelector value={range} onChange={handleDateChange} />
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
        {loading ? 'Loading...' : `${total} click record${total !== 1 ? 's' : ''}`}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={fetchClicks}
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
                URL Clicked
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email Subject
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Clicked
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Clicks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {loading && clicks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
                    Loading click data...
                  </div>
                </td>
              </tr>
            ) : clicks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  <MousePointerClick className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                  <p className="text-sm">No click data found</p>
                  <p className="text-xs mt-1">Try adjusting the date range</p>
                </td>
              </tr>
            ) : (
              clicks.map((click, idx) => (
                <ClickTableRow
                  key={`${click.to_email}-${click.url}-${click.send_id}-${idx}`}
                  click={click}
                  onNavigateToEmail={() => {
                    if (click.send_id) router.push(`/email-tracking/${click.send_id}`);
                  }}
                />
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

function ClickTableRow({
  click,
  onNavigateToEmail,
}: {
  click: ClickRow;
  onNavigateToEmail: () => void;
}) {
  const name = getRecipientName(click);

  return (
    <tr className="hover:bg-gray-800/50 transition-colors">
      {/* Recipient */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-300 shrink-0">
            {getInitials(click)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{name}</p>
            {click.contact_business && (
              <p className="text-xs text-gray-500 truncate">{click.contact_business}</p>
            )}
          </div>
        </div>
      </td>

      {/* URL */}
      <td className="px-4 py-3.5 max-w-[280px]">
        <div className="flex items-center gap-1.5 group">
          <a
            href={click.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 truncate transition-colors"
            title={click.url}
            onClick={(e) => e.stopPropagation()}
          >
            {truncateUrl(click.url, 50)}
          </a>
          <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" />
        </div>
      </td>

      {/* Email Subject */}
      <td className="px-4 py-3.5">
        {click.subject ? (
          <button
            onClick={onNavigateToEmail}
            className="text-sm text-gray-300 hover:text-white truncate max-w-[220px] block text-left transition-colors"
            title={click.subject}
          >
            {click.subject}
          </button>
        ) : (
          <span className="text-sm text-gray-600">--</span>
        )}
      </td>

      {/* Last Clicked */}
      <td className="px-4 py-3.5">
        <div>
          <p className="text-sm text-gray-300">{formatRelative(click.last_clicked_at)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{formatDate(click.last_clicked_at)}</p>
        </div>
      </td>

      {/* Total Clicks */}
      <td className="px-4 py-3.5 text-right">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium bg-blue-500/10 text-blue-400">
          <MousePointerClick className="w-3.5 h-3.5" />
          {click.total_clicks}
        </span>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */

function getRecipientName(click: ClickRow): string {
  if (click.contact_first_name || click.contact_last_name) {
    return [click.contact_first_name, click.contact_last_name].filter(Boolean).join(' ');
  }
  return click.to_email;
}

function getInitials(click: ClickRow): string {
  if (click.contact_first_name && click.contact_last_name) {
    return `${click.contact_first_name[0]}${click.contact_last_name[0]}`.toUpperCase();
  }
  if (click.contact_first_name) return click.contact_first_name[0].toUpperCase();
  return click.to_email[0].toUpperCase();
}

function truncateUrl(url: string, maxLen: number): string {
  try {
    const parsed = new URL(url);
    const display = parsed.hostname + parsed.pathname;
    return display.length > maxLen ? display.slice(0, maxLen) + '...' : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + '...' : url;
  }
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Activity, Eye, Link2, Reply, Loader2, RefreshCw, ChevronRight,
  Building2, AlertCircle,
} from 'lucide-react';
import { EmailTrackingNav } from '@/components/email-tracking/EmailTrackingNav';

interface ActivityEvent {
  event_id: number;
  event_type: string;
  event_at: string;
  to_email: string;
  from_email: string;
  metadata: Record<string, unknown> | null;
  send_id: string | null;
  subject: string | null;
  gmail_thread_id: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_business: string | null;
}

interface ActivityData {
  events: ActivityEvent[];
  typeCounts: Record<string, number>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const eventConfig: Record<string, { icon: typeof Eye; color: string; bgColor: string; label: string }> = {
  open: { icon: Eye, color: 'text-green-400', bgColor: 'bg-green-500/20', label: 'opened your email' },
  click: { icon: Link2, color: 'text-blue-400', bgColor: 'bg-blue-500/20', label: 'clicked a link in your email' },
  reply: { icon: Reply, color: 'text-purple-400', bgColor: 'bg-purple-500/20', label: 'replied to your email' },
};

const filterTabs = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Opens' },
  { key: 'click', label: 'Clicks' },
  { key: 'reply', label: 'Replies' },
] as const;

export default function ActivityFeedPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [allEvents, setAllEvents] = useState<ActivityEvent[]>([]);

  const fetchActivity = useCallback(async (pageNum: number, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        type: filter,
        page: pageNum.toString(),
        limit: '30',
      });
      const res = await fetch(`/api/email-tracking/activity?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const json: ActivityData = await res.json();

      if (append) {
        setAllEvents(prev => [...prev, ...json.events]);
      } else {
        setAllEvents(json.events);
      }
      setData(json);
      setPage(pageNum);
    } catch {
      setError('Failed to load activity feed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter]);

  // Initial fetch + refetch on filter change
  useEffect(() => {
    setPage(1);
    setAllEvents([]);
    fetchActivity(1);
  }, [fetchActivity]);

  // Auto-refresh every 30s (only page 1)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchActivity(1);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  const handleLoadMore = () => {
    fetchActivity(page + 1, true);
  };

  const totalAll = data?.typeCounts
    ? Object.values(data.typeCounts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-400" />
            Activity Feed
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Real-time email tracking events · Auto-refreshes every 30s
          </p>
        </div>
        <button
          onClick={() => fetchActivity(1)}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <EmailTrackingNav />

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5">
        {filterTabs.map((tab) => {
          const count = tab.key === 'all'
            ? totalAll
            : (data?.typeCounts[tab.key] || 0);
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full text-[10px]">
                  {count > 999 ? `${Math.floor(count / 1000)}k` : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading && allEvents.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">{error}</p>
          <button
            onClick={() => fetchActivity(1)}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300"
          >
            Try again
          </button>
        </div>
      ) : allEvents.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No activity yet</p>
          <p className="text-xs text-gray-600 mt-1">
            {filter === 'all'
              ? 'Email tracking events will appear here as recipients interact with your emails.'
              : `No ${filter} events found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {allEvents.map((event) => (
            <ActivityFeedItem key={event.event_id} event={event} />
          ))}

          {/* Load More */}
          {data && page < data.totalPages && (
            <div className="pt-4 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
              <p className="text-xs text-gray-600 mt-1">
                Showing {allEvents.length} of {data.total} events
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActivityFeedItem({ event }: { event: ActivityEvent }) {
  const config = eventConfig[event.event_type] || eventConfig.open;
  const Icon = config.icon;

  const recipientName = event.contact_first_name
    ? `${event.contact_first_name}${event.contact_last_name ? ' ' + event.contact_last_name : ''}`
    : event.to_email;

  const clickedUrl = event.event_type === 'click' && event.metadata?.url
    ? String(event.metadata.url)
    : null;

  return (
    <Link
      href={event.send_id ? `/email-tracking/${event.send_id}` : '#'}
      className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 hover:bg-gray-800/50 transition-colors group cursor-pointer"
    >
      {/* Event Icon */}
      <div className={`shrink-0 w-9 h-9 rounded-full ${config.bgColor} flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-gray-200 truncate">
            {recipientName}
          </span>
          {event.contact_business && (
            <span className="text-xs text-gray-500 flex items-center gap-0.5 shrink-0">
              <Building2 className="w-3 h-3" />
              {event.contact_business}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          <span className={config.color}>{config.label}</span>
          {event.subject && (
            <>
              {' '}
              <span className="text-gray-600">&middot;</span>{' '}
              <span className="text-gray-500 truncate">{event.subject}</span>
            </>
          )}
        </p>
        {clickedUrl && (
          <p className="text-xs text-blue-400/70 truncate mt-0.5">
            {clickedUrl}
          </p>
        )}
      </div>

      {/* Timestamp + Arrow */}
      <div className="shrink-0 flex items-center gap-2">
        <span className="text-xs text-gray-500">
          {formatTimeAgo(event.event_at)}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

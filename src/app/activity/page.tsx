'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Activity, Mail, Phone, Linkedin, MessageSquare, Calendar,
  Send, MousePointerClick, Eye, PhoneCall, GitBranch,
  Loader2, Building2, RefreshCw,
} from 'lucide-react';
import { ActivityFeedItem, Channel } from '@/lib/types';

const channelIcons: Record<string, { icon: typeof Mail; color: string }> = {
  email: { icon: Mail, color: 'text-blue-400' },
  phone: { icon: Phone, color: 'text-green-400' },
  linkedin: { icon: Linkedin, color: 'text-sky-400' },
  sms: { icon: MessageSquare, color: 'text-purple-400' },
  calendly: { icon: Calendar, color: 'text-orange-400' },
  manual: { icon: Eye, color: 'text-gray-400' },
  fathom: { icon: PhoneCall, color: 'text-pink-400' },
};

const eventMessages: Record<string, (name: string) => string> = {
  sent: (n) => `Email sent to ${n}`,
  opened: (n) => `${n} opened an email`,
  replied: (n) => `${n} replied`,
  clicked: (n) => `${n} clicked a link`,
  call_completed: (n) => `Call completed with ${n}`,
  call_missed: (n) => `Missed call from ${n}`,
  booked: (n) => `${n} booked a meeting`,
  form_submitted: (n) => `${n} submitted a form`,
  connected: (n) => `${n} connected on LinkedIn`,
  stage_change: (n) => `${n} stage updated`,
  enriched: (n) => `${n} enriched`,
  contact_merged: (n) => `${n} contact merged`,
  sms_sent: (n) => `SMS sent to ${n}`,
  sms_received: (n) => `${n} sent SMS`,
};

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [recentCounts, setRecentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const latestAt = useRef<string | null>(null);
  const [newCount, setNewCount] = useState(0);

  const fetchActivity = useCallback(async (polling = false) => {
    if (!polling) setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (channel !== 'all') params.set('channel', channel);
      if (polling && latestAt.current) params.set('after', latestAt.current);

      const res = await fetch(`/api/activity?${params}`);
      const data = await res.json();

      if (polling && data.items?.length) {
        setItems(prev => [...data.items, ...prev].slice(0, 200));
        setNewCount(prev => prev + data.items.length);
      } else if (!polling) {
        setItems(data.items || []);
      }

      setRecentCounts(data.recent_counts || {});
      if (data.latest_at) latestAt.current = data.latest_at;
    } catch { /* silent */ }
    finally { if (!polling) setLoading(false); }
  }, [channel]);

  useEffect(() => {
    setNewCount(0);
    fetchActivity();
  }, [fetchActivity]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchActivity(true), 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchActivity]);

  const totalRecent = Object.values(recentCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-green-400" />
            Activity Feed
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalRecent} events in the last hour · Live updates {autoRefresh ? 'on' : 'off'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAutoRefresh(!autoRefresh); }}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              autoRefresh
                ? 'bg-green-600/20 text-green-400 border-green-600/50'
                : 'text-gray-400 bg-gray-800 border-gray-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={autoRefresh ? { animationDuration: '3s' } : {}} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
        </div>
      </div>

      {/* Recent Event Counts */}
      {totalRecent > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(recentCounts).sort(([,a], [,b]) => b - a).slice(0, 8).map(([event, count]) => (
            <div key={event} className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5">
              <span className="text-xs text-gray-400 capitalize">{event.replace(/_/g, ' ')}</span>
              <span className="text-xs font-medium text-white">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Channel Filter */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setChannel('all')}
          className={`text-xs px-3 py-1 rounded-full transition-colors ${
            channel === 'all' ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          All
        </button>
        {Object.entries(channelIcons).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setChannel(key)}
              className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full transition-colors ${
                channel === key ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-3 h-3" /> {key}
            </button>
          );
        })}
      </div>

      {/* New items indicator */}
      {newCount > 0 && (
        <button
          onClick={() => { setNewCount(0); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="w-full bg-blue-600/10 border border-blue-600/30 rounded-lg py-2 text-xs text-blue-400 hover:bg-blue-600/20 transition-colors"
        >
          {newCount} new event{newCount > 1 ? 's' : ''} — click to scroll to top
        </button>
      )}

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No activity yet</p>
          <p className="text-xs text-gray-600 mt-1">Events will appear here in real-time</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-4 bottom-4 w-px bg-gray-800" />

          <div className="space-y-1">
            {items.map((item, idx) => {
              const cfg = channelIcons[item.channel] || channelIcons.manual;
              const Icon = cfg.icon;
              const name = item.contact_name?.trim() || 'Unknown';
              const getMessage = eventMessages[item.event_type];
              const message = getMessage ? getMessage(name) : `${name} · ${item.event_type.replace(/_/g, ' ')}`;

              // Show date separator
              const showDate = idx === 0 ||
                new Date(item.occurred_at).toDateString() !== new Date(items[idx - 1].occurred_at).toDateString();

              return (
                <div key={`${item.touchpoint_id}-${idx}`}>
                  {showDate && (
                    <div className="relative flex items-center gap-3 py-2 pl-10">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        {new Date(item.occurred_at).toLocaleDateString('en-US', {
                          weekday: 'long', month: 'short', day: 'numeric',
                        })}
                      </span>
                      <div className="flex-1 h-px bg-gray-800" />
                    </div>
                  )}

                  <div className="relative flex items-start gap-3 py-2 hover:bg-gray-900/50 rounded-lg px-1 transition-colors group">
                    {/* Icon */}
                    <div className="relative z-10 shrink-0 w-9 h-9 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center">
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-1">
                      <p className="text-sm text-gray-300">
                        {message}
                      </p>
                      {item.subject && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{item.subject}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-600">
                          {new Date(item.occurred_at).toLocaleTimeString('en-US', {
                            hour: 'numeric', minute: '2-digit',
                          })}
                        </span>
                        {item.business_name && (
                          <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
                            <Building2 className="w-2.5 h-2.5" /> {item.business_name}
                          </span>
                        )}
                        <span className={`text-[10px] px-1 py-0.5 rounded ${
                          item.direction === 'inbound' ? 'bg-green-900/20 text-green-500' : 'bg-blue-900/20 text-blue-500'
                        }`}>
                          {item.direction}
                        </span>
                      </div>
                    </div>

                    {/* View link */}
                    <Link
                      href={`/contacts/${item.contact_id}`}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-500 hover:text-white mt-1"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

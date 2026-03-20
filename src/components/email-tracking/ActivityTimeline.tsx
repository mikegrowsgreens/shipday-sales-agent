'use client';

import { Eye, MousePointerClick, MessageSquare, Globe, Monitor } from 'lucide-react';
import { useState } from 'react';

export interface TimelineEvent {
  event_id: number;
  event_type: string;
  event_at: string;
  to_email: string;
  from_email: string;
  metadata: Record<string, unknown> | null;
}

interface ActivityTimelineProps {
  events: TimelineEvent[];
  recipientEmail: string;
  recipientName?: string;
}

interface GroupedEvents {
  label: string;
  date: string;
  events: TimelineEvent[];
}

export function ActivityTimeline({ events, recipientEmail, recipientName }: ActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <Eye className="w-8 h-8 mx-auto mb-2 text-gray-600" />
        <p className="text-sm text-gray-500">No activity recorded yet</p>
        <p className="text-xs text-gray-600 mt-1">Events will appear here as your email is opened, clicked, or replied to</p>
      </div>
    );
  }

  const grouped = groupEventsByDate(events);

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <div key={group.date}>
          {/* Date separator */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-gray-700" />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider shrink-0">
              {group.label}
            </span>
            <div className="h-px flex-1 bg-gray-700" />
          </div>

          {/* Events in this date group */}
          <div className="space-y-1">
            {group.events.map((event) => (
              <TimelineEventRow
                key={event.event_id}
                event={event}
                recipientEmail={recipientEmail}
                recipientName={recipientName}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineEventRow({
  event,
  recipientEmail,
  recipientName,
}: {
  event: TimelineEvent;
  recipientEmail: string;
  recipientName?: string;
}) {
  const [showMeta, setShowMeta] = useState(false);
  const displayName = recipientName || recipientEmail;
  const meta = event.metadata || {};

  const { icon, label, detail, color } = getEventDisplay(event, displayName);
  const time = formatEventTime(event.event_at);

  const hasMetadata = !!(meta.ip || meta.user_agent || meta.url);

  return (
    <div
      className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 transition-colors cursor-default"
      onMouseEnter={() => hasMetadata && setShowMeta(true)}
      onMouseLeave={() => setShowMeta(false)}
    >
      {/* Icon */}
      <div className={`mt-0.5 p-1.5 rounded-full shrink-0 ${color.bg}`}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200">
          <span className={`font-medium ${color.text}`}>{label}</span>
          {detail && (
            <span className="text-gray-400"> {detail}</span>
          )}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          by {displayName}
        </p>

        {/* Metadata tooltip on hover */}
        {showMeta && hasMetadata && (
          <div className="mt-2 p-2.5 bg-gray-900 rounded-lg border border-gray-700 text-xs space-y-1.5">
            {meta.url ? (
              <div className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="text-gray-400 truncate">{String(meta.url)}</span>
              </div>
            ) : null}
            {meta.ip ? (
              <div className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="text-gray-400">IP: {String(meta.ip)}</span>
              </div>
            ) : null}
            {meta.user_agent ? (
              <div className="flex items-center gap-1.5">
                <Monitor className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="text-gray-400 truncate">{parseUserAgent(String(meta.user_agent))}</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-xs text-gray-500 shrink-0 mt-0.5">{time}</span>
    </div>
  );
}

function getEventDisplay(event: TimelineEvent, displayName: string) {
  const meta = event.metadata || {};

  switch (event.event_type) {
    case 'open':
      return {
        icon: <Eye className="w-3.5 h-3.5 text-green-400" />,
        label: 'Opened email',
        detail: null,
        color: { bg: 'bg-green-500/10', text: 'text-green-400' },
      };
    case 'click': {
      const url = meta.url ? truncateUrl(String(meta.url), 60) : null;
      return {
        icon: <MousePointerClick className="w-3.5 h-3.5 text-blue-400" />,
        label: 'Clicked link',
        detail: url ? `\u2014 ${url}` : null,
        color: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
      };
    }
    case 'reply':
      return {
        icon: <MessageSquare className="w-3.5 h-3.5 text-purple-400" />,
        label: 'Replied to email',
        detail: null,
        color: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
      };
    default:
      return {
        icon: <Eye className="w-3.5 h-3.5 text-gray-400" />,
        label: event.event_type,
        detail: null,
        color: { bg: 'bg-gray-500/10', text: 'text-gray-400' },
      };
  }
}

function groupEventsByDate(events: TimelineEvent[]): GroupedEvents[] {
  const groups: Map<string, TimelineEvent[]> = new Map();

  for (const event of events) {
    const dateKey = new Date(event.event_at).toDateString();
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(dateKey, [event]);
    }
  }

  return Array.from(groups.entries()).map(([dateKey, evts]) => ({
    label: getDateLabel(new Date(dateKey)),
    date: dateKey,
    events: evts,
  }));
}

function getDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatEventTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

function parseUserAgent(ua: string): string {
  if (ua.includes('Chrome')) return 'Chrome Browser';
  if (ua.includes('Firefox')) return 'Firefox Browser';
  if (ua.includes('Safari')) return 'Safari Browser';
  if (ua.includes('Outlook')) return 'Outlook';
  if (ua.includes('Thunderbird')) return 'Thunderbird';
  if (ua.includes('Gmail')) return 'Gmail';
  if (ua.includes('iPhone') || ua.includes('iOS')) return 'iPhone / iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.length > 50) return ua.slice(0, 50) + '...';
  return ua;
}

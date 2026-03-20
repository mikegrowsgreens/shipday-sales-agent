'use client';

import { useState } from 'react';
import { Video, ExternalLink, Mail, Calendar } from 'lucide-react';
import type { UnifiedCalendarEvent } from '@/lib/types';

// ─── Source Config ──────────────────────────────────────────────────────

const sourceConfig: Record<string, { bg: string; border: string; text: string; icon: typeof Calendar }> = {
  google:  { bg: 'bg-slate-500/20',  border: 'border-slate-500/40',  text: 'text-slate-300',  icon: Calendar },
  booking: { bg: 'bg-blue-500/20',   border: 'border-blue-500/40',   text: 'text-blue-300',   icon: Video },
  send:    { bg: 'bg-amber-500/20',  border: 'border-amber-500/40',  text: 'text-amber-300',  icon: Mail },
};

function getSourceStyle(source: string) {
  return sourceConfig[source] || sourceConfig.google;
}

// ─── Format Helpers ─────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
}

function formatTimeRange(start: string, end: string): string {
  if (start === end) return formatTime(start);
  return `${formatTime(start)} – ${formatTime(end)}`;
}

// ─── Tooltip ────────────────────────────────────────────────────────────

function EventTooltip({ event }: { event: UnifiedCalendarEvent }) {
  const style = getSourceStyle(event.source);
  const SourceIcon = style.icon;

  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 pointer-events-none">
      <div className="flex items-center gap-1.5 mb-1.5">
        <SourceIcon className={`w-3 h-3 ${style.text}`} />
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">{event.source}</span>
      </div>
      <p className="text-xs font-medium text-white truncate">{event.title}</p>
      {!event.allDay && (
        <p className="text-[10px] text-gray-400 mt-0.5">{formatTimeRange(event.start, event.end)}</p>
      )}
      {event.allDay && <p className="text-[10px] text-gray-400 mt-0.5">All day</p>}
      {event.description && (
        <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">{event.description}</p>
      )}
      {event.meetingUrl && (
        <div className="flex items-center gap-1 mt-1.5">
          <Video className="w-3 h-3 text-blue-400" />
          <span className="text-[10px] text-blue-400">Meeting link</span>
        </div>
      )}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-700" />
    </div>
  );
}

// ─── Click Handler ──────────────────────────────────────────────────────

function handleEventClick(event: UnifiedCalendarEvent) {
  if (event.source === 'google' && event.url) {
    window.open(event.url, '_blank', 'noopener');
  } else if (event.source === 'booking' && event.url) {
    window.location.href = event.url;
  }
  // sends: no navigation, detail shown inline
}

// ─── Pill (Month View) ─────────────────────────────────────────────────

export function EventPill({ event }: { event: UnifiedCalendarEvent }) {
  const [hovered, setHovered] = useState(false);
  const style = getSourceStyle(event.source);

  return (
    <div className="relative">
      {hovered && <EventTooltip event={event} />}
      <button
        onClick={(e) => { e.stopPropagation(); handleEventClick(event); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`w-full text-left text-[8px] px-1 py-0.5 rounded truncate border transition-colors ${style.bg} ${style.text} ${style.border} hover:brightness-125`}
      >
        {!event.allDay && <span className="opacity-70">{formatTime(event.start)} </span>}
        {event.title}
      </button>
    </div>
  );
}

// ─── Block (Week View) ─────────────────────────────────────────────────

export function EventBlock({ event }: { event: UnifiedCalendarEvent }) {
  const [hovered, setHovered] = useState(false);
  const style = getSourceStyle(event.source);
  const SourceIcon = style.icon;

  return (
    <div className="relative h-full">
      {hovered && <EventTooltip event={event} />}
      <button
        onClick={(e) => { e.stopPropagation(); handleEventClick(event); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`absolute inset-0.5 rounded border px-1.5 py-1 text-left overflow-hidden transition-colors ${style.bg} ${style.text} ${style.border} hover:brightness-125`}
      >
        <div className="flex items-center gap-1">
          <SourceIcon className="w-2.5 h-2.5 shrink-0 opacity-70" />
          <span className="text-[10px] font-medium truncate">{event.title}</span>
        </div>
        <span className="text-[9px] opacity-70">{formatTimeRange(event.start, event.end)}</span>
      </button>
    </div>
  );
}

// ─── All-Day Pill (Week View Header) ───────────────────────────────────

export function AllDayPill({ event }: { event: UnifiedCalendarEvent }) {
  const [hovered, setHovered] = useState(false);
  const style = getSourceStyle(event.source);

  return (
    <div className="relative">
      {hovered && <EventTooltip event={event} />}
      <button
        onClick={(e) => { e.stopPropagation(); handleEventClick(event); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`w-full text-left text-[9px] px-1.5 py-0.5 rounded border truncate ${style.bg} ${style.text} ${style.border} hover:brightness-125`}
      >
        {event.title}
      </button>
    </div>
  );
}

// ─── Detail Row (selected day panel) ────────────────────────────────────

export function EventDetailRow({ event }: { event: UnifiedCalendarEvent }) {
  const style = getSourceStyle(event.source);
  const SourceIcon = style.icon;

  return (
    <button
      onClick={() => handleEventClick(event)}
      className="w-full flex items-center gap-3 px-3 py-2 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors text-left"
    >
      <SourceIcon className={`w-3.5 h-3.5 shrink-0 ${style.text}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white font-medium truncate">{event.title}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}>
            {event.source}
          </span>
        </div>
        {event.description && (
          <p className="text-[10px] text-gray-500 truncate">{event.description}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className="text-[10px] text-gray-600">
          {event.allDay ? 'All day' : formatTime(event.start)}
        </span>
        {event.meetingUrl && (
          <div className="flex items-center gap-0.5 mt-0.5">
            <Video className="w-2.5 h-2.5 text-blue-400" />
            <span className="text-[9px] text-blue-400">Join</span>
          </div>
        )}
      </div>
      {event.source === 'google' && event.url && (
        <ExternalLink className="w-3 h-3 text-gray-600 shrink-0" />
      )}
    </button>
  );
}

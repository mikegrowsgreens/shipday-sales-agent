'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Loader2,
  LayoutGrid, LayoutList, AlertCircle,
} from 'lucide-react';
import type { UnifiedCalendarEvent } from '@/lib/types';
import MonthView from './MonthView';
import WeekView from './WeekView';

// ─── Types ──────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week';

interface CalendarResponse {
  events: UnifiedCalendarEvent[];
  google_connected: boolean;
  counts: { google: number; bookings: number; sends: number };
}

// ─── Date Helpers ───────────────────────────────────────────────────────

function getMonthRange(date: Date): { start: string; end: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  // Extend range to cover partial weeks at month edges
  const first = new Date(y, m, 1);
  first.setDate(first.getDate() - first.getDay()); // back to Sunday
  const last = new Date(y, m + 1, 0);
  last.setDate(last.getDate() + (6 - last.getDay())); // forward to Saturday
  return {
    start: first.toISOString(),
    end: last.toISOString(),
  };
}

function getWeekRange(date: Date): { start: string; end: string } {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function formatHeader(date: Date, view: ViewMode): string {
  if (view === 'month') {
    return date.toLocaleString('en', { month: 'long', year: 'numeric' });
  }
  // Week view: show range
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.toLocaleString('en', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${start.toLocaleString('en', { month: 'short' })} ${start.getDate()} – ${end.toLocaleString('en', { month: 'short' })} ${end.getDate()}, ${end.getFullYear()}`;
}

// ─── Skeleton ───────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="p-3 space-y-2 animate-pulse">
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-4 bg-gray-800 rounded" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-800/50 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Google Banner ──────────────────────────────────────────────────────

function ConnectGoogleBanner() {
  return (
    <div className="mx-3 mt-3 flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
      <div className="flex-1">
        <p className="text-xs text-amber-300 font-medium">Google Calendar not connected</p>
        <p className="text-[10px] text-amber-400/60">Connect to see your Google Calendar events alongside bookings and sends.</p>
      </div>
      <a
        href="/calendar/connections"
        className="px-3 py-1.5 text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md hover:bg-amber-500/30 transition-colors"
      >
        Connect
      </a>
    </div>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────

function SourceLegend({ counts }: { counts: CalendarResponse['counts'] }) {
  const items = [
    { label: 'Google', color: 'bg-slate-500', count: counts.google },
    { label: 'Bookings', color: 'bg-blue-500', count: counts.bookings },
    { label: 'Sends', color: 'bg-amber-500', count: counts.sends },
  ];

  return (
    <div className="flex items-center gap-3">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${item.color}`} />
          <span className="text-[10px] text-gray-500">{item.label}</span>
          <span className="text-[10px] text-gray-700">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function UnifiedCalendar() {
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<UnifiedCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(true);
  const [counts, setCounts] = useState<CalendarResponse['counts']>({ google: 0, bookings: 0, sends: 0 });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  // Fetch events when date or view changes
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    const range = view === 'month' ? getMonthRange(currentDate) : getWeekRange(currentDate);

    try {
      const res = await fetch(`/api/calendar/events?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CalendarResponse = await res.json();
      setEvents(data.events || []);
      setGoogleConnected(data.google_connected);
      setCounts(data.counts || { google: 0, bookings: 0, sends: 0 });
    } catch (err) {
      console.error('[UnifiedCalendar] fetch failed:', err);
      setFetchError(true);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [currentDate, view]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Navigation
  const goToday = () => {
    setCurrentDate(new Date());
    setSelectedDay(null);
  };

  const goPrev = () => {
    setSelectedDay(null);
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (view === 'month') {
        d.setMonth(d.getMonth() - 1);
      } else {
        d.setDate(d.getDate() - 7);
      }
      return d;
    });
  };

  const goNext = () => {
    setSelectedDay(null);
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (view === 'month') {
        d.setMonth(d.getMonth() + 1);
      } else {
        d.setDate(d.getDate() + 7);
      }
      return d;
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-white">
                {formatHeader(currentDate, view)}
              </span>
            </div>
            <SourceLegend counts={counts} />
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-gray-800 rounded-md p-0.5">
              <button
                onClick={() => { setView('month'); setSelectedDay(null); }}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
                  view === 'month'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                Month
              </button>
              <button
                onClick={() => { setView('week'); setSelectedDay(null); }}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
                  view === 'week'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <LayoutList className="w-3 h-3" />
                Week
              </button>
            </div>

            {/* Navigation */}
            <button
              onClick={goToday}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              Today
            </button>
            <button onClick={goPrev} className="p-1 text-gray-500 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goNext} className="p-1 text-gray-500 hover:text-white transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Google connection banner */}
        {!googleConnected && <ConnectGoogleBanner />}

        {/* Error banner */}
        {fetchError && (
          <div className="mx-3 mt-3 flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">Failed to load calendar events.</p>
            <button onClick={fetchEvents} className="ml-auto px-3 py-1.5 text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30 rounded-md hover:bg-red-500/30 transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Calendar body */}
        {loading ? (
          <CalendarSkeleton />
        ) : view === 'month' ? (
          <MonthView
            currentDate={currentDate}
            events={events}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            events={events}
          />
        )}
      </div>
    </div>
  );
}

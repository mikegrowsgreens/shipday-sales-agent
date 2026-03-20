'use client';

import { useMemo, useRef, useEffect } from 'react';
import type { UnifiedCalendarEvent } from '@/lib/types';
import { EventBlock, AllDayPill } from './CalendarEvent';

interface WeekViewProps {
  currentDate: Date;
  events: UnifiedCalendarEvent[];
}

// ─── Constants ──────────────────────────────────────────────────────────

const HOUR_HEIGHT = 48; // px per hour row
const START_HOUR = 0;
const END_HOUR = 24;
const WORKING_START = 7;
const TOTAL_HOURS = END_HOUR - START_HOUR;

// ─── Helpers ────────────────────────────────────────────────────────────

function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay()); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getEventPosition(event: UnifiedCalendarEvent) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const duration = Math.max(endMinutes - startMinutes, 15); // minimum 15min display

  const top = (startMinutes / 60) * HOUR_HEIGHT;
  const height = (duration / 60) * HOUR_HEIGHT;

  return { top, height: Math.max(height, 18) };
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

// ─── Component ──────────────────────────────────────────────────────────

export default function WeekView({ currentDate, events }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekDays = getWeekDays(currentDate);
  const now = new Date();
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  const timeIndicatorTop = (currentTimeMinutes / 60) * HOUR_HEIGHT;

  // Scroll to working hours on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = WORKING_START * HOUR_HEIGHT - 8;
    }
  }, [currentDate]);

  // Group events by day, split all-day vs timed
  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDay: Record<string, UnifiedCalendarEvent[]> = {};
    const timed: Record<string, UnifiedCalendarEvent[]> = {};

    for (const e of events) {
      const key = e.start.split('T')[0];
      if (e.allDay) {
        if (!allDay[key]) allDay[key] = [];
        allDay[key].push(e);
      } else {
        if (!timed[key]) timed[key] = [];
        timed[key].push(e);
      }
    }
    return { allDayByDay: allDay, timedByDay: timed };
  }, [events]);

  const hasAllDay = weekDays.some(d => (allDayByDay[dateKey(d)] || []).length > 0);

  // Hours labels
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

  return (
    <div className="flex flex-col">
      {/* Header: day labels + all-day events */}
      <div className="flex border-b border-gray-800">
        {/* Time gutter spacer */}
        <div className="w-14 shrink-0" />

        {/* Day columns */}
        <div className="grid grid-cols-7 flex-1">
          {weekDays.map(d => {
            const key = dateKey(d);
            const today = isToday(d);
            const allDayEvents = allDayByDay[key] || [];

            return (
              <div key={key} className="border-l border-gray-800 first:border-l-0">
                <div className={`text-center py-2 ${today ? 'bg-blue-500/5' : ''}`}>
                  <div className="text-[10px] text-gray-600 uppercase">
                    {d.toLocaleDateString('en', { weekday: 'short' })}
                  </div>
                  <div className={`text-sm font-semibold ${
                    today ? 'text-blue-400' : 'text-gray-400'
                  }`}>
                    {d.getDate()}
                  </div>
                </div>
                {hasAllDay && (
                  <div className="px-0.5 pb-1 space-y-0.5 min-h-[24px]">
                    {allDayEvents.map(e => (
                      <AllDayPill key={e.id} event={e} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="overflow-y-auto max-h-[350px] md:max-h-[520px]">
        <div className="flex relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {/* Time labels */}
          <div className="w-14 shrink-0 relative">
            {hours.map(h => (
              <div
                key={h}
                className="absolute right-2 text-[10px] text-gray-600 -translate-y-1/2"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString('en', { hour: 'numeric' })}
              </div>
            ))}
          </div>

          {/* Day columns with events */}
          <div className="grid grid-cols-7 flex-1 relative">
            {/* Hour grid lines */}
            {hours.map(h => (
              <div
                key={`line-${h}`}
                className="absolute left-0 right-0 border-t border-gray-800/60"
                style={{ top: h * HOUR_HEIGHT }}
              />
            ))}

            {/* Current time indicator */}
            {weekDays.some(d => isToday(d)) && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: timeIndicatorTop }}
              >
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                  <div className="flex-1 h-[1.5px] bg-red-500" />
                </div>
              </div>
            )}

            {/* Event columns */}
            {weekDays.map(d => {
              const key = dateKey(d);
              const dayEvents = timedByDay[key] || [];
              const today = isToday(d);

              return (
                <div
                  key={key}
                  className={`relative border-l border-gray-800 first:border-l-0 ${
                    today ? 'bg-blue-500/[0.02]' : ''
                  }`}
                >
                  {dayEvents.map(e => {
                    const { top, height } = getEventPosition(e);
                    return (
                      <div
                        key={e.id}
                        className="absolute left-0 right-0 z-10 px-0.5"
                        style={{ top, height }}
                      >
                        <EventBlock event={e} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import type { UnifiedCalendarEvent } from '@/lib/types';
import { EventPill, EventDetailRow } from './CalendarEvent';
import { Target } from 'lucide-react';

interface MonthViewProps {
  currentDate: Date;
  events: UnifiedCalendarEvent[];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isSameDay(iso: string, key: string): boolean {
  return iso.startsWith(key);
}

// ─── Component ──────────────────────────────────────────────────────────

export default function MonthView({ currentDate, events, selectedDay, onSelectDay }: MonthViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  // Build calendar grid with prev/next month padding
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: Array<{ day: number; dateStr: string; inMonth: boolean }> = [];

  // Previous month padding
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ day: d, dateStr: dateKey(y, m, d), inMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: dateKey(year, month, d), inMonth: true });
  }

  // Next month padding (fill to 42 = 6 rows)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    cells.push({ day: d, dateStr: dateKey(y, m, d), inMonth: false });
  }

  // Only show 5 rows if last row is entirely next month
  const totalRows = cells.slice(35).every(c => !c.inMonth) ? 5 : 6;
  const visibleCells = cells.slice(0, totalRows * 7);

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map: Record<string, UnifiedCalendarEvent[]> = {};
    for (const e of events) {
      const key = e.start.split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    return map;
  }, [events]);

  const selectedDayEvents = selectedDay ? (eventsByDay[selectedDay] || []) : [];

  return (
    <div>
      <div className="p-3">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-[10px] text-gray-600 font-medium py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {visibleCells.map((cell) => {
            const dayEvents = eventsByDay[cell.dateStr] || [];
            const isToday = cell.dateStr === today;
            const isSelected = cell.dateStr === selectedDay;
            const hasEvents = dayEvents.length > 0;

            return (
              <div
                key={cell.dateStr}
                role="button"
                tabIndex={0}
                onClick={() => onSelectDay(isSelected ? null : cell.dateStr)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDay(isSelected ? null : cell.dateStr); } }}
                className={`h-20 rounded-lg border text-left p-1.5 transition-colors cursor-pointer ${
                  !cell.inMonth
                    ? 'opacity-40 border-transparent hover:border-gray-800'
                    : isSelected
                    ? 'border-blue-500 bg-blue-500/10'
                    : isToday
                    ? 'border-blue-500/30 bg-blue-500/5'
                    : hasEvents
                    ? 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                    : 'border-transparent hover:border-gray-800'
                }`}
              >
                <span className={`text-[11px] font-medium ${
                  !cell.inMonth
                    ? 'text-gray-700'
                    : isToday
                    ? 'text-blue-400'
                    : 'text-gray-500'
                }`}>
                  {cell.day}
                </span>

                {dayEvents.length > 0 && (
                  <div className="mt-0.5 space-y-0.5 overflow-hidden">
                    {dayEvents.slice(0, 3).map(e => (
                      <EventPill key={e.id} event={e} />
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[8px] text-gray-600 px-1">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail panel */}
      {selectedDay && selectedDayEvents.length > 0 && (
        <div className="mx-3 mb-3 border border-gray-800 rounded-xl p-4 bg-gray-800/30">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium text-gray-400">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en', {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
            </span>
            <span className="text-xs text-gray-600">
              {selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {selectedDayEvents.map(e => (
              <EventDetailRow key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Loader2, Clock,
  Send, Eye, MessageSquare, Target,
} from 'lucide-react';

interface ScheduledSend {
  id: string;
  lead_id: number;
  business_name: string;
  subject: string;
  angle: string;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  open_count: number;
  replied: boolean;
}

const angleColors: Record<string, string> = {
  missed_calls: 'bg-red-500/20 text-red-400 border-red-500/30',
  commission_savings: 'bg-green-500/20 text-green-400 border-green-500/30',
  delivery_ops: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  tech_consolidation: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  customer_experience: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

const angleLabels: Record<string, string> = {
  missed_calls: 'Missed Calls',
  commission_savings: 'Commission',
  delivery_ops: 'Delivery',
  tech_consolidation: 'Tech Stack',
  customer_experience: 'CX',
};

const statusIcons: Record<string, typeof Send> = {
  scheduled: Clock,
  sent: Send,
  opened: Eye,
  replied: MessageSquare,
};

export default function SendCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sends, setSends] = useState<ScheduledSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Get month/year
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('en', { month: 'long', year: 'numeric' });

  // Fetch sends for this month
  useEffect(() => {
    setLoading(true);
    const start = new Date(year, month, 1).toISOString().split('T')[0];
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

    fetch(`/api/bdr/campaigns/calendar?start=${start}&end=${end}`)
      .then(res => res.json())
      .then(data => setSends(data.sends || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year, month]);

  // Group sends by day
  const sendsByDay = useMemo(() => {
    const map: Record<string, ScheduledSend[]> = {};
    for (const s of sends) {
      const dateStr = (s.scheduled_at || s.sent_at || '').split('T')[0];
      if (!dateStr) continue;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(s);
    }
    return map;
  }, [sends]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const calendarDays: Array<{ day: number; dateStr: string } | null> = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarDays.push({ day: d, dateStr });
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const selectedDaySends = selectedDay ? (sendsByDay[selectedDay] || []) : [];

  // Stats
  const totalScheduled = sends.filter(s => !s.sent_at).length;
  const totalSent = sends.filter(s => s.sent_at).length;
  const totalOpened = sends.filter(s => s.open_count > 0).length;
  const totalReplied = sends.filter(s => s.replied).length;

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-yellow-400" />
          <div>
            <div className="text-xs text-gray-500">Scheduled</div>
            <div className="text-sm font-bold text-white">{totalScheduled}</div>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-400" />
          <div>
            <div className="text-xs text-gray-500">Sent</div>
            <div className="text-sm font-bold text-white">{totalSent}</div>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
          <Eye className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-xs text-gray-500">Opened</div>
            <div className="text-sm font-bold text-white">{totalOpened}</div>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-green-400" />
          <div>
            <div className="text-xs text-gray-500">Replied</div>
            <div className="text-sm font-bold text-white">{totalReplied}</div>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* Calendar header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">{monthName}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={goToday} className="px-2 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors">
              Today
            </button>
            <button onClick={prevMonth} className="p-1 text-gray-500 hover:text-white">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={nextMonth} className="p-1 text-gray-500 hover:text-white">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        ) : (
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
              {calendarDays.map((cell, i) => {
                if (!cell) return <div key={`empty-${i}`} className="h-20" />;

                const daySends = sendsByDay[cell.dateStr] || [];
                const isToday = cell.dateStr === today;
                const isSelected = cell.dateStr === selectedDay;
                const hasSends = daySends.length > 0;

                return (
                  <button
                    key={cell.dateStr}
                    onClick={() => setSelectedDay(isSelected ? null : cell.dateStr)}
                    className={`h-20 rounded-lg border text-left p-1.5 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : isToday
                        ? 'border-blue-500/30 bg-blue-500/5'
                        : hasSends
                        ? 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                        : 'border-transparent hover:border-gray-800'
                    }`}
                  >
                    <span className={`text-[11px] font-medium ${
                      isToday ? 'text-blue-400' : 'text-gray-500'
                    }`}>
                      {cell.day}
                    </span>
                    {daySends.length > 0 && (
                      <div className="mt-0.5 space-y-0.5 overflow-hidden">
                        {daySends.slice(0, 3).map(s => (
                          <div
                            key={s.id}
                            className={`text-[8px] px-1 py-0.5 rounded truncate border ${
                              angleColors[s.angle] || 'bg-gray-700/50 text-gray-400 border-gray-600'
                            }`}
                          >
                            {s.business_name?.split(' ')[0] || 'Lead'}
                          </div>
                        ))}
                        {daySends.length > 3 && (
                          <div className="text-[8px] text-gray-600 px-1">
                            +{daySends.length - 3} more
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected day detail */}
      {selectedDay && selectedDaySends.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium text-gray-400">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            <span className="text-xs text-gray-600">{selectedDaySends.length} email{selectedDaySends.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2">
            {selectedDaySends.map(s => {
              const StatusIcon = statusIcons[s.replied ? 'replied' : s.open_count > 0 ? 'opened' : s.sent_at ? 'sent' : 'scheduled'] || Clock;
              return (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-gray-800/50 rounded-lg">
                  <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${
                    s.replied ? 'text-green-400' : s.open_count > 0 ? 'text-cyan-400' : s.sent_at ? 'text-blue-400' : 'text-yellow-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white font-medium truncate">{s.business_name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                        angleColors[s.angle] || 'bg-gray-700/50 text-gray-400 border-gray-600'
                      }`}>
                        {angleLabels[s.angle] || s.angle}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">{s.subject}</p>
                  </div>
                  <span className="text-[10px] text-gray-600 shrink-0">
                    {new Date(s.scheduled_at || s.sent_at || '').toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, Send, Eye, MousePointerClick, MessageSquare,
  Activity, Mail, Calendar, ChevronLeft, ChevronRight, Filter,
} from 'lucide-react';
import DateRangeSelector from '@/components/ui/DateRangeSelector';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrackerData {
  summary: Record<string, string>;
  trend: Array<{ day: string; sent: number; opened: number; replied: number }>;
  anglePerf: Array<Record<string, string>>;
  emails: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

interface ActivitySend {
  id: string;
  lead_id: number;
  subject: string;
  angle: string;
  sent_at: string;
  open_count: number;
  replied: boolean;
  reply_at: string | null;
  business_name: string;
  contact_email: string;
}

interface CalendarSend {
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

// ─── Constants ──────────────────────────────────────────────────────────────

const angleLabels: Record<string, string> = {
  missed_calls: 'Missed Calls',
  commission_savings: 'Commission',
  delivery_ops: 'Delivery Ops',
  tech_consolidation: 'Tech Stack',
  customer_experience: 'CX',
};

const eventIcons: Record<string, { icon: typeof Eye; color: string }> = {
  open: { icon: Eye, color: 'text-yellow-400' },
  click: { icon: MousePointerClick, color: 'text-cyan-400' },
  reply: { icon: MessageSquare, color: 'text-green-400' },
  bounce: { icon: Mail, color: 'text-red-400' },
  unsubscribe: { icon: Mail, color: 'text-red-500' },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function OutboundAnalytics() {
  // Tracker data
  const [trackerData, setTrackerData] = useState<TrackerData | null>(null);
  const [trackerLoading, setTrackerLoading] = useState(true);
  const [trackerRange, setTrackerRange] = useState('30d');
  const [trackerFrom, setTrackerFrom] = useState('');
  const [trackerTo, setTrackerTo] = useState('');

  // Activity feed
  const [activitySends, setActivitySends] = useState<ActivitySend[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(0);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

  // Calendar strip
  const [calendarSends, setCalendarSends] = useState<CalendarSend[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedCalDay, setSelectedCalDay] = useState<string | null>(null);
  const [calendarOffset, setCalendarOffset] = useState(0); // weeks offset from current

  // ─── Fetch tracker data ─────────────────────────────────────────────────

  const fetchTracker = useCallback(async () => {
    setTrackerLoading(true);
    try {
      const params = new URLSearchParams({ range: trackerRange });
      if (trackerFrom) params.set('from', trackerFrom);
      if (trackerTo) params.set('to', trackerTo);
      const res = await fetch(`/api/bdr/tracker?${params}`);
      const data = await res.json();
      setTrackerData(data);
    } catch (err) {
      console.error('[OutboundAnalytics] tracker fetch error:', err);
    } finally {
      setTrackerLoading(false);
    }
  }, [trackerRange, trackerFrom, trackerTo]);

  // ─── Fetch activity feed ────────────────────────────────────────────────

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/bdr/activity?range=${trackerRange}`);
      const data = await res.json();
      setActivitySends(data.sends || []);
    } catch (err) {
      console.error('[OutboundAnalytics] activity fetch error:', err);
    } finally {
      setActivityLoading(false);
    }
  }, [trackerRange]);

  // ─── Fetch calendar strip ──────────────────────────────────────────────

  const fetchCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 13 + calendarOffset * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 13);

      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      const res = await fetch(`/api/bdr/campaigns/calendar?start=${startStr}&end=${endStr}`);
      const data = await res.json();
      setCalendarSends(data.sends || []);
    } catch (err) {
      console.error('[OutboundAnalytics] calendar fetch error:', err);
    } finally {
      setCalendarLoading(false);
    }
  }, [calendarOffset]);

  useEffect(() => { fetchTracker(); }, [fetchTracker]);
  useEffect(() => { fetchActivity(); }, [fetchActivity]);
  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  // ─── Calendar strip computation ─────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const now = new Date();
    const days: Array<{ dateStr: string; label: string; dayOfWeek: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i + calendarOffset * 7);
      const dateStr = d.toISOString().split('T')[0];
      const count = calendarSends.filter(s => {
        const sd = (s.scheduled_at || s.sent_at || '').split('T')[0];
        return sd === dateStr;
      }).length;
      days.push({
        dateStr,
        label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
        dayOfWeek: d.toLocaleDateString('en', { weekday: 'short' }),
        count,
      });
    }
    return days;
  }, [calendarSends, calendarOffset]);

  // ─── Merged activity feed (emails + events) ────────────────────────────

  const mergedFeed = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced';
      business_name: string;
      subject: string;
      angle: string;
      timestamp: string;
      open_count: number;
      contact_email?: string;
    }> = [];

    // Add activity sends
    for (const s of activitySends) {
      items.push({
        id: `send-${s.id}`,
        type: s.replied ? 'replied' : s.open_count > 0 ? 'opened' : 'sent',
        business_name: s.business_name,
        subject: s.subject,
        angle: s.angle,
        timestamp: s.sent_at,
        open_count: s.open_count,
        contact_email: s.contact_email,
      });
    }

    // Add tracker events
    if (trackerData?.events) {
      for (const ev of trackerData.events) {
        const eventType = String(ev.event_type || '');
        const mapped = eventType === 'open' ? 'opened'
          : eventType === 'click' ? 'clicked'
          : eventType === 'reply' ? 'replied'
          : eventType === 'bounce' ? 'bounced'
          : null;
        if (!mapped) continue;

        const eventId = `event-${String(ev.event_id || ev.id || Math.random())}`;
        // Skip if we already have a matching send entry for this
        if (items.some(i => i.business_name === String(ev.business_name || '') && i.type === mapped)) continue;

        items.push({
          id: eventId,
          type: mapped,
          business_name: String(ev.business_name || ev.to_email || '--'),
          subject: String(ev.subject || ''),
          angle: String(ev.angle || ''),
          timestamp: String(ev.event_at || ev.created_at || ''),
          open_count: 0,
        });
      }
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply calendar day filter
    if (selectedCalDay) {
      return items.filter(i => i.timestamp.split('T')[0] === selectedCalDay);
    }

    // Apply event type filter
    if (eventTypeFilter !== 'all') {
      return items.filter(i => i.type === eventTypeFilter);
    }

    return items;
  }, [activitySends, trackerData?.events, eventTypeFilter, selectedCalDay]);

  const pageSize = 25;
  const pagedFeed = mergedFeed.slice(0, (activityPage + 1) * pageSize);
  const hasMore = pagedFeed.length < mergedFeed.length;

  // ─── Render ─────────────────────────────────────────────────────────────

  if (trackerLoading && !trackerData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  const s = (trackerData?.summary || {}) as Record<string, string>;

  return (
    <div className="space-y-4">
      {/* Date range selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300">Analytics</h2>
        <DateRangeSelector
          value={trackerRange}
          onChange={(range, from, to) => {
            setTrackerRange(range);
            setTrackerFrom(from || '');
            setTrackerTo(to || '');
          }}
        />
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <Send className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <div className="text-xl font-bold text-white">{s.total_sent || '0'}</div>
          <div className="text-[10px] text-gray-500 uppercase">Sent</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <Eye className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <div className="text-xl font-bold text-white">{s.total_opened || '0'}</div>
          <div className="text-[10px] text-gray-500 uppercase">Opened ({s.open_rate || '0'}%)</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <MousePointerClick className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
          <div className="text-xl font-bold text-white">{s.total_clicked || '0'}</div>
          <div className="text-[10px] text-gray-500 uppercase">Clicked ({s.click_rate || '0'}%)</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <MessageSquare className="w-4 h-4 text-green-400 mx-auto mb-1" />
          <div className="text-xl font-bold text-white">{s.total_replied || '0'}</div>
          <div className="text-[10px] text-gray-500 uppercase">Replied ({s.reply_rate || '0'}%)</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <Activity className="w-4 h-4 text-purple-400 mx-auto mb-1" />
          <div className="text-xl font-bold text-white">{s.total_opens || '0'}</div>
          <div className="text-[10px] text-gray-500 uppercase">Total Opens</div>
        </div>
      </div>

      {/* ── Daily Trend Chart ───────────────────────────────────────────────── */}
      {(() => {
        const trend = trackerData?.trend || [];
        if (trend.length === 0) return null;
        const maxSent = Math.max(...trend.map(t => t.sent), 1);
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3">Daily Volume</h3>
            <div className="flex items-end gap-1 h-32">
              {trend.map(t => (
                <div key={t.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full flex flex-col justify-end h-24 gap-px">
                    <div
                      className="w-full bg-blue-600 rounded-t"
                      style={{ height: `${(t.sent / maxSent) * 100}%`, minHeight: t.sent > 0 ? '2px' : '0' }}
                    />
                  </div>
                  <span className="text-[8px] text-gray-600 -rotate-45 origin-top-left whitespace-nowrap">
                    {new Date(t.day).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-gray-300 text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                    {t.sent} sent, {t.opened} opened, {t.replied} replied
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <div className="w-2 h-2 bg-blue-600 rounded" /> Sent
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── Calendar Strip (14-day horizontal) ──────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-gray-400">Send Calendar</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCalendarOffset(prev => prev - 1)}
              className="p-1 text-gray-500 hover:text-white"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {calendarOffset !== 0 && (
              <button
                onClick={() => setCalendarOffset(0)}
                className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-white bg-gray-800 rounded"
              >
                Today
              </button>
            )}
            <button
              onClick={() => setCalendarOffset(prev => prev + 1)}
              className="p-1 text-gray-500 hover:text-white"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {calendarLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
          </div>
        ) : (
          <div className="flex gap-1">
            {calendarDays.map(day => {
              const isSelected = selectedCalDay === day.dateStr;
              const isToday = day.dateStr === new Date().toISOString().split('T')[0];
              const maxCount = Math.max(...calendarDays.map(d => d.count), 1);
              const intensity = day.count > 0 ? Math.max(0.2, day.count / maxCount) : 0;

              return (
                <button
                  key={day.dateStr}
                  onClick={() => setSelectedCalDay(isSelected ? null : day.dateStr)}
                  className={`flex-1 flex flex-col items-center py-1.5 px-1 rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-blue-500/20 border border-blue-500/40'
                      : isToday
                      ? 'bg-blue-500/10 border border-blue-500/20'
                      : 'border border-transparent hover:bg-gray-800'
                  }`}
                >
                  <span className="text-[9px] text-gray-600">{day.dayOfWeek}</span>
                  <span className={`text-[10px] font-medium ${isToday ? 'text-blue-400' : 'text-gray-400'}`}>
                    {day.label.split(' ')[1]}
                  </span>
                  {day.count > 0 ? (
                    <div
                      className="w-3 h-3 rounded-full mt-1"
                      style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}
                      title={`${day.count} sends`}
                    />
                  ) : (
                    <div className="w-3 h-3 mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {selectedCalDay && (
          <div className="mt-2 text-[10px] text-blue-400 cursor-pointer" onClick={() => setSelectedCalDay(null)}>
            Showing activity for {new Date(selectedCalDay + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })} — click to clear filter
          </div>
        )}
      </div>

      {/* ── Activity Feed (merged emails + events) ──────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-400">
            Activity Feed ({mergedFeed.length})
          </h3>
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3 text-gray-600" />
            {['all', 'sent', 'opened', 'clicked', 'replied'].map(f => (
              <button
                key={f}
                onClick={() => { setEventTypeFilter(f); setActivityPage(0); setSelectedCalDay(null); }}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  eventTypeFilter === f && !selectedCalDay
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {activityLoading && activitySends.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
          </div>
        ) : pagedFeed.length === 0 ? (
          <p className="text-gray-500 text-center py-4 text-xs">No activity in this period</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {pagedFeed.map(item => {
              const config = item.type === 'sent'
                ? { icon: Send, color: 'text-blue-400' }
                : item.type === 'opened'
                ? { icon: Eye, color: 'text-yellow-400' }
                : item.type === 'clicked'
                ? { icon: MousePointerClick, color: 'text-cyan-400' }
                : item.type === 'replied'
                ? { icon: MessageSquare, color: 'text-green-400' }
                : { icon: Mail, color: 'text-red-400' };

              const Icon = config.icon;

              return (
                <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg hover:bg-gray-800/50">
                  <div className="flex items-center gap-1 shrink-0">
                    <Icon className={`w-3 h-3 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white truncate">
                        {item.business_name || '--'}
                      </span>
                      {item.angle && (
                        <span className="text-[10px] text-gray-600">
                          {(angleLabels[item.angle] || item.angle).replace(/_/g, ' ')}
                        </span>
                      )}
                      <span className={`text-[10px] font-medium ${config.color} ml-auto shrink-0`}>
                        {item.type}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">{item.subject}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-gray-500">
                      {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '--'}
                    </div>
                    {item.open_count > 0 && (
                      <div className="text-[10px] text-yellow-400">
                        {item.open_count} open{item.open_count !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <button
                onClick={() => setActivityPage(prev => prev + 1)}
                className="w-full py-2 text-xs text-blue-400 hover:text-blue-300 bg-gray-800/30 rounded-lg"
              >
                Load more ({mergedFeed.length - pagedFeed.length} remaining)
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Angle Performance Table ─────────────────────────────────────────── */}
      {(() => {
        const anglePerf = trackerData?.anglePerf || [];
        if (anglePerf.length === 0) return null;
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-3">Angle Performance</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left py-1.5">Angle</th>
                  <th className="text-right py-1.5">Sent</th>
                  <th className="text-right py-1.5">Opens</th>
                  <th className="text-right py-1.5">Clicks</th>
                  <th className="text-right py-1.5">Replies</th>
                  <th className="text-right py-1.5">Open %</th>
                  <th className="text-right py-1.5">Reply %</th>
                </tr>
              </thead>
              <tbody>
                {anglePerf.map(a => (
                  <tr key={a.angle} className="border-t border-gray-800">
                    <td className="py-1.5 text-gray-300">{angleLabels[a.angle] || a.angle}</td>
                    <td className="py-1.5 text-right text-white">{a.sent}</td>
                    <td className="py-1.5 text-right text-yellow-400">{a.opens}</td>
                    <td className="py-1.5 text-right text-cyan-400">{a.clicks}</td>
                    <td className="py-1.5 text-right text-green-400">{a.replies}</td>
                    <td className="py-1.5 text-right text-white">{a.open_rate || '0'}%</td>
                    <td className="py-1.5 text-right text-white">{a.reply_rate || '0'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

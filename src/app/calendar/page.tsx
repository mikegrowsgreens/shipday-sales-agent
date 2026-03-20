'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CalendarCheck, Clock, CalendarX, TrendingUp, Plus, Loader2,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import UnifiedCalendar from '@/components/calendar/UnifiedCalendar';
import type { SchedulingBooking, SchedulingEventType } from '@/lib/types';

interface Stats {
  thisWeek: number;
  upcoming: number;
  cancelledThisWeek: number;
  activeEventTypes: number;
}

export default function CalendarPage() {
  const [stats, setStats] = useState<Stats>({ thisWeek: 0, upcoming: 0, cancelledThisWeek: 0, activeEventTypes: 0 });
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchStats = useCallback(async () => {
    try {
      const now = new Date();
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const [upcomingRes, weekRes, etRes] = await Promise.all([
        fetch(`/api/scheduling/bookings?date_from=${now.toISOString()}&date_to=${weekEnd.toISOString()}&status=confirmed&limit=200`),
        fetch(`/api/scheduling/bookings?date_from=${weekStart.toISOString()}&date_to=${weekEnd.toISOString()}&limit=200`),
        fetch('/api/scheduling/event-types'),
      ]);

      const upcomingData = await upcomingRes.json();
      const weekData = await weekRes.json();
      const etData = await etRes.json();

      const weekBookings = weekData.bookings || [];
      const eventTypes: SchedulingEventType[] = etData.event_types || [];

      setStats({
        thisWeek: weekBookings.filter((b: SchedulingBooking) => b.status !== 'cancelled').length,
        upcoming: (upcomingData.bookings || []).length,
        cancelledThisWeek: weekBookings.filter((b: SchedulingBooking) => b.status === 'cancelled').length,
        activeEventTypes: eventTypes.filter(et => et.is_active).length,
      });
    } catch {
      addToast('Failed to load calendar stats', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendar</h1>
          <p className="text-gray-400 text-sm mt-1">Your unified view of meetings, bookings, and scheduled sends</p>
        </div>
        <Link
          href="/calendar/event-types/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Event Type
        </Link>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-20">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard label="Meetings This Week" value={stats.thisWeek} icon={CalendarCheck} color="blue" />
          <StatCard label="Upcoming" value={stats.upcoming} icon={Clock} color="green" />
          <StatCard label="Cancelled This Week" value={stats.cancelledThisWeek} icon={CalendarX} color="red" />
          <StatCard label="Active Event Types" value={stats.activeEventTypes} icon={TrendingUp} color="purple" />
        </div>
      )}

      {/* Unified Calendar */}
      <UnifiedCalendar />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  const colors: Record<string, { bg: string; text: string; icon: string }> = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: 'text-blue-400' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400', icon: 'text-green-400' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', icon: 'text-red-400' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: 'text-purple-400' },
  };
  const c = colors[color] || colors.blue;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
      </div>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
    </div>
  );
}

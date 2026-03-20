'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, Filter, Loader2, CalendarDays, Video, Phone,
  MapPin, ExternalLink, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { SchedulingBooking, SchedulingEventType } from '@/lib/types';

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  confirmed: { bg: 'bg-blue-600/20', text: 'text-blue-400', label: 'Confirmed' },
  completed: { bg: 'bg-green-600/20', text: 'text-green-400', label: 'Completed' },
  cancelled: { bg: 'bg-red-600/20', text: 'text-red-400', label: 'Cancelled' },
  no_show: { bg: 'bg-yellow-600/20', text: 'text-yellow-400', label: 'No Show' },
  rescheduled: { bg: 'bg-purple-600/20', text: 'text-purple-400', label: 'Rescheduled' },
};

const locationIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  google_meet: Video,
  zoom: Video,
  phone: Phone,
  in_person: MapPin,
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<SchedulingBooking[]>([]);
  const [eventTypes, setEventTypes] = useState<SchedulingEventType[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const { addToast } = useToast();
  const LIMIT = 25;

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(page * LIMIT),
        sort: 'starts_at',
        order: 'DESC',
      });
      if (status !== 'all') params.set('status', status);
      if (eventTypeFilter !== 'all') params.set('event_type_id', eventTypeFilter);
      if (search) params.set('search', search);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await fetch(`/api/scheduling/bookings?${params}`);
      const data = await res.json();
      setBookings(data.bookings || []);
      setTotal(data.total || 0);
    } catch {
      addToast('Failed to load bookings', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, status, eventTypeFilter, dateFrom, dateTo, page, addToast]);

  const fetchEventTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduling/event-types?active=false');
      const data = await res.json();
      setEventTypes(data.event_types || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchEventTypes(); }, [fetchEventTypes]);
  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bookings</h1>
          <p className="text-gray-400 text-sm mt-1">{total} total bookings</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(0); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </select>

        <select
          value={eventTypeFilter}
          onChange={e => { setEventTypeFilter(e.target.value); setPage(0); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Event Types</option>
          {eventTypes.map(et => (
            <option key={et.event_type_id} value={et.event_type_id}>{et.name}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(0); }}
          placeholder="From"
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(0); }}
          placeholder="To"
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
          <CalendarDays className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No bookings found</p>
          <p className="text-gray-500 text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase">
                <th className="text-left px-4 py-3 font-medium">Date & Time</th>
                <th className="text-left px-4 py-3 font-medium">Invitee</th>
                <th className="text-left px-4 py-3 font-medium">Event Type</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Meeting</th>
                <th className="text-left px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const sc = statusConfig[b.status] || statusConfig.confirmed;
                const LocationIcon = locationIcons[b.location_type] || CalendarDays;

                return (
                  <tr key={b.booking_id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm text-white">
                        {new Date(b.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(b.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        {' - '}
                        {new Date(b.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-white">{b.invitee_name}</p>
                      <p className="text-xs text-gray-500">{b.invitee_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-300">{b.event_type_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sc.bg} ${sc.text}`}>
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {b.meeting_url ? (
                        <a
                          href={b.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                        >
                          <LocationIcon className="w-3.5 h-3.5" /> Join
                        </a>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <LocationIcon className="w-3.5 h-3.5" /> {b.location_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/calendar/bookings/${b.booking_id}`}
                        className="text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
              <p className="text-xs text-gray-500">
                Showing {page * LIMIT + 1}-{Math.min((page + 1) * LIMIT, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-400 px-2">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

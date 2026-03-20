'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, CheckCircle, XCircle, Webhook, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface WebhookLogEntry {
  log_id: number;
  booking_id: number | null;
  event_name: string;
  webhook_url: string;
  response_status: number | null;
  success: boolean;
  attempted_at: string;
}

const PAGE_SIZE = 25;

export default function WebhookLogPage() {
  const [logs, setLogs] = useState<WebhookLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [eventFilter, setEventFilter] = useState('');
  const [successFilter, setSuccessFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (eventFilter) params.set('event_name', eventFilter);
      if (successFilter) params.set('success', successFilter);

      const res = await fetch(`/api/calendar/webhooks?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {
      addToast('Failed to load webhook logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [offset, eventFilter, successFilter, addToast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/calendar/analytics" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Webhook className="w-6 h-6 text-gray-400" />
            Webhook Log
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{total} deliveries</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={eventFilter}
          onChange={e => { setEventFilter(e.target.value); setOffset(0); }}
          className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2"
        >
          <option value="">All Events</option>
          <option value="booking.created">booking.created</option>
          <option value="booking.cancelled">booking.cancelled</option>
          <option value="booking.rescheduled">booking.rescheduled</option>
          <option value="booking.completed">booking.completed</option>
          <option value="booking.no_show">booking.no_show</option>
        </select>

        <select
          value={successFilter}
          onChange={e => { setSuccessFilter(e.target.value); setOffset(0); }}
          className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2"
        >
          <option value="">All Status</option>
          <option value="true">Successful</option>
          <option value="false">Failed</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
          <Webhook className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No webhook deliveries yet</p>
          <p className="text-gray-500 text-sm mt-1">Webhooks fire on booking lifecycle events</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Event</th>
                <th className="px-4 py-3 text-left">URL</th>
                <th className="px-4 py-3 text-left">HTTP</th>
                <th className="px-4 py-3 text-left">Booking</th>
                <th className="px-4 py-3 text-left">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {logs.map(log => (
                <tr key={log.log_id} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    {log.success ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded">
                      {log.event_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate" title={log.webhook_url}>
                    {log.webhook_url}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-mono ${
                      log.response_status && log.response_status < 300
                        ? 'text-green-400'
                        : log.response_status
                          ? 'text-red-400'
                          : 'text-gray-500'
                    }`}>
                      {log.response_status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.booking_id ? (
                      <Link
                        href={`/calendar/bookings/${log.booking_id}`}
                        className="text-blue-400 hover:text-blue-300 text-xs"
                      >
                        #{log.booking_id}
                      </Link>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(log.attempted_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
              <span className="text-xs text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                  className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400"
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

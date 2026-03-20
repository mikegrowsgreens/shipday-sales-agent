'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, Check, Calendar, Clock, RefreshCw, CalendarPlus, Filter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import QueueCard, { type QueueItem } from './QueueCard';
import TimeSlotPicker, { type BookingResult } from '@/components/scheduling/TimeSlotPicker';

type FilterMode = 'all' | 'today' | 'week' | 'overdue';

export default function FollowUpQueue() {
  const router = useRouter();
  const { addToast, updateToast } = useToast();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [grouped, setGrouped] = useState<Record<string, QueueItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  // Booking state
  const [bookingDealId, setBookingDealId] = useState<string | null>(null);
  const [bookingDeal, setBookingDeal] = useState<{ contact_name: string; contact_email: string } | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('filter', filter);
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/followups/queue?${params}`);
      const data = await res.json();
      setQueue(data.queue || []);
      setGrouped(data.grouped || {});
    } catch (err) {
      console.error('[followup queue] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, statusFilter, search]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleSyncCalls = async () => {
    setSyncing(true);
    const toastId = addToast('Syncing Fathom calls & creating deals...', 'loading');
    try {
      const res = await fetch('/api/calls/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const newDeals = data.deals?.created || 0;
        const campaigns = data.deals?.campaigns_generated || 0;
        updateToast(toastId,
          `Synced ${data.inserted || 0} new calls` +
          (newDeals > 0 ? `, created ${newDeals} deals` : '') +
          (campaigns > 0 ? `, generated ${campaigns} campaigns` : ''),
          'success'
        );
        await fetchQueue();
      } else {
        updateToast(toastId, 'Sync failed', 'error');
      }
    } catch {
      updateToast(toastId, 'Sync failed — network error', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveDraft = async (id: number, subject: string, body: string) => {
    await fetch(`/api/followups/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body_plain: body }),
    });
    setQueue(prev => prev.map(q =>
      q.id === id ? { ...q, subject, body_plain: body, mike_edited: true } : q
    ));
  };

  const handleApprove = async (ids: number[], scheduleMap?: Record<number, string>) => {
    await fetch('/api/followups/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_ids: ids, ...(scheduleMap && { schedule_map: scheduleMap }) }),
    });
    setQueue(prev => prev.map(q =>
      ids.includes(q.id) ? { ...q, status: 'approved' } : q
    ));
  };

  const handleReschedule = async (id: number, scheduledAt: string) => {
    await fetch(`/api/followups/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggested_send_time: scheduledAt }),
    });
    setQueue(prev => prev.map(q =>
      q.id === id ? { ...q, suggested_send_time: scheduledAt, scheduled_at: scheduledAt } : q
    ));
  };

  const handleRegenerate = async (id: number) => {
    const res = await fetch('/api/followups/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id: id }),
    });
    if (res.ok) {
      const data = await res.json();
      setQueue(prev => prev.map(q =>
        q.id === id ? { ...q, subject: data.subject, body_plain: data.body, mike_edited: false } : q
      ));
    }
  };

  const handleApproveAll = async () => {
    const draftIds = queue.filter(q => q.status === 'draft').map(q => q.id);
    if (draftIds.length === 0) return;
    setApprovingAll(true);
    const toastId = addToast(`Approving ${draftIds.length} emails...`, 'loading');
    try {
      await handleApprove(draftIds);
      updateToast(toastId, `Approved ${draftIds.length} emails`, 'success');
    } catch {
      updateToast(toastId, 'Approval failed', 'error');
    } finally {
      setApprovingAll(false);
    }
  };

  const handleViewDeal = (dealId: string) => {
    router.push(`/followups/${dealId}`);
  };

  const handleBookCall = (dealId: string) => {
    const item = queue.find(q => q.deal_id === dealId);
    setBookingDealId(dealId);
    setBookingDeal(item ? { contact_name: item.contact_name || '', contact_email: item.contact_email || '' } : null);
  };

  const handleBookingConfirmed = async (booking: BookingResult) => {
    if (!bookingDealId) return;
    try {
      await fetch(`/api/followups/deals/${bookingDealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_touch_due: new Date(booking.starts_at).toISOString() }),
      });
      addToast('Call booked! Next touch date updated.', 'success');
    } catch {
      addToast('Booking saved but failed to update deal', 'error');
    }
    setBookingDealId(null);
    setBookingDeal(null);
  };

  const draftCount = queue.filter(q => q.status === 'draft').length;
  const approvedCount = queue.filter(q => q.status === 'approved').length;
  const sortedDateKeys = Object.keys(grouped).sort();

  const formatDateHeader = (dateKey: string) => {
    if (dateKey === 'unscheduled') return 'Unscheduled';
    const date = new Date(dateKey + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {draftCount > 0 && (
            <span className="text-xs text-gray-400">
              <span className="text-white font-medium">{draftCount}</span> drafts pending
            </span>
          )}
          {approvedCount > 0 && (
            <span className="text-xs text-yellow-400">
              {approvedCount} scheduled
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncCalls}
            disabled={syncing}
            className="flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 disabled:opacity-50 text-purple-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Sync Fathom
          </button>
          {draftCount > 0 && (
            <button
              onClick={handleApproveAll}
              disabled={approvingAll}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs px-4 py-1.5 rounded-lg transition-colors"
            >
              {approvingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Approve All ({draftCount})
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search businesses..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
          {(['all', 'today', 'week', 'overdue'] as FilterMode[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                filter === f ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f === 'today' ? 'Today' : f === 'week' ? 'This Week' : 'Overdue'}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">Drafts + Scheduled</option>
          <option value="draft">Drafts Only</option>
          <option value="approved">Scheduled Only</option>
          <option value="sent">Sent</option>
        </select>
      </div>

      {/* Booking picker modal */}
      {bookingDealId && (
        <div className="bg-gray-900 border border-blue-600/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
              <CalendarPlus className="w-4 h-4" /> Book Follow-Up Call
            </span>
            <button
              onClick={() => { setBookingDealId(null); setBookingDeal(null); }}
              className="text-gray-400 hover:text-white"
            >
              <span className="text-xs">Cancel</span>
            </button>
          </div>
          <TimeSlotPicker
            embedded
            dealId={bookingDealId}
            prefill={{
              name: bookingDeal?.contact_name || '',
              email: bookingDeal?.contact_email || '',
              phone: '',
            }}
            onBooked={handleBookingConfirmed}
            onClose={() => { setBookingDealId(null); setBookingDeal(null); }}
          />
        </div>
      )}

      {/* Queue list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : queue.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-3">
          <p className="text-gray-500">No follow-up emails in queue</p>
          <p className="text-xs text-gray-600">
            Sync your Fathom calls to auto-create deals and generate campaigns
          </p>
          <button
            onClick={handleSyncCalls}
            disabled={syncing}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync Fathom & Create Deals
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDateKeys.map(dateKey => {
            const items = grouped[dateKey] || [];
            if (items.length === 0) return null;

            return (
              <div key={dateKey}>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-300">{formatDateHeader(dateKey)}</span>
                  <span className="text-[10px] text-gray-600">{items.length} email{items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-2">
                  {items.map(item => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      onSave={handleSaveDraft}
                      onApprove={handleApprove}
                      onReschedule={handleReschedule}
                      onRegenerate={handleRegenerate}
                      onViewDeal={handleViewDeal}
                      onBookCall={handleBookCall}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Calendar, Clock, AlertTriangle, CheckCircle, ArrowLeft, ChevronLeft, ChevronRight, Globe } from 'lucide-react';

interface BookingData {
  booking_id: number;
  invitee_name: string;
  invitee_email: string;
  invitee_timezone: string;
  starts_at: string;
  ends_at: string;
  status: string;
  meeting_url: string | null;
  cancel_token: string;
  event_name: string;
  event_slug: string;
  duration_minutes: number;
  location_type: string;
  host_name: string;
  org_name: string;
  org_slug: string;
  logo_url: string | null;
  primary_color: string;
  app_name: string;
  event_type_id: number;
}

interface Slot { start: string; end: string; }

type View = 'options' | 'cancel' | 'reschedule' | 'done';

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function CancelPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get('booking_id');
  const token = searchParams.get('token');

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>('options');
  const [cancelReason, setCancelReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  // Reschedule state
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  useEffect(() => {
    if (!bookingId || !token) { setError('Missing booking information'); setLoading(false); return; }

    fetch(`/api/scheduling/public/booking?booking_id=${bookingId}&token=${token}`)
      .then(res => { if (!res.ok) throw new Error('Booking not found'); return res.json(); })
      .then(data => { setBooking(data); setTimezone(data.invitee_timezone); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  // Fetch slots for reschedule
  useEffect(() => {
    if (!selectedDate || !booking) return;
    setSlotsLoading(true); setSlots([]); setSelectedSlot(null);

    const params = new URLSearchParams({
      event_type_id: String(booking.event_type_id),
      date: selectedDate,
      timezone,
    });

    fetch(`/api/scheduling/slots?${params}`)
      .then(res => res.json())
      .then(data => setSlots(data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, booking, timezone]);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }, [viewMonth]);

  const handleCancel = async () => {
    if (!booking) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/scheduling/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancel_token: booking.cancel_token,
          action: 'cancel',
          reason: cancelReason || undefined,
        }),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error || 'Cancel failed'); }
      setDoneMessage('Your meeting has been cancelled. A notification has been sent to the host.');
      setView('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReschedule = async () => {
    if (!booking || !selectedSlot) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/scheduling/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancel_token: booking.cancel_token,
          action: 'reschedule',
          new_starts_at: selectedSlot.start,
        }),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.error || 'Reschedule failed'); }
      const result = await res.json();
      // If result has a new booking, redirect to confirm
      if (result.new_booking_id && result.new_cancel_token) {
        router.push(`/book/confirm?booking_id=${result.new_booking_id}&token=${result.new_cancel_token}`);
      } else {
        setDoneMessage('Your meeting has been rescheduled. A confirmation email has been sent.');
        setView('done');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Booking Not Found</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const primaryColor = booking.primary_color || '#2563eb';
  const startDate = new Date(booking.starts_at);

  // Already cancelled
  if (booking.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Already Cancelled</h1>
          <p className="text-gray-500">This booking has already been cancelled.</p>
          <a href={`/book/${booking.org_slug}`} className="inline-block mt-4 text-sm text-blue-600 hover:underline">
            Book a new meeting
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* ─── Done view ────────────────────────────────── */}
        {view === 'done' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <CheckCircle className="w-14 h-14 mx-auto mb-4" style={{ color: primaryColor }} />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Done</h1>
            <p className="text-gray-500 mb-6">{doneMessage}</p>
            <a
              href={`/book/${booking.org_slug}`}
              className="inline-block text-sm font-medium py-2.5 px-6 rounded-lg text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Book another meeting
            </a>
          </div>
        )}

        {/* ─── Options view ──────────────────────────────── */}
        {view === 'options' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h1 className="text-xl font-bold text-gray-900 mb-1">Manage Booking</h1>
            <p className="text-gray-500 text-sm mb-6">{booking.event_name} with {booking.host_name}</p>

            {/* Current booking info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4 text-gray-400" />
                {startDate.toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  timeZone: booking.invitee_timezone,
                })}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4 text-gray-400" />
                {formatTime(booking.starts_at, booking.invitee_timezone)} - {formatTime(booking.ends_at, booking.invitee_timezone)}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => setView('reschedule')}
                className="w-full py-2.5 text-sm font-semibold rounded-lg border-2 transition-colors"
                style={{ borderColor: primaryColor, color: primaryColor }}
              >
                Reschedule
              </button>
              <button
                onClick={() => setView('cancel')}
                className="w-full py-2.5 text-sm font-semibold rounded-lg border-2 border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Cancel Meeting
              </button>
            </div>
          </div>
        )}

        {/* ─── Cancel confirmation ─────────────────────── */}
        {view === 'cancel' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <button onClick={() => setView('options')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="text-xl font-bold text-gray-900 mb-4">Cancel Meeting</h1>
            <p className="text-gray-500 text-sm mb-4">
              Are you sure you want to cancel your meeting on{' '}
              {startDate.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
                timeZone: booking.invitee_timezone,
              })} at {formatTime(booking.starts_at, booking.invitee_timezone)}?
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Let us know why you're cancelling..."
              />
            </div>

            <button
              onClick={handleCancel}
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        )}

        {/* ─── Reschedule view ────────────────────────── */}
        {view === 'reschedule' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <button onClick={() => setView('options')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <h1 className="text-lg font-bold text-gray-900 mb-1">Reschedule</h1>
            <p className="text-gray-500 text-sm mb-4">Pick a new date and time</p>

            {/* Timezone */}
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
              <Globe className="w-3.5 h-3.5" />
              {timezone}
            </div>

            <div className="md:flex gap-6">
              {/* Mini calendar */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-900">{MONTH_NAMES[viewMonth]} {viewYear}</h2>
                  <div className="flex gap-1">
                    <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-7 mb-1">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-px">
                  {Array.from({ length: getFirstDayOfWeek(viewYear, viewMonth) }, (_, i) => (
                    <div key={`e-${i}`} className="aspect-square" />
                  ))}
                  {Array.from({ length: getDaysInMonth(viewYear, viewMonth) }, (_, i) => {
                    const d = i + 1;
                    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const today = formatDate(now);
                    const isPast = dateStr < today;
                    const isSelected = dateStr === selectedDate;
                    return (
                      <button
                        key={dateStr}
                        disabled={isPast}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`aspect-square flex items-center justify-center text-xs rounded-lg transition-colors
                          ${isPast ? 'text-gray-300 cursor-not-allowed' : isSelected ? 'text-white font-semibold' : 'text-gray-700 hover:bg-gray-100'}
                        `}
                        style={isSelected ? { backgroundColor: primaryColor } : undefined}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slots */}
              {selectedDate && (
                <div className="mt-4 md:mt-0 md:w-44">
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{selectedDate}</h3>
                  {slotsLoading ? (
                    <div className="flex justify-center py-6">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-xs text-gray-500 py-4">No available times.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {slots.map(slot => {
                        const isSel = selectedSlot?.start === slot.start;
                        return (
                          <button
                            key={slot.start}
                            onClick={() => setSelectedSlot(isSel ? null : slot)}
                            className={`w-full py-2 px-2 text-xs rounded-lg border transition-colors font-medium
                              ${isSel ? 'text-white border-transparent' : 'text-gray-700 border-gray-200 hover:border-gray-400'}
                            `}
                            style={isSel ? { backgroundColor: primaryColor } : undefined}
                          >
                            {formatTime(slot.start, timezone)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedSlot && (
              <button
                onClick={handleReschedule}
                disabled={submitting}
                className="w-full mt-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {submitting ? 'Rescheduling...' : 'Confirm New Time'}
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4 text-xs text-gray-400">
          Powered by {booking.app_name}
        </div>
      </div>
    </div>
  );
}

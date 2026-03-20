'use client';

import { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, Loader2, ChevronLeft, ChevronRight, Check, X, Globe } from 'lucide-react';

interface AvailableSlot {
  start: string;
  end: string;
}

interface EventType {
  event_type_id: number;
  name: string;
  slug: string;
  description?: string | null;
  duration_minutes: number;
  color: string;
  location_type: string;
}

export interface TimeSlotPickerPrefill {
  name?: string;
  email?: string;
  phone?: string;
}

export interface BookingResult {
  booking_id: number;
  meeting_url: string | null;
  cancel_token: string;
  confirmation_page_url: string;
  starts_at: string;
  ends_at: string;
}

interface TimeSlotPickerProps {
  /** When true, renders in compact embedded mode (no page navigation, fires callbacks) */
  embedded?: boolean;
  /** Pre-fill form fields from deal/contact data */
  prefill?: TimeSlotPickerPrefill;
  /** Callback when booking is confirmed in embedded mode */
  onBooked?: (booking: BookingResult) => void;
  /** Callback to close the picker in embedded mode */
  onClose?: () => void;
  /** Specific event type ID to pre-select (skips event type selection) */
  eventTypeId?: number;
  /** Optional deal_id to link booking to a deal */
  dealId?: string;
  /** Additional metadata to include with the booking */
  metadata?: Record<string, unknown>;
}

type Step = 'event' | 'date' | 'time' | 'form' | 'confirmed';

export default function TimeSlotPicker({
  embedded = false,
  prefill,
  onBooked,
  onClose,
  eventTypeId,
  dealId,
  metadata,
}: TimeSlotPickerProps) {
  const [step, setStep] = useState<Step>(eventTypeId ? 'date' : 'event');
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [selectedEventType, setSelectedEventType] = useState<EventType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingEventTypes, setLoadingEventTypes] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState(prefill?.name || '');
  const [email, setEmail] = useState(prefill?.email || '');
  const [phone, setPhone] = useState(prefill?.phone || '');

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  // Load event types
  useEffect(() => {
    if (eventTypeId) {
      // Load specific event type
      setLoadingEventTypes(true);
      fetch(`/api/scheduling/event-types?active=true`)
        .then(r => r.json())
        .then(data => {
          const types = data.event_types || [];
          setEventTypes(types);
          const match = types.find((et: EventType) => et.event_type_id === eventTypeId);
          if (match) {
            setSelectedEventType(match);
            setStep('date');
          }
        })
        .catch(() => setError('Failed to load event types'))
        .finally(() => setLoadingEventTypes(false));
    } else {
      setLoadingEventTypes(true);
      fetch(`/api/scheduling/event-types?active=true`)
        .then(r => r.json())
        .then(data => setEventTypes(data.event_types || []))
        .catch(() => setError('Failed to load event types'))
        .finally(() => setLoadingEventTypes(false));
    }
  }, [eventTypeId]);

  // Fetch slots when date is selected
  useEffect(() => {
    if (!selectedEventType || !selectedDate) return;
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot(null);

    const params = new URLSearchParams({
      event_type_id: String(selectedEventType.event_type_id),
      date: selectedDate,
      timezone,
    });

    fetch(`/api/scheduling/slots?${params}`)
      .then(r => r.json())
      .then(data => setSlots(data.slots || []))
      .catch(() => setError('Failed to load available times'))
      .finally(() => setLoadingSlots(false));
  }, [selectedEventType, selectedDate, timezone]);

  const handleSelectEventType = (et: EventType) => {
    setSelectedEventType(et);
    setStep('date');
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setStep('time');
  };

  const handleSelectSlot = (slot: AvailableSlot) => {
    setSelectedSlot(slot);
    setStep('form');
  };

  const handleBook = async () => {
    if (!selectedSlot || !selectedEventType || !name || !email) return;
    setBooking(true);
    setError(null);

    try {
      const bookingUrl = dealId
        ? '/api/scheduling/book-from-deal'
        : '/api/scheduling/book';

      const body: Record<string, unknown> = {
        event_type_id: selectedEventType.event_type_id,
        starts_at: selectedSlot.start,
        timezone,
        name,
        email,
        ...(phone && { phone }),
        ...(metadata && { metadata }),
      };

      if (dealId) {
        body.deal_id = dealId;
      }

      const res = await fetch(bookingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Booking failed (${res.status})`);
      }

      const result: BookingResult = await res.json();
      setBookingResult(result);
      setStep('confirmed');
      onBooked?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setBooking(false);
    }
  };

  const handleBack = () => {
    if (step === 'time') { setStep('date'); setSelectedSlot(null); }
    else if (step === 'form') setStep('time');
    else if (step === 'date') {
      if (eventTypeId) return; // Can't go back if event type is preset
      setStep('event');
      setSelectedEventType(null);
      setSelectedDate(null);
    }
  };

  // ─── Calendar rendering ───────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const { year, month } = currentMonth;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: Array<{ date: string; dayNum: number; isPast: boolean; isToday: boolean }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        dayNum: d,
        isPast: dateObj < today,
        isToday: dateObj.getTime() === today.getTime(),
      });
    }

    return { firstDay, days };
  }, [currentMonth]);

  const monthLabel = new Date(currentMonth.year, currentMonth.month).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const prevMonth = () => {
    setCurrentMonth(prev => {
      const m = prev.month - 1;
      return m < 0
        ? { year: prev.year - 1, month: 11 }
        : { year: prev.year, month: m };
    });
  };

  const nextMonth = () => {
    setCurrentMonth(prev => {
      const m = prev.month + 1;
      return m > 11
        ? { year: prev.year + 1, month: 0 }
        : { year: prev.year, month: m };
    });
  };

  const formatSlotTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    });
  };

  const formatBookingDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezone,
    });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const wrapperClass = embedded
    ? 'bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'
    : 'bg-gray-900 border border-gray-800 rounded-xl max-w-lg mx-auto overflow-hidden';

  return (
    <div className={wrapperClass}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          {step !== 'event' && step !== 'confirmed' && !(step === 'date' && eventTypeId) && (
            <button onClick={handleBack} className="text-gray-400 hover:text-white p-1">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <Calendar className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-gray-200">
            {step === 'event' && 'Select Meeting Type'}
            {step === 'date' && 'Select Date'}
            {step === 'time' && 'Select Time'}
            {step === 'form' && 'Confirm Details'}
            {step === 'confirmed' && 'Booked!'}
          </span>
        </div>
        {embedded && onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/50">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Step: Event Type Selection */}
      {step === 'event' && (
        <div className="p-4 space-y-2">
          {loadingEventTypes ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
            </div>
          ) : eventTypes.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No event types available</p>
          ) : (
            eventTypes.map(et => (
              <button
                key={et.event_type_id}
                onClick={() => handleSelectEventType(et)}
                className="w-full text-left px-4 py-3 rounded-lg border border-gray-700 hover:border-blue-600/50 hover:bg-gray-800/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: et.color || '#3b82f6' }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-200 group-hover:text-white">
                      {et.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {et.duration_minutes} min · {et.location_type.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Step: Date Selection (Calendar) */}
      {step === 'date' && (
        <div className="p-4">
          {selectedEventType && (
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
              <div className="w-2 h-6 rounded-full" style={{ backgroundColor: selectedEventType.color || '#3b82f6' }} />
              <span className="text-xs text-gray-400">{selectedEventType.name} · {selectedEventType.duration_minutes} min</span>
            </div>
          )}

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="text-gray-400 hover:text-white p-1">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-200">{monthLabel}</span>
            <button onClick={nextMonth} className="text-gray-400 hover:text-white p-1">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} className="text-center text-[10px] text-gray-600 py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before the 1st */}
            {Array.from({ length: calendarDays.firstDay }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {calendarDays.days.map(day => (
              <button
                key={day.date}
                disabled={day.isPast}
                onClick={() => handleSelectDate(day.date)}
                className={`
                  aspect-square flex items-center justify-center rounded-lg text-xs transition-colors
                  ${day.isPast
                    ? 'text-gray-700 cursor-not-allowed'
                    : selectedDate === day.date
                      ? 'bg-blue-600 text-white font-medium'
                      : day.isToday
                        ? 'border border-blue-600/50 text-blue-400 hover:bg-blue-600/20'
                        : 'text-gray-300 hover:bg-gray-800'
                  }
                `}
              >
                {day.dayNum}
              </button>
            ))}
          </div>

          {/* Timezone */}
          <div className="flex items-center gap-1 mt-3 text-[10px] text-gray-600">
            <Globe className="w-3 h-3" />
            {timezone}
          </div>
        </div>
      )}

      {/* Step: Time Slot Selection */}
      {step === 'time' && (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-gray-400">
              {selectedDate && new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </div>

          {loadingSlots ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
            </div>
          ) : slots.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              No available times on this date. Try another day.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {slots.map((slot, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectSlot(slot)}
                  className={`
                    px-3 py-2 rounded-lg text-xs font-medium transition-colors border
                    ${selectedSlot?.start === slot.start
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'border-gray-700 text-gray-300 hover:border-blue-600/50 hover:bg-gray-800'}
                  `}
                >
                  {formatSlotTime(slot.start)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: Booking Form */}
      {step === 'form' && (
        <div className="p-4 space-y-3">
          <div className="bg-gray-800/50 rounded-lg p-3 mb-3">
            <p className="text-xs text-gray-400">
              {selectedEventType?.name} · {selectedEventType?.duration_minutes} min
            </p>
            <p className="text-sm text-gray-200 mt-1">
              {selectedDate && formatBookingDate(selectedSlot!.start)}
            </p>
            <p className="text-sm text-blue-400">
              {selectedSlot && `${formatSlotTime(selectedSlot.start)} — ${formatSlotTime(selectedSlot.end)}`}
            </p>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="Full name"
            />
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="(optional)"
            />
          </div>

          <button
            onClick={handleBook}
            disabled={booking || !name || !email}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors mt-2"
          >
            {booking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            {booking ? 'Booking...' : 'Confirm Booking'}
          </button>
        </div>
      )}

      {/* Step: Confirmation */}
      {step === 'confirmed' && bookingResult && (
        <div className="p-4 text-center space-y-3">
          <div className="w-12 h-12 bg-green-600/20 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Meeting Booked!</p>
            <p className="text-xs text-gray-400 mt-1">
              {formatBookingDate(bookingResult.starts_at)}
            </p>
            <p className="text-xs text-blue-400">
              {formatSlotTime(bookingResult.starts_at)} — {formatSlotTime(bookingResult.ends_at)}
            </p>
          </div>
          {bookingResult.meeting_url && (
            <a
              href={bookingResult.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
            >
              Meeting Link
            </a>
          )}
          {embedded && onClose && (
            <button
              onClick={onClose}
              className="block mx-auto text-xs text-gray-500 hover:text-gray-300 mt-2"
            >
              Close
            </button>
          )}
        </div>
      )}
    </div>
  );
}

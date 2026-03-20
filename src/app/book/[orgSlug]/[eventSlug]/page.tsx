'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Clock, Video, Phone, MapPin, Monitor, ArrowLeft, ChevronLeft, ChevronRight, Globe,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomQuestion {
  type: 'text' | 'textarea' | 'select' | 'radio';
  label: string;
  required: boolean;
  options?: string[];
}

interface EventTypeData {
  event_type_id: number;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  color: string;
  location_type: string;
  custom_questions: CustomQuestion[];
  host_name: string;
  org_name: string;
  logo_url: string | null;
  primary_color: string;
  app_name: string;
}

interface Slot {
  start: string;
  end: string;
}

type Step = 'date' | 'time' | 'form';

const locationIcons: Record<string, typeof Video> = {
  google_meet: Video, zoom: Video, phone: Phone, in_person: MapPin, custom: Monitor,
};

const locationLabels: Record<string, string> = {
  google_meet: 'Google Meet', zoom: 'Zoom', phone: 'Phone Call',
  in_person: 'In Person', custom: 'Custom',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(isoString: string, tz: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: tz,
  });
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function BookEventPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = params.orgSlug as string;
  const eventSlug = params.eventSlug as string;
  const isEmbed = searchParams.get('embed') === 'true';

  // State
  const [eventType, setEventType] = useState<EventTypeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [timezone, setTimezone] = useState(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [showTzDropdown, setShowTzDropdown] = useState(false);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [step, setStep] = useState<Step>('date');
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', answers: {} as Record<string, string>,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Load event type ───────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/scheduling/public/event?org_slug=${encodeURIComponent(orgSlug)}&event_slug=${encodeURIComponent(eventSlug)}`)
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Event type not found' : 'Failed to load');
        return res.json();
      })
      .then(data => {
        setEventType(data);
        // Parse custom_questions if it's a string
        if (typeof data.custom_questions === 'string') {
          data.custom_questions = JSON.parse(data.custom_questions);
        }
        if (!Array.isArray(data.custom_questions)) {
          data.custom_questions = [];
        }
        setEventType(data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [orgSlug, eventSlug]);

  // ─── Fetch slots when date selected ────────────────────────────────────
  useEffect(() => {
    if (!selectedDate || !eventType) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);

    const params = new URLSearchParams({
      event_type_id: String(eventType.event_type_id),
      date: selectedDate,
      timezone,
    });

    fetch(`/api/scheduling/slots?${params}`)
      .then(res => res.json())
      .then(data => setSlots(data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, eventType, timezone]);

  // ─── Calendar navigation ──────────────────────────────────────────────
  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }, [viewMonth]);

  const canGoPrev = useMemo(() => {
    return viewYear > now.getFullYear() || (viewYear === now.getFullYear() && viewMonth > now.getMonth());
  }, [viewYear, viewMonth, now]);

  // ─── Calendar grid ────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
    const today = formatDate(now);
    const days: Array<{ day: number; dateStr: string; isPast: boolean; isToday: boolean }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        dateStr,
        isPast: dateStr < today,
        isToday: dateStr === today,
      });
    }
    return { days, firstDay };
  }, [viewYear, viewMonth, now]);

  // ─── Submit booking ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !eventType) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/scheduling/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type_id: eventType.event_type_id,
          starts_at: selectedSlot.start,
          timezone,
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
          answers: formData.answers,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Booking failed');
      }

      const result = await res.json();

      // In embed mode, post message to parent and navigate with embed param
      if (isEmbed && window.parent !== window) {
        window.parent.postMessage(JSON.stringify({
          type: 'saleshub:booked',
          booking: {
            booking_id: result.booking_id,
            meeting_url: result.meeting_url,
            starts_at: result.starts_at,
            ends_at: result.ends_at,
          },
        }), '*');
      }

      const embedParam = isEmbed ? '&embed=true' : '';
      router.push(`/book/confirm?booking_id=${result.booking_id}&token=${result.cancel_token}${embedParam}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render states ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !eventType) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Not Found</h1>
          <p className="text-gray-500">This event type doesn&apos;t exist or is no longer available.</p>
          <button onClick={() => router.push(`/book/${orgSlug}`)} className="mt-4 text-blue-600 hover:underline text-sm">
            Back to all events
          </button>
        </div>
      </div>
    );
  }

  const primaryColor = eventType.primary_color || '#2563eb';
  const LocationIcon = locationIcons[eventType.location_type] || Monitor;

  return (
    <div className={`min-h-screen ${isEmbed ? 'bg-white' : 'bg-gray-50'}`}>
      <div className={`max-w-4xl mx-auto px-4 ${isEmbed ? 'py-2' : 'py-6 md:py-10'}`}>
        {/* Back link (hidden in embed mode) */}
        {!isEmbed && (
          <button
            onClick={() => router.push(`/book/${orgSlug}`)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> All events
          </button>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="md:flex">
            {/* ─── Left Panel: Event Info ──────────────────────────── */}
            <div className="md:w-72 p-6 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50/50">
              {eventType.logo_url && (
                <img src={eventType.logo_url} alt={eventType.app_name} className="h-8 mb-4 object-contain" />
              )}
              <p className="text-sm text-gray-500 mb-1">{eventType.host_name}</p>
              <h1 className="text-xl font-bold text-gray-900 mb-3">{eventType.name}</h1>
              {eventType.description && (
                <p className="text-sm text-gray-500 mb-4">{eventType.description}</p>
              )}
              <div className="space-y-2 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{eventType.duration_minutes} min</span>
                </div>
                <div className="flex items-center gap-2">
                  <LocationIcon className="w-4 h-4" />
                  <span>{locationLabels[eventType.location_type] || eventType.location_type}</span>
                </div>
                {selectedDate && (
                  <div className="pt-2 border-t border-gray-200 mt-3">
                    <p className="font-medium text-gray-700">{formatDateDisplay(selectedDate)}</p>
                    {selectedSlot && (
                      <p className="text-gray-600 mt-1">
                        {formatTime(selectedSlot.start, timezone)} - {formatTime(selectedSlot.end, timezone)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ─── Right Panel: Booking Flow ──────────────────────── */}
            <div className="flex-1 p-6">
              {/* Timezone selector */}
              <div className="flex justify-end mb-4 relative">
                <button
                  onClick={() => setShowTzDropdown(!showTzDropdown)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {timezone}
                </button>
                {showTzDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-64 overflow-auto w-72">
                    {Intl.supportedValuesOf('timeZone').map(tz => (
                      <button
                        key={tz}
                        onClick={() => { setTimezone(tz); setShowTzDropdown(false); }}
                        className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${tz === timezone ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600'}`}
                      >
                        {tz}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ─── Step: Date + Time ──────────────────────────── */}
              {(step === 'date' || step === 'time') && (
                <div className="md:flex gap-6">
                  {/* Calendar */}
                  <div className={step === 'time' && selectedDate ? 'md:flex-1' : 'w-full'}>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-semibold text-gray-900">
                        {MONTH_NAMES[viewMonth]} {viewYear}
                      </h2>
                      <div className="flex gap-1">
                        <button
                          onClick={prevMonth}
                          disabled={!canGoPrev}
                          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 mb-1">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
                      ))}
                    </div>

                    {/* Day cells */}
                    <div className="grid grid-cols-7 gap-px">
                      {/* Empty cells for offset */}
                      {Array.from({ length: calendarDays.firstDay }, (_, i) => (
                        <div key={`empty-${i}`} className="aspect-square" />
                      ))}
                      {calendarDays.days.map(({ day, dateStr, isPast, isToday }) => {
                        const isSelected = dateStr === selectedDate;
                        return (
                          <button
                            key={dateStr}
                            disabled={isPast}
                            onClick={() => {
                              setSelectedDate(dateStr);
                              setStep('time');
                            }}
                            className={`
                              aspect-square flex items-center justify-center text-sm rounded-lg transition-colors
                              ${isPast
                                ? 'text-gray-300 cursor-not-allowed'
                                : isSelected
                                  ? 'text-white font-semibold'
                                  : isToday
                                    ? 'font-semibold text-gray-900 hover:bg-gray-100 ring-1 ring-inset ring-gray-300'
                                    : 'text-gray-700 hover:bg-gray-100'
                              }
                            `}
                            style={isSelected ? { backgroundColor: primaryColor } : undefined}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time slots */}
                  {step === 'time' && selectedDate && (
                    <div className="mt-6 md:mt-0 md:w-48">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">
                        {formatDateDisplay(selectedDate)}
                      </h3>
                      {slotsLoading ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                        </div>
                      ) : slots.length === 0 ? (
                        <p className="text-sm text-gray-500 py-4">No available times on this date.</p>
                      ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                          {slots.map(slot => {
                            const isSelected = selectedSlot?.start === slot.start;
                            return (
                              <button
                                key={slot.start}
                                onClick={() => {
                                  if (isSelected) {
                                    setStep('form');
                                  } else {
                                    setSelectedSlot(slot);
                                  }
                                }}
                                className={`
                                  w-full py-2.5 px-3 text-sm rounded-lg border transition-colors font-medium
                                  ${isSelected
                                    ? 'text-white border-transparent'
                                    : 'text-gray-700 border-gray-200 hover:border-gray-400'
                                  }
                                `}
                                style={isSelected ? { backgroundColor: primaryColor } : undefined}
                              >
                                {isSelected ? 'Confirm' : formatTime(slot.start, timezone)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─── Step: Booking Form ─────────────────────────── */}
              {step === 'form' && selectedSlot && (
                <div>
                  <button
                    onClick={() => setStep('time')}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>

                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Enter your details</h2>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input
                        id="name"
                        type="text"
                        required
                        value={formData.name}
                        onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Your full name"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        id="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="you@company.com"
                      />
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="(optional)"
                      />
                    </div>

                    {/* Custom questions */}
                    {eventType.custom_questions.map((q, i) => (
                      <div key={i}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {q.label} {q.required && '*'}
                        </label>
                        {q.type === 'text' && (
                          <input
                            type="text"
                            required={q.required}
                            value={formData.answers[q.label] || ''}
                            onChange={e => setFormData(f => ({
                              ...f, answers: { ...f.answers, [q.label]: e.target.value },
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        )}
                        {q.type === 'textarea' && (
                          <textarea
                            required={q.required}
                            rows={3}
                            value={formData.answers[q.label] || ''}
                            onChange={e => setFormData(f => ({
                              ...f, answers: { ...f.answers, [q.label]: e.target.value },
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        )}
                        {q.type === 'select' && (
                          <select
                            required={q.required}
                            value={formData.answers[q.label] || ''}
                            onChange={e => setFormData(f => ({
                              ...f, answers: { ...f.answers, [q.label]: e.target.value },
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select...</option>
                            {q.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        )}
                        {q.type === 'radio' && (
                          <div className="space-y-1.5 mt-1">
                            {q.options?.map(opt => (
                              <label key={opt} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`q-${i}`}
                                  value={opt}
                                  required={q.required}
                                  checked={formData.answers[q.label] === opt}
                                  onChange={() => setFormData(f => ({
                                    ...f, answers: { ...f.answers, [q.label]: opt },
                                  }))}
                                  className="text-blue-600"
                                />
                                {opt}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {submitError && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                        {submitError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-2.5 rounded-lg text-white text-sm font-semibold transition-opacity disabled:opacity-60"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {submitting ? 'Scheduling...' : 'Schedule Meeting'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer (hidden in embed mode) */}
        {!isEmbed && (
          <div className="text-center py-4 text-xs text-gray-400">
            Powered by {eventType.app_name}
          </div>
        )}
      </div>
    </div>
  );
}

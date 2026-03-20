'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, Loader2, MessageCircle, DollarSign, Calendar, HelpCircle, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ─── Brand Constants ─────────────────────────────────────────────────────────
// Shipday brand — org-specific branding loaded from config at runtime

const BRAND = {
  primary: '#00C853',
  primaryDark: '#00A844',
  accent: '#7C3AED',
  accentLight: '#E8F5E9',
  lightBg: '#F9FAFB',
  bodyText: '#6B7280',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface LeadInfo {
  name?: string;
  email?: string;
  company?: string;
}

interface QualificationState {
  orders_per_week?: number;
  aov?: number;
  commission_tier?: number;
  restaurant_type?: string;
  location_count?: number;
  qualified?: boolean;
  stage?: string;
}

// ─── useWindowSize hook ──────────────────────────────────────────────────────

function useWindowSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function update() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    update();
    window.addEventListener('resize', update);
    // Also listen for visualViewport resize (mobile keyboard)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update);
    }
    return () => {
      window.removeEventListener('resize', update);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', update);
      }
    };
  }, []);

  return size;
}

// ─── Chat Avatar Icon ────────────────────────────────────────────────────────

function ChatAvatarIcon() {
  return (
    <div
      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
      style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.accent})` }}
    >
      <MessageCircle className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

// ─── Relative Timestamp ──────────────────────────────────────────────────────

function RelativeTime({ timestamp }: { timestamp: number }) {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    function update() {
      const diff = Date.now() - timestamp;
      if (diff < 60_000) {
        setDisplay('just now');
      } else {
        setDisplay(formatDistanceToNow(timestamp, { addSuffix: true }));
      }
    }
    update();
    const interval = setInterval(update, 30_000); // update every 30s
    return () => clearInterval(interval);
  }, [timestamp]);

  if (!display) return null;
  return (
    <span className="text-[10px] text-gray-400 select-none">{display}</span>
  );
}

// ─── Calendly Widget ────────────────────────────────────────────────────────

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (opts: {
        url: string;
        parentElement: HTMLElement;
        prefill?: { name?: string; email?: string; customAnswers?: Record<string, string> };
      }) => void;
    };
  }
}

// Calendly URL loaded from org config; falls back to empty (hides widget)
const CALENDLY_URL = ''; // Populated per-org via config

function CalendlyInline({
  name, email, company, qualNotes,
}: {
  name?: string; email?: string; company?: string; qualNotes?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const existingScript = document.querySelector('script[src*="calendly.com/assets/external/widget.js"]');
    if (existingScript) {
      initWidget();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://assets.calendly.com/assets/external/widget.js';
    script.async = true;
    script.onload = () => initWidget();
    document.head.appendChild(script);

    if (!document.querySelector('link[href*="calendly.com/assets/external/widget.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://assets.calendly.com/assets/external/widget.css';
      document.head.appendChild(link);
    }

    function initWidget() {
      const tryInit = () => {
        if (window.Calendly && containerRef.current) {
          const customAnswers: Record<string, string> = {};
          if (company) customAnswers.a1 = company;
          if (qualNotes) customAnswers.a2 = qualNotes;

          window.Calendly.initInlineWidget({
            url: `${CALENDLY_URL}?hide_gdpr_banner=1&hide_landing_page_details=1`,
            parentElement: containerRef.current,
            prefill: {
              name: name || undefined,
              email: email || undefined,
              customAnswers: Object.keys(customAnswers).length ? customAnswers : undefined,
            },
          });
          setLoaded(true);
        } else {
          setTimeout(tryInit, 200);
        }
      };
      tryInit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full my-2">
      <div className="bg-white rounded-xl overflow-hidden shadow-sm" style={{ border: `1px solid ${BRAND.primary}33` }}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ background: BRAND.lightBg, borderColor: `${BRAND.primary}22` }}>
          <Calendar className="w-4 h-4" style={{ color: BRAND.primaryDark }} />
          <span className="text-sm font-medium" style={{ color: BRAND.primaryDark }}>Schedule a Demo</span>
        </div>
        {!loaded && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND.primary }} />
            <span className="ml-2 text-sm text-gray-500">Loading calendar...</span>
          </div>
        )}
        <div
          ref={containerRef}
          style={{ minWidth: '100%', height: loaded ? '580px' : '0px' }}
        />
      </div>
    </div>
  );
}

// ─── Built-In Booking Widget (Session 8: replaces Calendly when scheduling_provider = 'built_in') ──

interface BookingSlot {
  start: string;
  end: string;
}

function BuiltInBookingWidget({
  eventSlug, name, email, company,
}: {
  eventSlug?: string; name?: string; email?: string; company?: string;
}) {
  const [eventTypes, setEventTypes] = useState<Array<{ event_type_id: number; name: string; slug: string; duration_minutes: number }>>([]);
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [bookingName, setBookingName] = useState(name || '');
  const [bookingEmail, setBookingEmail] = useState(email || '');
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<{ meeting_url?: string; starts_at?: string } | null>(null);
  const [error, setError] = useState('');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Load event types on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/scheduling/event-types');
        if (!res.ok) return;
        const data = await res.json();
        const types = data.event_types || [];
        setEventTypes(types);
        if (eventSlug) {
          const match = types.find((et: { slug: string }) => et.slug === eventSlug);
          if (match) setSelectedEventTypeId(match.event_type_id);
        } else if (types.length === 1) {
          setSelectedEventTypeId(types[0].event_type_id);
        }
      } catch { /* silent */ }
    })();
  }, [eventSlug]);

  useEffect(() => { if (name) setBookingName(name); }, [name]);
  useEffect(() => { if (email) setBookingEmail(email); }, [email]);

  // Load slots when date + event type changes
  useEffect(() => {
    if (!selectedDate || !selectedEventTypeId) return;
    setLoadingSlots(true);
    setSlots([]);
    setSelectedSlot(null);
    (async () => {
      try {
        const res = await fetch(`/api/scheduling/slots?event_type_id=${selectedEventTypeId}&date=${selectedDate}&timezone=${encodeURIComponent(tz)}`);
        const data = await res.json();
        setSlots(data.slots || []);
      } catch { setSlots([]); }
      finally { setLoadingSlots(false); }
    })();
  }, [selectedDate, selectedEventTypeId, tz]);

  // Default date to tomorrow
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate(tomorrow.toISOString().split('T')[0]);
  }, []);

  const handleBook = async () => {
    if (!selectedSlot || !bookingName || !bookingEmail || !selectedEventTypeId) return;
    setBooking(true);
    setError('');
    try {
      const res = await fetch('/api/scheduling/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type_id: selectedEventTypeId,
          starts_at: selectedSlot.start,
          timezone: tz,
          name: bookingName,
          email: bookingEmail,
          answers: company ? { company } : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBooked({ meeting_url: data.meeting_url, starts_at: selectedSlot.start });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  if (booked) {
    return (
      <div className="bg-white rounded-xl overflow-hidden shadow-sm" style={{ border: `1px solid ${BRAND.primary}33` }}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ background: BRAND.lightBg, borderColor: `${BRAND.primary}22` }}>
          <Calendar className="w-4 h-4" style={{ color: BRAND.primaryDark }} />
          <span className="text-sm font-medium" style={{ color: BRAND.primaryDark }}>Meeting Booked!</span>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-sm text-gray-700">
            Your meeting is confirmed for{' '}
            <strong>{new Date(booked.starts_at!).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>
          </p>
          {booked.meeting_url && (
            <a href={booked.meeting_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline" style={{ color: BRAND.primary }}>
              Join Meeting Link
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm" style={{ border: `1px solid ${BRAND.primary}33` }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ background: BRAND.lightBg, borderColor: `${BRAND.primary}22` }}>
        <Calendar className="w-4 h-4" style={{ color: BRAND.primaryDark }} />
        <span className="text-sm font-medium" style={{ color: BRAND.primaryDark }}>Schedule a Meeting</span>
      </div>
      <div className="p-4 space-y-3">
        {eventTypes.length > 1 && !eventSlug && (
          <select
            value={selectedEventTypeId || ''}
            onChange={(e) => setSelectedEventTypeId(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 text-gray-800"
          >
            <option value="">Select meeting type...</option>
            {eventTypes.map(et => (
              <option key={et.event_type_id} value={et.event_type_id}>
                {et.name} ({et.duration_minutes} min)
              </option>
            ))}
          </select>
        )}

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 text-gray-800"
        />

        {loadingSlots && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: BRAND.primary }} />
            <span className="ml-2 text-sm text-gray-500">Loading times...</span>
          </div>
        )}
        {!loadingSlots && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
            {slots.map((slot) => {
              const time = new Date(slot.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
              const isSelected = selectedSlot?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  onClick={() => setSelectedSlot(slot)}
                  className={`px-2 py-1.5 text-sm rounded-lg border transition-colors ${
                    isSelected ? 'text-white font-medium' : 'text-gray-700 border-gray-200 hover:border-blue-300'
                  }`}
                  style={isSelected ? { background: BRAND.primary, borderColor: BRAND.primary } : undefined}
                >
                  {time}
                </button>
              );
            })}
          </div>
        )}
        {!loadingSlots && selectedDate && selectedEventTypeId && slots.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-2">No available times on this date. Try another day.</p>
        )}

        {selectedSlot && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <input
              type="text"
              placeholder="Your name"
              value={bookingName}
              onChange={(e) => setBookingName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 text-gray-800"
            />
            <input
              type="email"
              placeholder="Your email"
              value={bookingEmail}
              onChange={(e) => setBookingEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 text-gray-800"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={handleBook}
              disabled={booking || !bookingName || !bookingEmail}
              className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: BRAND.primary }}
            >
              {booking ? 'Booking...' : 'Confirm Booking'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Message Renderer (handles [BOOK_DEMO] and [BOOK_MEETING:slug] markers) ─

function AssistantMessage({
  content, leadInfo, qualification, timestamp, schedulingProvider,
}: {
  content: string; leadInfo: LeadInfo; qualification: QualificationState; timestamp: number; schedulingProvider: 'built_in' | 'calendly';
}) {
  // Detect [BOOK_MEETING:slug] marker (Session 8)
  const bookMeetingMatch = content.match(/\[BOOK_MEETING:([^\]]+)\]/);
  // Detect [BOOK_DEMO] marker (legacy Calendly)
  const MARKER = '[BOOK_DEMO]';
  const hasBookDemo = content.includes(MARKER);

  const hasBookingMarker = bookMeetingMatch || hasBookDemo;
  const eventSlug = bookMeetingMatch ? bookMeetingMatch[1] : undefined;

  // Build qualification notes for Calendly pre-fill
  const qualNotes = [
    qualification.orders_per_week && `${qualification.orders_per_week} orders/wk`,
    qualification.aov && `$${qualification.aov} AOV`,
    qualification.commission_tier && `${qualification.commission_tier}% commissions`,
    qualification.restaurant_type,
  ].filter(Boolean).join(', ');

  const prefillNotes = qualNotes ? `Delivery ops eval: ${qualNotes}` : undefined;

  if (!hasBookingMarker) {
    return (
      <div className="flex gap-3 justify-start group">
        <ChatAvatarIcon />
        <div className="flex flex-col gap-1 max-w-[80%]">
          <div
            className="rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed"
            style={{ background: BRAND.lightBg, color: '#1a1a1a' }}
          >
            <div className="whitespace-pre-wrap">{content}</div>
          </div>
          <div className="pl-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <RelativeTime timestamp={timestamp} />
          </div>
        </div>
      </div>
    );
  }

  // Split content around the marker
  const markerFull = bookMeetingMatch ? bookMeetingMatch[0] : MARKER;
  const markerIndex = content.indexOf(markerFull);
  const before = content.slice(0, markerIndex).trim();
  const after = content.slice(markerIndex + markerFull.length).trim();

  // Decide which widget to render: built-in or Calendly
  const useBuiltIn = schedulingProvider === 'built_in' || !!bookMeetingMatch;

  return (
    <div className="space-y-3">
      {before && (
        <div className="flex gap-3 justify-start">
          <ChatAvatarIcon />
          <div
            className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed"
            style={{ background: BRAND.lightBg, color: '#1a1a1a' }}
          >
            <div className="whitespace-pre-wrap">{before}</div>
          </div>
        </div>
      )}
      <div className="pl-10">
        {useBuiltIn ? (
          <BuiltInBookingWidget
            eventSlug={eventSlug}
            name={leadInfo.name}
            email={leadInfo.email}
            company={leadInfo.company}
          />
        ) : (
          <CalendlyInline
            name={leadInfo.name}
            email={leadInfo.email}
            company={leadInfo.company}
            qualNotes={prefillNotes}
          />
        )}
      </div>
      {after && (
        <div className="flex gap-3 justify-start">
          <ChatAvatarIcon />
          <div
            className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed"
            style={{ background: BRAND.lightBg, color: '#1a1a1a' }}
          >
            <div className="whitespace-pre-wrap">{after}</div>
          </div>
        </div>
      )}
      <div className="pl-10">
        <RelativeTime timestamp={timestamp} />
      </div>
    </div>
  );
}

// ─── Typing Indicator ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <ChatAvatarIcon />
      <div className="rounded-2xl rounded-bl-md px-4 py-3" style={{ background: BRAND.lightBg }}>
        <div className="flex gap-1 items-center">
          <div
            className="w-2 h-2 rounded-full animate-bounce"
            style={{ background: BRAND.primary, animationDelay: '0ms', animationDuration: '0.6s' }}
          />
          <div
            className="w-2 h-2 rounded-full animate-bounce"
            style={{ background: BRAND.primary, animationDelay: '150ms', animationDuration: '0.6s' }}
          />
          <div
            className="w-2 h-2 rounded-full animate-bounce"
            style={{ background: BRAND.primary, animationDelay: '300ms', animationDuration: '0.6s' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Starter Prompts ─────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  {
    text: "What is Shipday?",
    icon: Info,
    borderColor: `${BRAND.primary}40`,
    hoverBorder: `${BRAND.primary}80`,
    hoverBg: `${BRAND.primary}10`,
  },
  {
    text: "Can I use Shipday without hiring drivers?",
    icon: HelpCircle,
    borderColor: `${BRAND.primary}40`,
    hoverBorder: `${BRAND.primary}80`,
    hoverBg: `${BRAND.primary}10`,
  },
  {
    text: "What happens when my restaurant misses a phone call?",
    icon: MessageCircle,
    borderColor: `${BRAND.primary}40`,
    hoverBorder: `${BRAND.primary}80`,
    hoverBg: `${BRAND.primary}10`,
  },
  {
    text: "How much am I losing to DoorDash and Uber Eats fees each month?",
    icon: DollarSign,
    borderColor: `${BRAND.primary}40`,
    hoverBorder: `${BRAND.primary}80`,
    hoverBg: `${BRAND.primary}10`,
  },
  {
    text: "How do restaurants keep their DoorDash listings while building direct orders?",
    icon: Calendar,
    borderColor: `${BRAND.primary}40`,
    hoverBorder: `${BRAND.primary}80`,
    hoverBg: `${BRAND.primary}10`,
  },
  {
    text: "How long until Shipday pays for itself?",
    icon: DollarSign,
    borderColor: `${BRAND.primary}40`,
    hoverBorder: `${BRAND.primary}80`,
    hoverBg: `${BRAND.primary}10`,
  },
];

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ProspectChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [leadInfo, setLeadInfo] = useState<LeadInfo>({});
  const [qualification, setQualification] = useState<QualificationState>({});
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [schedulingProvider, setSchedulingProvider] = useState<'built_in' | 'calendly'>('calendly');
  const [campaignContext, setCampaignContext] = useState<Record<string, string> | null>(null);
  const [campaignInitDone, setCampaignInitDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const isMobile = width > 0 && width < 640;
  const searchParams = useSearchParams();

  // ─── Campaign Context from URL params (email → chat handoff) ────────────────
  useEffect(() => {
    if (campaignInitDone) return;
    const src = searchParams.get('src');
    if (src !== 'campaign') return;

    const ctx: Record<string, string> = {};
    for (const key of ['token', 'cid', 'step', 'angle', 'tier', 'lead']) {
      const val = searchParams.get(key);
      if (val) ctx[key] = val;
    }
    if (Object.keys(ctx).length === 0) return;

    setCampaignContext(ctx);
    setCampaignInitDone(true);

    // Auto-send campaign init to get personalized greeting
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/chat/prospect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '__campaign_init__',
            history: [],
            lead_info: {},
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            campaign_context: {
              campaign_template_id: ctx.cid ? parseInt(ctx.cid) : undefined,
              campaign_step: ctx.step ? parseInt(ctx.step) : undefined,
              lead_id: ctx.lead ? parseInt(ctx.lead) : undefined,
              tier: ctx.tier || null,
              angle: ctx.angle || null,
              tracking_token: ctx.token || null,
              source: 'campaign',
            },
          }),
        });
        const data = await res.json();
        if (data.reply) {
          setMessages([{ role: 'assistant', content: data.reply, timestamp: Date.now() }]);
        }
        if (data.detected_info) {
          setLeadInfo(prev => ({ ...prev, ...data.detected_info }));
        }
      } catch (err) {
        console.error('[chat] campaign init error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [searchParams, campaignInitDone]);

  // Load Google Fonts
  useEffect(() => {
    if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Varela+Round"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Varela+Round&family=Epilogue:wght@300;400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  // Mobile viewport height fix — set CSS custom property for dvh equivalent
  useEffect(() => {
    function setVh() {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    }
    setVh();
    window.addEventListener('resize', setVh);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setVh);
    }
    return () => {
      window.removeEventListener('resize', setVh);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setVh);
      }
    };
  }, []);

  // Smooth auto-scroll using IntersectionObserver
  useEffect(() => {
    const endEl = messagesEndRef.current;
    if (!endEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // If the sentinel is already near-visible, scroll down on new messages
        if (!entries[0].isIntersecting) {
          endEl.scrollIntoView({ behavior: 'smooth' });
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    );

    observer.observe(endEl);
    return () => observer.disconnect();
  }, [messages, loading]); // re-observe when messages change

  // Always scroll on new message or loading change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);
    setSuggestedPrompts([]);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const historyToSend = messages.slice(-19).map(m => ({
        role: m.role,
        content: m.content.replace(/\[BOOK_DEMO\]/g, '').replace(/\[BOOK_MEETING:[^\]]+\]/g, '').trim(),
      }));
      const res = await fetch('/api/chat/prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyToSend,
          lead_info: leadInfo,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(campaignContext && {
            campaign_context: {
              campaign_template_id: campaignContext.cid ? parseInt(campaignContext.cid) : undefined,
              campaign_step: campaignContext.step ? parseInt(campaignContext.step) : undefined,
              lead_id: campaignContext.lead ? parseInt(campaignContext.lead) : undefined,
              tier: campaignContext.tier || null,
              angle: campaignContext.angle || null,
              tracking_token: campaignContext.token || null,
              source: 'campaign',
            },
          }),
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.detected_info) {
        setLeadInfo(prev => ({ ...prev, ...data.detected_info }));
      }

      if (data.qualification) {
        setQualification(prev => ({ ...prev, ...data.qualification }));
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, timestamp: Date.now() }]);

      if (data.suggested_prompts && Array.isArray(data.suggested_prompts)) {
        setSuggestedPrompts(data.suggested_prompts);
      }

      // Session 8: Pick up scheduling_provider from API response
      if (data.scheduling_provider) {
        setSchedulingProvider(data.scheduling_provider);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: "I'm sorry, I had trouble processing that. Could you try again?",
          timestamp: Date.now(),
        },
      ]);
      console.error('[chat] error:', err);
    } finally {
      setLoading(false);
      // Refocus input on mobile after response
      if (isMobile) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  }, [messages, loading, leadInfo, isMobile, campaignContext]);

  const handleSend = () => {
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStarterClick = (prompt: string) => {
    sendMessage(prompt);
  };

  const hasMessages = messages.length > 0;

  return (
    <div
      className="flex flex-col bg-white"
      style={{
        fontFamily: "'Epilogue', sans-serif",
        height: 'var(--app-vh, 100vh)',
      }}
    >
      {/* Header */}
      <header className="border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold" style={{ color: BRAND.primaryDark }}>Sales Chat</span>
        </div>
      </header>

      {/* Chat Area */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {!hasMessages ? (
          /* Welcome Screen */
          <div className="flex flex-col items-center justify-center h-full px-4 py-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
              style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.accentLight})` }}
            >
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <h2
              className="text-xl font-semibold mb-2 text-center"
              style={{ color: BRAND.primaryDark, fontFamily: "'Varela Round', sans-serif" }}
            >
              Hey there
            </h2>
            <p className="text-sm mb-8 text-center max-w-md" style={{ color: BRAND.bodyText }}>
              I&apos;m here to help you explore how our platform can drive growth for your business.
              Ask me anything or pick a topic below.
            </p>

            {/* Starter Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-2xl">
              {STARTER_PROMPTS.map((prompt) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.text}
                    onClick={() => handleStarterClick(prompt.text)}
                    className="flex items-start gap-3 p-3 sm:p-4 rounded-xl text-left transition-all duration-200 group min-h-[44px]"
                    style={{ border: `1px solid ${prompt.borderColor}` }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = prompt.hoverBorder;
                      e.currentTarget.style.background = prompt.hoverBg;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = prompt.borderColor;
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: BRAND.bodyText }} />
                    <span className="text-sm" style={{ color: '#374151' }}>
                      {prompt.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            {messages.map((msg, i) => (
              msg.role === 'user' ? (
                <div key={i} className="flex flex-col items-end gap-1 group">
                  <div
                    className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed text-white"
                    style={{ background: BRAND.primaryDark }}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  <div className="pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <RelativeTime timestamp={msg.timestamp} />
                  </div>
                </div>
              ) : (
                <AssistantMessage
                  key={i}
                  content={msg.content}
                  leadInfo={leadInfo}
                  qualification={qualification}
                  timestamp={msg.timestamp}
                  schedulingProvider={schedulingProvider}
                />
              )
            ))}
            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} className="h-1" />
          </div>
        )}
      </div>

      {/* Input Bar — fixed at bottom, respects mobile keyboard */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0 z-10">
        <div className="max-w-2xl mx-auto">
          {/* Contextual Quick-Reply Prompts */}
          {suggestedPrompts.length > 0 && !loading && (
            <div className="flex flex-wrap gap-2 mb-2.5">
              {suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  className="text-xs px-3 py-1.5 rounded-full transition-all duration-200 cursor-pointer"
                  style={{
                    color: BRAND.primaryDark,
                    background: 'white',
                    border: `1px solid ${BRAND.primary}40`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${BRAND.primary}12`;
                    e.currentTarget.style.borderColor = `${BRAND.primary}80`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = `${BRAND.primary}40`;
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isMobile ? "Ask a question..." : "Ask about our platform, pricing, or how we can help..."}
              rows={1}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none"
              style={{
                maxHeight: '120px',
                fontFamily: "'Epilogue', sans-serif",
                fontSize: '16px', // Prevents iOS zoom on focus
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 2px ${BRAND.primary}50`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="disabled:opacity-40 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-colors shrink-0"
              style={{ background: BRAND.primaryDark }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.background = '#1e4a0c';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = BRAND.primaryDark;
              }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-gray-400">
              Powered by Shipday
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

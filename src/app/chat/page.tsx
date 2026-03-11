'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, MessageCircle, DollarSign, Calendar, Truck, HelpCircle, Phone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ─── Brand Constants ─────────────────────────────────────────────────────────

const BRAND = {
  green: '#173308',
  teal: '#34C896',
  lime: '#9EE870',
  cyan: '#8FEAFF',
  lightGreen: '#f3f8f5',
  bodyText: '#5F6368',
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

// ─── Shipday Logo ────────────────────────────────────────────────────────────

function ShipdayLogo({ className = '' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="https://cdn.prod.website-files.com/62428b049409c6b74b6b6636/65f48b763da99591f7eb8414_Shipday%20logo.svg"
      alt="Shipday"
      className={className}
      style={{ height: '22px', width: 'auto' }}
    />
  );
}

// ─── Shipday Avatar Icon ─────────────────────────────────────────────────────

function ShipdayIcon() {
  return (
    <div
      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
      style={{ background: `linear-gradient(135deg, ${BRAND.teal}, ${BRAND.lime})` }}
    >
      <Truck className="w-3.5 h-3.5 text-white" />
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

const CALENDLY_URL = 'https://calendly.com/mike-paulus-shipday';

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
      <div className="bg-white rounded-xl overflow-hidden shadow-sm" style={{ border: `1px solid ${BRAND.teal}33` }}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ background: BRAND.lightGreen, borderColor: `${BRAND.teal}22` }}>
          <Calendar className="w-4 h-4" style={{ color: BRAND.green }} />
          <span className="text-sm font-medium" style={{ color: BRAND.green }}>Pick a time with Mike</span>
        </div>
        {!loaded && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND.teal }} />
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

// ─── Message Renderer (handles [BOOK_DEMO] marker) ──────────────────────────

function AssistantMessage({
  content, leadInfo, qualification, timestamp,
}: {
  content: string; leadInfo: LeadInfo; qualification: QualificationState; timestamp: number;
}) {
  const MARKER = '[BOOK_DEMO]';
  const markerIndex = content.indexOf(MARKER);

  // Build qualification notes for Calendly pre-fill
  const qualNotes = [
    qualification.orders_per_week && `${qualification.orders_per_week} orders/wk`,
    qualification.aov && `$${qualification.aov} AOV`,
    qualification.commission_tier && `${qualification.commission_tier}% commissions`,
    qualification.restaurant_type,
  ].filter(Boolean).join(', ');

  const prefillNotes = qualNotes ? `Delivery ops eval: ${qualNotes}` : undefined;

  if (markerIndex === -1) {
    return (
      <div className="flex gap-3 justify-start group">
        <ShipdayIcon />
        <div className="flex flex-col gap-1 max-w-[80%]">
          <div
            className="rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed"
            style={{ background: BRAND.lightGreen, color: '#1a1a1a' }}
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

  const before = content.slice(0, markerIndex).trim();
  const after = content.slice(markerIndex + MARKER.length).trim();

  return (
    <div className="space-y-3">
      {before && (
        <div className="flex gap-3 justify-start">
          <ShipdayIcon />
          <div
            className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed"
            style={{ background: BRAND.lightGreen, color: '#1a1a1a' }}
          >
            <div className="whitespace-pre-wrap">{before}</div>
          </div>
        </div>
      )}
      <div className="pl-10">
        <CalendlyInline
          name={leadInfo.name}
          email={leadInfo.email}
          company={leadInfo.company}
          qualNotes={prefillNotes}
        />
      </div>
      {after && (
        <div className="flex gap-3 justify-start">
          <ShipdayIcon />
          <div
            className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed"
            style={{ background: BRAND.lightGreen, color: '#1a1a1a' }}
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
      <ShipdayIcon />
      <div className="rounded-2xl rounded-bl-md px-4 py-3" style={{ background: BRAND.lightGreen }}>
        <div className="flex gap-1 items-center">
          <div
            className="w-2 h-2 rounded-full animate-bounce"
            style={{ background: BRAND.teal, animationDelay: '0ms', animationDuration: '0.6s' }}
          />
          <div
            className="w-2 h-2 rounded-full animate-bounce"
            style={{ background: BRAND.teal, animationDelay: '150ms', animationDuration: '0.6s' }}
          />
          <div
            className="w-2 h-2 rounded-full animate-bounce"
            style={{ background: BRAND.teal, animationDelay: '300ms', animationDuration: '0.6s' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Starter Prompts ─────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  {
    text: "We miss phone orders during the lunch rush",
    icon: Phone,
    borderColor: `${BRAND.lime}50`,
    hoverBorder: `${BRAND.lime}90`,
    hoverBg: `${BRAND.lime}10`,
  },
  {
    text: "How can I get more repeat customers?",
    icon: MessageCircle,
    borderColor: '#e879f940',
    hoverBorder: '#e879f980',
    hoverBg: '#e879f910',
  },
  {
    text: "Tell me about the AI Receptionist",
    icon: HelpCircle,
    borderColor: `${BRAND.teal}40`,
    hoverBorder: `${BRAND.teal}80`,
    hoverBg: `${BRAND.teal}10`,
  },
  {
    text: "DoorDash commissions are eating our margins",
    icon: DollarSign,
    borderColor: '#f97316',
    hoverBorder: '#fb923c',
    hoverBg: '#f9731610',
  },
  {
    text: "What is Shipday?",
    icon: Truck,
    borderColor: `${BRAND.cyan}60`,
    hoverBorder: `${BRAND.cyan}A0`,
    hoverBg: `${BRAND.cyan}10`,
  },
  {
    text: "Our Google reviews need help",
    icon: Calendar,
    borderColor: '#60a5fa40',
    hoverBorder: '#60a5fa80',
    hoverBg: '#60a5fa10',
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const isMobile = width > 0 && width < 640;

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
        content: m.content.replace(/\[BOOK_DEMO\]/g, '').trim(),
      }));
      const res = await fetch('/api/chat/prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyToSend,
          lead_info: leadInfo,
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
  }, [messages, loading, leadInfo, isMobile]);

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
          <ShipdayLogo />
        </div>
        <a
          href="https://calendly.com/mike-paulus-shipday"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-200"
          style={{
            color: BRAND.green,
            background: BRAND.lightGreen,
            border: `1px solid ${BRAND.teal}30`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${BRAND.teal}20`;
            e.currentTarget.style.borderColor = `${BRAND.teal}60`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = BRAND.lightGreen;
            e.currentTarget.style.borderColor = `${BRAND.teal}30`;
          }}
        >
          <Calendar className="w-3 h-3" />
          Book a Demo
        </a>
      </header>

      {/* Chat Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain">
        {!hasMessages ? (
          /* Welcome Screen */
          <div className="flex flex-col items-center justify-center h-full px-4 py-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
              style={{ background: `linear-gradient(135deg, ${BRAND.teal}, ${BRAND.lime})` }}
            >
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <h2
              className="text-xl font-semibold mb-2 text-center"
              style={{ color: BRAND.green, fontFamily: "'Varela Round', sans-serif" }}
            >
              Tired of losing money on delivery commissions?
            </h2>
            <p className="text-sm mb-8 text-center max-w-md" style={{ color: BRAND.bodyText }}>
              I help restaurants calculate exactly how much they&apos;re losing to DoorDash
              and UberEats — and show how to keep that money. Let&apos;s look at your numbers.
            </p>

            {/* Starter Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-2xl">
              {STARTER_PROMPTS.map((prompt) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.text}
                    onClick={() => handleStarterClick(prompt.text)}
                    className="flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-200 group"
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
                    style={{ background: BRAND.green }}
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
                    color: BRAND.green,
                    background: 'white',
                    border: `1px solid ${BRAND.teal}40`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${BRAND.teal}12`;
                    e.currentTarget.style.borderColor = `${BRAND.teal}80`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = `${BRAND.teal}40`;
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
              placeholder={isMobile ? "Ask about delivery savings..." : "Ask about delivery management, pricing, savings..."}
              rows={1}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent resize-none"
              style={{
                maxHeight: '120px',
                fontFamily: "'Epilogue', sans-serif",
                fontSize: '16px', // Prevents iOS zoom on focus
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 2px ${BRAND.teal}50`;
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
              style={{ background: BRAND.green }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.background = '#1e4a0c';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = BRAND.green;
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
            <a
              href="https://calendly.com/mike-paulus-shipday"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] sm:hidden"
              style={{ color: BRAND.teal }}
            >
              Book a demo with Mike
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

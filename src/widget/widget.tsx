/**
 * SalesHub Embeddable Chat Widget
 *
 * Drop-in script for any website:
 *   <script src="https://your-saleshub.com/widget/embed.js"
 *     data-org-slug="shipday"
 *     data-accent-color="#00C853"
 *     data-position="bottom-right"
 *     data-greeting="Hi there! How can I help?"
 *   ></script>
 *
 * Uses Shadow DOM to avoid CSS conflicts with host pages.
 * Session persistence via localStorage.
 * Captures referrer, UTM params, and page URL for visitor tracking.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WidgetConfig {
  orgSlug: string;
  accentColor: string;
  position: 'bottom-right' | 'bottom-left';
  greeting: string;
  apiBase: string;
}

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

interface SessionData {
  messages: ChatMessage[];
  leadInfo: LeadInfo;
  sessionId: string;
}

// ─── Utility: Parse UTM params ──────────────────────────────────────────────

function getVisitorContext() {
  const params = new URLSearchParams(window.location.search);
  return {
    page_url: window.location.href,
    referrer_url: document.referrer || undefined,
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_term: params.get('utm_term') || undefined,
    utm_content: params.get('utm_content') || undefined,
  };
}

function getCampaignContext(): Record<string, string> | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('src') !== 'campaign') return null;
  const ctx: Record<string, string> = {};
  for (const key of ['token', 'cid', 'step', 'angle', 'tier', 'lead']) {
    const val = params.get(key);
    if (val) ctx[key] = val;
  }
  return Object.keys(ctx).length > 0 ? ctx : null;
}

// ─── Utility: Session persistence ───────────────────────────────────────────

const STORAGE_KEY = 'saleshub_widget_session';

function loadSession(orgSlug: string): SessionData | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${orgSlug}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionData & { expiresAt?: number };
    // Expire sessions after 24 hours
    if (data.expiresAt && data.expiresAt < Date.now()) {
      localStorage.removeItem(`${STORAGE_KEY}_${orgSlug}`);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveSession(orgSlug: string, data: SessionData) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${orgSlug}`, JSON.stringify({
      ...data,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    }));
  } catch {
    // localStorage may be full or unavailable
  }
}

function generateSessionId() {
  return 'w_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Color utilities ────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 37, g: 99, b: 235 };
}

function darken(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

function lighten(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * amount)}, ${Math.round(g + (255 - g) * amount)}, ${Math.round(b + (255 - b) * amount)})`;
}

// ─── SVG Icons (inline to avoid dependencies) ──────────────────────────────

function MessageIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
    </svg>
  );
}

function ShipdayIcon() {
  return (
    <svg width="20" height="22" viewBox="0 0 24 27" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M11.2 0.2L0.8 6.2C0.3 6.5 0 7 0 7.6V19.5C0 20.1 0.3 20.6 0.8 20.9L11.2 26.9C11.7 27.2 12.3 27.2 12.8 26.9L23.2 20.9C23.7 20.6 24 20.1 24 19.5V7.6C24 7 23.7 6.5 23.2 6.2L12.8 0.2C12.3-0.1 11.7-0.1 11.2 0.2ZM12 3.4L20.8 8.5V18.6L12 23.7V3.4Z" fill="white"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

// ─── Widget Styles (injected into Shadow DOM) ──────────────────────────────

function getWidgetStyles(accent: string) {
  const dark = darken(accent, 0.2);
  const light = lighten(accent, 0.9);
  const veryLight = lighten(accent, 0.95);

  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :host {
      all: initial;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1a1a1a;
    }

    .sh-widget-container {
      position: fixed;
      z-index: 2147483647;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .sh-widget-container.bottom-right {
      bottom: 20px;
      right: 20px;
    }

    .sh-widget-container.bottom-left {
      bottom: 20px;
      left: 20px;
    }

    /* ── Bubble Button ── */
    .sh-bubble {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${accent}, ${dark});
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1);
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      position: relative;
    }

    .sh-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(0,0,0,0.2), 0 3px 6px rgba(0,0,0,0.12);
      background: linear-gradient(135deg, ${dark}, ${accent});
    }

    .sh-bubble:active {
      transform: scale(0.95);
    }

    .sh-bubble .sh-pulse {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: ${accent};
      opacity: 0;
      animation: sh-pulse-ring 2s ease-out infinite;
    }

    @keyframes sh-pulse-ring {
      0% { transform: scale(1); opacity: 0.4; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    /* ── Chat Window ── */
    .sh-chat-window {
      position: absolute;
      bottom: 72px;
      width: 380px;
      max-height: 560px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform-origin: bottom right;
      animation: sh-slide-up 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .bottom-right .sh-chat-window {
      right: 0;
      transform-origin: bottom right;
    }

    .bottom-left .sh-chat-window {
      left: 0;
      transform-origin: bottom left;
    }

    .sh-chat-window.sh-closing {
      animation: sh-slide-down 0.2s ease-in forwards;
    }

    @keyframes sh-slide-up {
      from { opacity: 0; transform: scale(0.8) translateY(20px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    @keyframes sh-slide-down {
      from { opacity: 1; transform: scale(1) translateY(0); }
      to { opacity: 0; transform: scale(0.8) translateY(20px); }
    }

    /* ── Header ── */
    .sh-header {
      background: linear-gradient(135deg, ${accent}, ${dark});
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .sh-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sh-header-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sh-header-text h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
      line-height: 1.2;
    }

    .sh-header-text p {
      font-size: 12px;
      opacity: 0.85;
      margin: 0;
      line-height: 1.3;
    }

    .sh-header-actions {
      display: flex;
      gap: 4px;
    }

    .sh-header-btn {
      background: rgba(255,255,255,0.15);
      border: none;
      border-radius: 8px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: white;
      transition: background 0.15s;
    }

    .sh-header-btn:hover {
      background: rgba(255,255,255,0.25);
    }

    /* ── Messages Area ── */
    .sh-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 200px;
      max-height: 360px;
      scroll-behavior: smooth;
    }

    .sh-messages::-webkit-scrollbar {
      width: 4px;
    }

    .sh-messages::-webkit-scrollbar-track {
      background: transparent;
    }

    .sh-messages::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 2px;
    }

    /* ── Message Bubbles ── */
    .sh-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
      white-space: pre-wrap;
      animation: sh-msg-appear 0.2s ease-out;
    }

    @keyframes sh-msg-appear {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .sh-msg-user {
      align-self: flex-end;
      background: ${accent};
      color: white;
      border-bottom-right-radius: 4px;
    }

    .sh-msg-assistant {
      align-self: flex-start;
      background: #F9FAFB;
      color: #111827;
      border-bottom-left-radius: 4px;
    }

    /* ── Typing Indicator ── */
    .sh-typing {
      align-self: flex-start;
      display: flex;
      gap: 4px;
      padding: 12px 16px;
      background: #F9FAFB;
      border-radius: 16px;
      border-bottom-left-radius: 4px;
    }

    .sh-typing-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #00C853;
      opacity: 0.5;
      animation: sh-bounce 0.6s infinite;
    }

    .sh-typing-dot:nth-child(2) { animation-delay: 0.15s; }
    .sh-typing-dot:nth-child(3) { animation-delay: 0.3s; }

    @keyframes sh-bounce {
      0%, 100% { transform: translateY(0); opacity: 0.5; }
      50% { transform: translateY(-4px); opacity: 1; }
    }

    /* ── Welcome State ── */
    .sh-welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
      text-align: center;
      flex: 1;
    }

    .sh-welcome-icon {
      width: 48px;
      height: 48px;
      border-radius: 16px;
      background: linear-gradient(135deg, #00C853, #00A844);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
      color: white;
    }

    .sh-welcome h4 {
      font-size: 16px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 8px 0;
    }

    .sh-welcome p {
      font-size: 13px;
      color: #6b7280;
      margin: 0 0 20px 0;
      line-height: 1.5;
    }

    .sh-starters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      width: 100%;
      justify-content: center;
    }

    .sh-starter-btn {
      background: #E8F5E9;
      border: 1px solid rgba(0,200,83,0.25);
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      color: #111827;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
      font-family: inherit;
      min-height: 44px;
    }

    .sh-starter-btn:hover {
      border-color: ${accent};
      background: rgba(0,200,83,0.12);
      color: #111827;
    }

    /* ── Suggested Prompts ── */
    .sh-suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 16px 8px;
    }

    .sh-suggestion-btn {
      background: #E8F5E9;
      border: 1px solid rgba(0,200,83,0.25);
      border-radius: 20px;
      padding: 5px 12px;
      font-size: 12px;
      color: #00A844;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
      font-weight: 500;
    }

    .sh-suggestion-btn:hover {
      background: rgba(0,200,83,0.12);
      border-color: ${accent};
    }

    /* ── Input Area ── */
    .sh-input-area {
      padding: 12px 16px;
      border-top: 1px solid #E5E7EB;
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-shrink: 0;
    }

    .sh-input {
      flex: 1;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 14px;
      font-family: inherit;
      resize: none;
      outline: none;
      max-height: 100px;
      line-height: 1.4;
      transition: border-color 0.15s;
      color: #1a1a1a;
      background: #fafafa;
    }

    .sh-input::placeholder {
      color: #9ca3af;
    }

    .sh-input:focus {
      border-color: ${accent};
      background: white;
      box-shadow: 0 0 0 2px ${lighten(accent, 0.8)};
    }

    .sh-send-btn {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: ${accent};
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s, opacity 0.15s;
    }

    .sh-send-btn:hover {
      background: ${dark};
    }

    .sh-send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .sh-powered {
      text-align: center;
      padding: 4px 0 8px;
      font-size: 10px;
      color: #6B7280;
    }

    /* ── Loader ── */
    .sh-loader {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: sh-spin 0.6s linear infinite;
    }

    @keyframes sh-spin {
      to { transform: rotate(360deg); }
    }

    /* ── Mobile Full-Screen ── */
    @media (max-width: 480px) {
      .sh-chat-window {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-height: 100%;
        border-radius: 0;
        animation: sh-mobile-up 0.3s ease-out;
      }

      .sh-chat-window.sh-closing {
        animation: sh-mobile-down 0.2s ease-in forwards;
      }

      @keyframes sh-mobile-up {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }

      @keyframes sh-mobile-down {
        from { transform: translateY(0); }
        to { transform: translateY(100%); }
      }

      .sh-messages {
        max-height: none;
        flex: 1;
      }

      .sh-bubble {
        width: 54px;
        height: 54px;
      }
    }
  `;
}

// ─── Starter Prompts ────────────────────────────────────────────────────────

const DEFAULT_STARTERS = [
  'How much am I losing to DoorDash and Uber Eats fees each month?',
  'What would it cost me to run my own delivery channel?',
  'How do restaurants keep their DoorDash listings while building direct orders?',
  'What happens when my restaurant misses a phone call?',
  'How long until Shipday pays for itself?',
  'Can I use Shipday without hiring drivers?',
];

// ─── Main Widget Component ──────────────────────────────────────────────────

function ChatWidget({ config }: { config: WidgetConfig }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [leadInfo, setLeadInfo] = useState<LeadInfo>({});
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [sessionId] = useState(() => {
    const existing = loadSession(config.orgSlug);
    return existing?.sessionId || generateSessionId();
  });
  const [showPulse, setShowPulse] = useState(true);
  const [campaignCtx] = useState(() => getCampaignContext());
  const [campaignInitDone, setCampaignInitDone] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const visitorContext = useRef(getVisitorContext());

  // Restore session on mount
  useEffect(() => {
    const existing = loadSession(config.orgSlug);
    if (existing) {
      setMessages(existing.messages);
      setLeadInfo(existing.leadInfo);
    }
  }, [config.orgSlug]);

  // Campaign context: auto-open widget and send init message
  useEffect(() => {
    if (!campaignCtx || campaignInitDone) return;
    setCampaignInitDone(true);
    setIsOpen(true);
    setShowPulse(false);

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${config.apiBase}/api/chat/prospect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '__campaign_init__',
            history: [],
            lead_info: {},
            org_slug: config.orgSlug,
            visitor_context: visitorContext.current,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            campaign_context: {
              campaign_template_id: campaignCtx.cid ? parseInt(campaignCtx.cid) : undefined,
              campaign_step: campaignCtx.step ? parseInt(campaignCtx.step) : undefined,
              lead_id: campaignCtx.lead ? parseInt(campaignCtx.lead) : undefined,
              tier: campaignCtx.tier || null,
              angle: campaignCtx.angle || null,
              tracking_token: campaignCtx.token || null,
              source: 'campaign',
            },
          }),
        });
        const data = await res.json();
        if (data.reply) {
          const cleanReply = (data.reply as string).replace(/\[BOOK_DEMO\]/g, '').trim();
          setMessages([{ role: 'assistant', content: cleanReply, timestamp: Date.now() }]);
        }
        if (data.detected_info) {
          setLeadInfo(prev => ({ ...prev, ...data.detected_info }));
        }
      } catch (err) {
        console.error('[SalesHub Widget] campaign init error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [campaignCtx, campaignInitDone, config.apiBase, config.orgSlug]);

  // Persist session on change
  useEffect(() => {
    if (messages.length > 0) {
      saveSession(config.orgSlug, { messages, leadInfo, sessionId });
    }
  }, [messages, leadInfo, sessionId, config.orgSlug]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Stop pulse after first open
  useEffect(() => {
    if (isOpen) setShowPulse(false);
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setIsClosing(false);
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 200);
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);
    setSuggestedPrompts([]);

    try {
      const historyToSend = messages.slice(-19).map(m => ({
        role: m.role,
        content: m.content.replace(/\[BOOK_DEMO\]/g, '').trim(),
      }));

      const res = await fetch(`${config.apiBase}/api/chat/prospect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyToSend,
          lead_info: leadInfo,
          org_slug: config.orgSlug,
          visitor_context: visitorContext.current,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(campaignCtx && {
            campaign_context: {
              campaign_template_id: campaignCtx.cid ? parseInt(campaignCtx.cid) : undefined,
              campaign_step: campaignCtx.step ? parseInt(campaignCtx.step) : undefined,
              lead_id: campaignCtx.lead ? parseInt(campaignCtx.lead) : undefined,
              tier: campaignCtx.tier || null,
              angle: campaignCtx.angle || null,
              tracking_token: campaignCtx.token || null,
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

      // Strip [BOOK_DEMO] markers from widget display — no inline Calendly in widget
      const cleanReply = (data.reply as string).replace(/\[BOOK_DEMO\]/g, '').trim();
      setMessages(prev => [...prev, { role: 'assistant', content: cleanReply, timestamp: Date.now() }]);

      if (data.suggested_prompts && Array.isArray(data.suggested_prompts)) {
        setSuggestedPrompts(data.suggested_prompts);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm sorry, I had trouble processing that. Could you try again?",
        timestamp: Date.now(),
      }]);
      console.error('[SalesHub Widget] error:', err);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, leadInfo, config.apiBase, config.orgSlug, campaignCtx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className={`sh-widget-container ${config.position}`}>
      {/* Chat Window */}
      {isOpen && (
        <div className={`sh-chat-window ${isClosing ? 'sh-closing' : ''}`}>
          {/* Header */}
          <div className="sh-header">
            <div className="sh-header-info">
              <div className="sh-header-avatar">
                <ShipdayIcon />
              </div>
              <div className="sh-header-text">
                <h3>Shipday</h3>
                <p>Typically replies instantly</p>
              </div>
            </div>
            <div className="sh-header-actions">
              <button className="sh-header-btn" onClick={handleClose} title="Minimize">
                <MinimizeIcon />
              </button>
              <button className="sh-header-btn" onClick={handleClose} title="Close">
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* Messages or Welcome */}
          {!hasMessages ? (
            <div className="sh-welcome">
              <div className="sh-welcome-icon">
                <ShipdayIcon />
              </div>
              <h4>Hey there</h4>
              <p>{config.greeting}</p>
              <div className="sh-starters">
                {DEFAULT_STARTERS.map(text => (
                  <button
                    key={text}
                    className="sh-starter-btn"
                    onClick={() => sendMessage(text)}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="sh-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`sh-msg ${msg.role === 'user' ? 'sh-msg-user' : 'sh-msg-assistant'}`}>
                  {msg.content}
                </div>
              ))}
              {loading && (
                <div className="sh-typing">
                  <div className="sh-typing-dot" />
                  <div className="sh-typing-dot" />
                  <div className="sh-typing-dot" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Suggested Prompts */}
          {suggestedPrompts.length > 0 && !loading && (
            <div className="sh-suggestions">
              {suggestedPrompts.map((prompt, i) => (
                <button key={i} className="sh-suggestion-btn" onClick={() => sendMessage(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="sh-input-area">
            <textarea
              ref={inputRef}
              className="sh-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 100) + 'px';
              }}
            />
            <button
              className="sh-send-btn"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
            >
              {loading ? <div className="sh-loader" /> : <SendIcon />}
            </button>
          </div>
          <div className="sh-powered">Powered by Shipday</div>
        </div>
      )}

      {/* Floating Bubble */}
      {!isOpen && (
        <button className="sh-bubble" onClick={handleOpen} aria-label="Open chat">
          {showPulse && <span className="sh-pulse" />}
          <ShipdayIcon />
        </button>
      )}
    </div>
  );
}

// ─── Widget Mount (Shadow DOM) ──────────────────────────────────────────────

function mountWidget() {
  // Find our script tag to read data attributes
  const scriptTag = document.currentScript as HTMLScriptElement |  null;
  const allScripts = document.querySelectorAll('script[data-org-slug]');
  const tag = scriptTag || allScripts[allScripts.length - 1] as HTMLScriptElement;

  if (!tag) {
    console.error('[SalesHub Widget] Could not find script tag with data-org-slug');
    return;
  }

  const config: WidgetConfig = {
    orgSlug: tag.getAttribute('data-org-slug') || 'default',
    accentColor: tag.getAttribute('data-accent-color') || '#00C853',
    position: (tag.getAttribute('data-position') as 'bottom-right' | 'bottom-left') || 'bottom-right',
    greeting: tag.getAttribute('data-greeting') || 'Hi there! How can I help you today?',
    apiBase: tag.getAttribute('data-api-base') || tag.src.replace(/\/widget\/embed\.js.*$/, ''),
  };

  // Create host element
  const host = document.createElement('div');
  host.id = 'saleshub-widget-root';
  document.body.appendChild(host);

  // Attach Shadow DOM
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = getWidgetStyles(config.accentColor);
  shadow.appendChild(styleEl);

  // React mount point
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  // Render React into Shadow DOM
  const root = createRoot(mountPoint);
  root.render(<ChatWidget config={config} />);
}

// Auto-mount when script loads
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }
}

export { ChatWidget, mountWidget };
export type { WidgetConfig };

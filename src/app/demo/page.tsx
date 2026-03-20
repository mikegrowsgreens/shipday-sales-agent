'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, MessageCircle, Phone, RotateCcw, Sparkles } from 'lucide-react';

/**
 * Demo Mode Page (Session 10)
 * Special URL for live demonstrations with pre-seeded context.
 * Shows all wow moments: business lookup, ROI chart, social proof, callbacks.
 *
 * Usage: /demo or /demo?persona=busy_pizzeria
 */

// ─── Pre-seeded Demo Personas ────────────────────────────────────────────────

interface DemoPersona {
  id: string;
  label: string;
  description: string;
  leadInfo: { name: string; email: string; company: string };
  openingMessage: string;
  qualification: {
    orders_per_week: number;
    aov: number;
    commission_tier: number;
    restaurant_type: string;
  };
}

const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'busy_pizzeria',
    label: 'Busy Pizzeria',
    description: '200 orders/week, paying 30% to DoorDash',
    leadInfo: { name: 'Marco', email: 'marco@bestslice.com', company: "Marco's Best Slice" },
    openingMessage: "Hi, I'm Marco. I run a pizzeria doing about 200 delivery orders a week through DoorDash. They're charging me 30% and it's killing my margins. What can you guys do?",
    qualification: { orders_per_week: 200, aov: 35, commission_tier: 30, restaurant_type: 'pizza' },
  },
  {
    id: 'small_cafe',
    label: 'Small Cafe',
    description: '50 orders/week, exploring options',
    leadInfo: { name: 'Sarah', email: 'sarah@sunrisecafe.com', company: 'Sunrise Cafe' },
    openingMessage: "Hey there! I'm Sarah from Sunrise Cafe. We're small — maybe 50 delivery orders a week — but I feel like I'm losing money on every Uber Eats order. Is Shipday even worth it for a place our size?",
    qualification: { orders_per_week: 50, aov: 25, commission_tier: 30, restaurant_type: 'cafe' },
  },
  {
    id: 'multi_location',
    label: 'Multi-Location',
    description: '3 locations, 300+ orders/week total',
    leadInfo: { name: 'James Chen', email: 'james@luckywok.com', company: 'Lucky Wok' },
    openingMessage: "This is James from Lucky Wok. We have three locations doing about 300 orders a week combined through Grubhub. I need something that works across all my stores. What do you have?",
    qualification: { orders_per_week: 300, aov: 30, commission_tier: 25, restaurant_type: 'chinese' },
  },
  {
    id: 'skeptic',
    label: 'Price-Sensitive Skeptic',
    description: '150 orders/week, needs convincing',
    leadInfo: { name: 'Dave', email: 'dave@smokehouse.com', company: "Dave's Smokehouse BBQ" },
    openingMessage: "Look, I've tried a bunch of these delivery platforms and they all promise savings. I do about 150 orders a week, average about 40 bucks each, paying 25% to DoorDash. Why should I believe Shipday is any different?",
    qualification: { orders_per_week: 150, aov: 40, commission_tier: 25, restaurant_type: 'bbq' },
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  roiChart?: string;
}

// ─── Demo Page Component ─────────────────────────────────────────────────────

export default function DemoPage() {
  const [selectedPersona, setSelectedPersona] = useState<DemoPersona | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoStarted, setDemoStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start demo with selected persona
  const startDemo = useCallback(async (persona: DemoPersona) => {
    setSelectedPersona(persona);
    setDemoStarted(true);
    setMessages([]);
    setLoading(true);

    // Send the persona's opening message as user input
    const userMsg: ChatMessage = {
      role: 'user',
      content: persona.openingMessage,
      timestamp: Date.now(),
    };
    setMessages([userMsg]);

    try {
      const res = await fetch('/api/chat/prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: persona.openingMessage,
          history: [],
          lead_info: persona.leadInfo,
          demo_mode: true,
          demo_qualification: persona.qualification,
        }),
      });
      const data = await res.json();
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          timestamp: Date.now(),
          roiChart: data.roi_chart,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Demo connection error. Please try again.', timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, []);

  // Send message in demo mode
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading || !selectedPersona) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const historyToSend = messages.slice(-19).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/chat/prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyToSend,
          lead_info: selectedPersona.leadInfo,
          demo_mode: true,
          demo_qualification: selectedPersona.qualification,
        }),
      });
      const data = await res.json();
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          timestamp: Date.now(),
          roiChart: data.roi_chart,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Demo error. Please try again.", timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, selectedPersona]);

  // Reset demo
  const resetDemo = () => {
    setDemoStarted(false);
    setSelectedPersona(null);
    setMessages([]);
  };

  // ─── Persona Picker ──────────────────────────────────────────────────────────

  if (!demoStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-3xl w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              Demo Mode
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">SalesHub AI Demo</h1>
            <p className="text-gray-500 text-lg">Select a prospect persona to see the AI sales agent in action</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DEMO_PERSONAS.map(persona => (
              <button
                key={persona.id}
                onClick={() => startDemo(persona)}
                className="bg-white rounded-xl border border-gray-200 p-6 text-left hover:border-blue-300 hover:shadow-lg transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                    {persona.leadInfo.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {persona.label}
                    </div>
                    <div className="text-sm text-gray-500">{persona.leadInfo.name} — {persona.leadInfo.company}</div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-3">{persona.description}</p>
                <p className="text-xs text-gray-400 italic line-clamp-2">&quot;{persona.openingMessage.substring(0, 100)}...&quot;</p>
              </button>
            ))}
          </div>

          <div className="mt-8 bg-white/80 rounded-xl border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-500" /> Voice Agent Demo
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              To demo the voice agent, call the Twilio number with pre-call brief context.
              The voice agent includes humor acknowledgment, name pronunciation handling, and contextual callbacks.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono text-gray-700">
              POST /api/voice/outbound-call<br/>
              {`{ "contactId": <id>, "orgId": 1 }`}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Demo Chat Interface ─────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Demo Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-medium">
            <Sparkles className="w-3 h-3" />
            DEMO
          </div>
          <div>
            <div className="font-semibold text-gray-900 text-sm">{selectedPersona?.label}</div>
            <div className="text-xs text-gray-500">
              {selectedPersona?.leadInfo.name} — {selectedPersona?.leadInfo.company}
            </div>
          </div>
        </div>
        <button
          onClick={resetDemo}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          New Persona
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-1' : 'order-1'}`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <MessageCircle className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs text-gray-400">AI Agent</span>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-md'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                }`}
              >
                {msg.content}
              </div>
              {/* ROI Chart */}
              {msg.roiChart && (
                <div
                  className="mt-2 bg-white rounded-xl border border-gray-200 p-3 overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: msg.roiChart }}
                />
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Type as the prospect..."
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="bg-blue-600 text-white rounded-xl p-2.5 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

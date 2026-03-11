'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot,
  Send,
  User,
  Loader2,
  Sunrise,
  RefreshCw,
  MessageSquare,
  History,
  ChevronRight,
  Wrench,
  Sparkles,
  BarChart3,
  Flame,
  Lightbulb,
  Mail,
  Shield,
  Brain,
  Kanban,
  Plus,
  X,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: Array<{ tool: string; input: Record<string, unknown>; result: string }>;
}

interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
}

interface PromptTemplate {
  id: string;
  category: string;
  title: string;
  prompt: string;
  icon: string;
  usage_count: number;
}

interface BriefingData {
  briefing: string;
  date: string;
  cached: boolean;
}

// ─── Icon Map ───────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3, Flame, Lightbulb, Reply: MessageSquare, Kanban, Brain, Shield, Mail,
  MessageSquare, Sparkles,
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState<'templates' | 'history' | 'briefing' | null>('templates');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ─── Load Initial Data ────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/bdr/templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch { /* ignore */ }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/bdr/chat/history');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadTemplates();
    loadSessions();
  }, [loadTemplates, loadSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Briefing ─────────────────────────────────────────────────────────

  const loadBriefing = async (forceRefresh = false) => {
    setBriefingLoading(true);
    try {
      if (forceRefresh) {
        await fetch('/api/bdr/briefing', { method: 'POST' });
      }
      const res = await fetch('/api/bdr/briefing');
      const data = await res.json();
      setBriefing(data);
    } catch { /* ignore */ }
    setBriefingLoading(false);
  };

  // ─── Chat Functions ───────────────────────────────────────────────────

  const createSession = async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/bdr/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      const data = await res.json();
      return data.session_id || null;
    } catch {
      return null;
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/bdr/chat/history?session_id=${sessionId}`);
      const data = await res.json();
      setMessages(
        (data.messages || []).map((m: { role: string; content: string; tool_calls?: unknown }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          tool_calls: m.tool_calls as ChatMessage['tool_calls'],
        }))
      );
      setCurrentSessionId(sessionId);
      setShowSidebar(null);
    } catch { /* ignore */ }
  };

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    // Create session if needed
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = await createSession();
      setCurrentSessionId(sessionId);
    }

    const userMsg: ChatMessage = { role: 'user', content: messageText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/bdr/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          history: updatedMessages.slice(-8),
          session_id: sessionId,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content: data.reply,
          tool_calls: data.tool_calls,
        },
      ]);
    } catch (err) {
      setMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
        },
      ]);
    } finally {
      setLoading(false);
      await loadSessions();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTemplateClick = async (template: PromptTemplate) => {
    // Track usage
    fetch('/api/bdr/templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: template.id }),
    }).catch(() => {});

    await handleSend(template.prompt);
  };

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-lg font-semibold text-white">BDR Assistant</h1>
              <p className="text-xs text-gray-500">AI assistant with full pipeline access</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowSidebar(showSidebar === 'briefing' ? null : 'briefing');
                if (!briefing) loadBriefing();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                showSidebar === 'briefing'
                  ? 'bg-amber-600/20 text-amber-400'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Sunrise className="w-3.5 h-3.5" />
              Morning Briefing
            </button>
            <button
              onClick={() => setShowSidebar(showSidebar === 'history' ? null : 'history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                showSidebar === 'history'
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              History
            </button>
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <WelcomeScreen templates={templates} onTemplateClick={handleTemplateClick} />
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="shrink-0 mt-1">
                    <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-blue-400" />
                    </div>
                  </div>
                )}
                <div className={`max-w-[75%] space-y-2 ${msg.role === 'user' ? 'items-end' : ''}`}>
                  {/* Tool calls indicator */}
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {msg.tool_calls.map((tc, j) => (
                        <span
                          key={j}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-900/30 text-violet-300"
                        >
                          <Wrench className="w-3 h-3" />
                          {tc.tool.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                  <div
                    className={`rounded-xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300'
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed prose prose-invert prose-sm max-w-none">
                      {renderMarkdown(msg.content)}
                    </div>
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="shrink-0 mt-1">
                    <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-3">
              <div className="shrink-0">
                <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
              </div>
              <div className="bg-gray-800 rounded-xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-gray-400">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-800 p-4 shrink-0">
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything... generate an email, show hot leads, how are campaigns doing?"
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              style={{ minHeight: '44px', maxHeight: '120px' }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-3 rounded-xl transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      {showSidebar && (
        <div className="w-80 border-l border-gray-800 bg-gray-900 flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">
              {showSidebar === 'templates' && 'Quick Actions'}
              {showSidebar === 'history' && 'Chat History'}
              {showSidebar === 'briefing' && 'Morning Briefing'}
            </span>
            <button
              onClick={() => setShowSidebar(null)}
              className="text-gray-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {showSidebar === 'templates' && (
              <div className="space-y-2">
                {templates.map(template => {
                  const Icon = ICON_MAP[template.icon] || MessageSquare;
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateClick(template)}
                      className="w-full text-left bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-lg p-3 transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-medium text-white">{template.title}</span>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2">{template.prompt}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-gray-500 capitalize">{template.category}</span>
                        {template.usage_count > 0 && (
                          <span className="text-[10px] text-gray-600">Used {template.usage_count}x</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {showSidebar === 'history' && (
              <div className="space-y-2">
                {sessions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No previous chats
                  </div>
                ) : (
                  sessions.map(session => (
                    <button
                      key={session.id}
                      onClick={() => loadSession(session.id)}
                      className={`w-full text-left bg-gray-800 hover:bg-gray-750 border rounded-lg p-3 transition-colors ${
                        currentSessionId === session.id
                          ? 'border-blue-500'
                          : 'border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white truncate">{session.title}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>{session.message_count} messages</span>
                        <span>{new Date(session.last_message_at).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {showSidebar === 'briefing' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {briefing?.date || 'Today'}
                    {briefing?.cached && ' (cached)'}
                  </span>
                  <button
                    onClick={() => loadBriefing(true)}
                    disabled={briefingLoading}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                  >
                    <RefreshCw className={`w-3 h-3 ${briefingLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {briefingLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                  </div>
                ) : briefing ? (
                  <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed prose prose-invert prose-sm max-w-none">
                    {renderMarkdown(briefing.briefing)}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Sunrise className="w-10 h-10 text-amber-400/30 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Click to load your morning briefing</p>
                    <button
                      onClick={() => loadBriefing()}
                      className="mt-2 text-xs text-amber-400 hover:text-amber-300"
                    >
                      Generate Briefing
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Welcome Screen ─────────────────────────────────────────────────────────

function WelcomeScreen({
  templates,
  onTemplateClick,
}: {
  templates: PromptTemplate[];
  onTemplateClick: (t: PromptTemplate) => void;
}) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div>
          <div className="w-16 h-16 rounded-2xl bg-blue-600/20 flex items-center justify-center mx-auto mb-4">
            <Bot className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">BDR Assistant</h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Your AI-powered sales assistant with full pipeline access.
            Generate emails, analyze campaigns, find hot leads, and more.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-left max-w-xl mx-auto">
          {templates.slice(0, 8).map(template => {
            const Icon = ICON_MAP[template.icon] || MessageSquare;
            return (
              <button
                key={template.id}
                onClick={() => onTemplateClick(template)}
                className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-xl p-4 transition-all group text-left"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-white">{template.title}</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{template.prompt}</p>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 justify-center text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            8 tools available
          </span>
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Powered by Claude
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Simple Markdown Renderer ───────────────────────────────────────────────

function renderMarkdown(text: string) {
  // Split into lines and process
  return text.split('\n').map((line, i) => {
    // Headers
    if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold text-white mt-3 mb-1">{line.slice(4)}</h3>;
    if (line.startsWith('## ')) return <h2 key={i} className="text-base font-semibold text-white mt-3 mb-1">{line.slice(3)}</h2>;
    if (line.startsWith('# ')) return <h1 key={i} className="text-lg font-bold text-white mt-3 mb-1">{line.slice(2)}</h1>;

    // Bold text with **
    const parts = line.split(/\*\*(.*?)\*\*/g);
    const rendered = parts.map((part, j) =>
      j % 2 === 1 ? <strong key={j} className="font-semibold text-white">{part}</strong> : part
    );

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return <div key={i} className="flex gap-2 ml-2"><span className="text-gray-500 shrink-0">•</span><span>{rendered.slice(0)}</span></div>;
    }

    // Empty lines
    if (!line.trim()) return <div key={i} className="h-2" />;

    // Regular text
    return <p key={i}>{rendered}</p>;
  });
}

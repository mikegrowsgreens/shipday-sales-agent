'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Inbox, Mail, Phone, Linkedin, MessageSquare, Calendar,
  Archive, Clock, Search, Filter, Check, CheckCheck,
  ChevronDown, Loader2, ArrowRight, Building2, Eye,
  RotateCcw, Bell, AlarmClock, X,
} from 'lucide-react';
import { InboxItem, Channel } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

const channelConfig: Record<string, { icon: typeof Mail; color: string; label: string }> = {
  email: { icon: Mail, color: 'text-blue-400', label: 'Email' },
  phone: { icon: Phone, color: 'text-green-400', label: 'Phone' },
  linkedin: { icon: Linkedin, color: 'text-sky-400', label: 'LinkedIn' },
  sms: { icon: MessageSquare, color: 'text-purple-400', label: 'SMS' },
  calendly: { icon: Calendar, color: 'text-orange-400', label: 'Calendly' },
  manual: { icon: Eye, color: 'text-gray-400', label: 'Manual' },
};

const eventLabels: Record<string, string> = {
  replied: 'replied to email',
  sent: 'sent an email',
  opened: 'opened email',
  clicked: 'clicked a link',
  call_completed: 'completed a call',
  call_missed: 'missed call',
  booked: 'booked a meeting',
  form_submitted: 'submitted a form',
  connected: 'connected on LinkedIn',
  stage_change: 'stage changed',
  sms_received: 'sent SMS',
};

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState('all');
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [channelCounts, setChannelCounts] = useState<Record<string, number>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { addToast } = useToast();

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, limit: '100' });
      if (channel !== 'all') params.set('channel', channel);
      if (search) params.set('search', search);

      const res = await fetch(`/api/inbox?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setChannelCounts(data.channelCounts || {});
    } catch {
      addToast('Failed to load inbox', 'error');
    } finally {
      setLoading(false);
    }
  }, [channel, status, search, addToast]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchInbox, 30000);
    return () => clearInterval(interval);
  }, [fetchInbox]);

  const handleAction = async (ids: number[], action: string, snoozed_until?: string) => {
    try {
      await fetch('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ touchpoint_ids: ids, action, snoozed_until }),
      });
      addToast(`${action === 'archive' ? 'Archived' : action === 'snooze' ? 'Snoozed' : 'Restored'} ${ids.length} item${ids.length > 1 ? 's' : ''}`, 'success');
      setSelected(new Set());
      fetchInbox();
    } catch {
      addToast('Action failed', 'error');
    }
  };

  const totalInbox = Object.values(channelCounts).reduce((a, b) => a + b, 0);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Inbox className="w-6 h-6 text-blue-400" />
            Unified Inbox
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalInbox} active items · All inbound signals in one place
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-blue-400">{selected.size} selected</span>
              <button
                onClick={() => handleAction(Array.from(selected), 'archive')}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5"
              >
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
              <button
                onClick={() => handleAction(Array.from(selected), 'snooze')}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5"
              >
                <AlarmClock className="w-3.5 h-3.5" /> Snooze 24h
              </button>
              <button onClick={() => setSelected(new Set())} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Channel Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-gray-800 pb-3">
        <button
          onClick={() => setChannel('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            channel === 'all' ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          All
          <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full text-[10px]">{totalInbox}</span>
        </button>
        {Object.entries(channelConfig).map(([key, cfg]) => {
          const count = channelCounts[key] || 0;
          if (count === 0 && channel !== key) return null;
          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setChannel(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                channel === key ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${channel === key ? 'text-blue-400' : cfg.color}`} />
              {cfg.label}
              {count > 0 && (
                <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full text-[10px]">{count}</span>
              )}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Status tabs */}
          {(['active', 'archived', 'snoozed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`text-xs px-2.5 py-1 rounded-lg ${
                status === s ? 'bg-gray-800 text-gray-200' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {s === 'active' ? 'Active' : s === 'archived' ? 'Archived' : 'Snoozed'}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search inbox..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Inbox Items */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <CheckCheck className="w-10 h-10 text-green-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Inbox zero!</p>
          <p className="text-xs text-gray-600 mt-1">
            {status === 'active' ? 'No new inbound signals. Check back later.' : `No ${status} items.`}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map(item => {
            const cfg = channelConfig[item.channel] || channelConfig.manual;
            const Icon = cfg.icon;
            const isSelected = selected.has(item.touchpoint_id);
            const isExpanded = expandedId === item.touchpoint_id;

            return (
              <div
                key={item.touchpoint_id}
                className={`bg-gray-900 border rounded-lg transition-all ${
                  isSelected
                    ? 'border-blue-600/50 bg-blue-600/5'
                    : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-3 p-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(item.touchpoint_id)}
                    className="shrink-0"
                  >
                    <div className={`w-4 h-4 rounded border ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-600 hover:border-gray-400'
                    } flex items-center justify-center`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>

                  {/* Channel Icon */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>

                  {/* Content */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : item.touchpoint_id)}
                  >
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/contacts/${item.contact_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-medium text-gray-200 hover:text-white truncate"
                      >
                        {item.contact_name?.trim() || item.contact_email || 'Unknown'}
                      </Link>
                      {item.business_name && (
                        <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
                          <Building2 className="w-3 h-3" /> {item.business_name}
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cfg.color} bg-gray-800 shrink-0`}>
                        {eventLabels[item.event_type] || item.event_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {item.subject && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{item.subject}</p>
                    )}
                    {item.body_preview && !isExpanded && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{item.body_preview}</p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] text-gray-500">
                      {formatTimeAgo(item.occurred_at)}
                    </span>
                  </div>

                  {/* Quick Actions */}
                  <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAction([item.touchpoint_id], 'archive'); }}
                      className="p-1 text-gray-600 hover:text-gray-300 rounded"
                      title="Archive"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAction([item.touchpoint_id], 'snooze'); }}
                      className="p-1 text-gray-600 hover:text-gray-300 rounded"
                      title="Snooze 24h"
                    >
                      <AlarmClock className="w-3.5 h-3.5" />
                    </button>
                    <Link
                      href={`/contacts/${item.contact_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-gray-600 hover:text-gray-300 rounded"
                      title="View contact"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>

                {/* Expanded View */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 ml-16 border-t border-gray-800/50 mt-1">
                    {item.body_preview && (
                      <p className="text-xs text-gray-400 mt-2 whitespace-pre-wrap">{item.body_preview}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-[10px] text-gray-600">
                        {new Date(item.occurred_at).toLocaleString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                      <span className="text-[10px] text-gray-600">Source: {item.source_system}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        item.direction === 'inbound' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'
                      }`}>
                        {item.direction}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => handleAction([item.touchpoint_id], status === 'archived' ? 'unarchive' : 'archive')}
                          className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                        >
                          {status === 'archived' ? <RotateCcw className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                          {status === 'archived' ? 'Restore' : 'Archive'}
                        </button>
                        <Link
                          href={`/contacts/${item.contact_id}`}
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          View Contact <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

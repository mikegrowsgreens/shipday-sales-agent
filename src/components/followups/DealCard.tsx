'use client';

import { ChevronDown, ChevronUp, Calendar, Sparkles, Loader2, Archive, CheckSquare, Square, Clock, TrendingUp, Mail } from 'lucide-react';
import { useState } from 'react';

interface TouchSummary {
  touch_number: number;
  status: string;
  sent_at: string | null;
  scheduled_at: string | null;
}

interface Deal {
  deal_id: string;
  contact_name: string | null;
  contact_email: string | null;
  business_name: string | null;
  cuisine_type: string | null;
  pipeline_stage: string | null;
  urgency_level: string | null;
  demo_date: string | null;
  pain_points: unknown;
  sequence_step: number | null;
  agent_status: string | null;
  draft_count?: number;
  sent_count?: number;
  pending_count?: number;
  approved_count?: number;
  fathom_summary: string | null;
  last_activity_at?: string | null;
  last_activity_type?: string | null;
  touch_summary?: TouchSummary[] | null;
  engagement_score?: number;
  next_touch_due?: string | null;
}

interface DealCardProps {
  deal: Deal;
  onGenerate: (dealId: string) => Promise<void>;
  onView: (dealId: string) => void;
  onArchive?: (dealId: string) => Promise<void>;
  selected?: boolean;
  onSelect?: (dealId: string) => void;
}

const stageColors: Record<string, string> = {
  demo_completed: 'bg-blue-600/20 text-blue-400',
  proposal_sent: 'bg-purple-600/20 text-purple-400',
  negotiation: 'bg-yellow-600/20 text-yellow-400',
  following_up: 'bg-cyan-600/20 text-cyan-400',
  won: 'bg-green-600/20 text-green-400',
  lost: 'bg-red-600/20 text-red-400',
  nurture: 'bg-gray-600/20 text-gray-400',
};

const urgencyColors: Record<string, string> = {
  high: 'bg-red-600/15 text-red-400 border-red-600/30',
  medium: 'bg-yellow-600/15 text-yellow-400 border-yellow-600/30',
  low: 'bg-gray-600/15 text-gray-400 border-gray-600/30',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatActivityType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function DealCard({ deal, onGenerate, onView, onArchive, selected, onSelect }: DealCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onGenerate(deal.deal_id);
    } finally {
      setGenerating(false);
    }
  };

  const painPoints = Array.isArray(deal.pain_points)
    ? (deal.pain_points as string[])
    : [];

  const draftCount = Number(deal.draft_count) || 0;
  const sentCount = Number(deal.sent_count) || 0;
  const approvedCount = Number(deal.approved_count) || 0;
  const touches: TouchSummary[] = deal.touch_summary || [];

  // Days since demo
  const daysSinceDemo = deal.demo_date
    ? Math.floor((Date.now() - new Date(deal.demo_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Next touch due urgency
  const nextTouchDays = deal.next_touch_due
    ? Math.ceil((new Date(deal.next_touch_due).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div
      className={`bg-gray-900 border rounded-xl overflow-hidden cursor-pointer transition-all ${
        selected ? 'border-blue-500 bg-blue-950/20' : 'border-gray-800 hover:border-gray-700'
      }`}
      onClick={() => onView(deal.deal_id)}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {onSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(deal.deal_id); }}
            className="shrink-0 text-gray-500 hover:text-blue-400 transition-colors"
          >
            {selected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
          </button>
        )}

        {/* Business info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">
              {deal.business_name || 'Unknown Business'}
            </span>
            {deal.pipeline_stage && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${stageColors[deal.pipeline_stage] || 'bg-gray-600/20 text-gray-400'}`}>
                {deal.pipeline_stage.replace(/_/g, ' ')}
              </span>
            )}
            {deal.urgency_level && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${urgencyColors[deal.urgency_level] || 'text-gray-400'}`}>
                {deal.urgency_level}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-gray-400">{deal.contact_name || 'No contact'}</span>
            {deal.cuisine_type && <span className="text-xs text-gray-600">{deal.cuisine_type}</span>}
            {deal.last_activity_at && (
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {deal.last_activity_type ? formatActivityType(deal.last_activity_type) : 'Activity'}{' '}
                {timeAgo(deal.last_activity_at)}
              </span>
            )}
          </div>
        </div>

        {/* Engagement timeline - visual dots for each touch */}
        {touches.length > 0 ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {touches.map((t) => {
                let bg = 'bg-gray-700';
                let title = `Touch ${t.touch_number}: draft`;
                if (t.status === 'sent') {
                  bg = 'bg-green-500';
                  title = `Touch ${t.touch_number}: sent${t.sent_at ? ' ' + new Date(t.sent_at).toLocaleDateString() : ''}`;
                } else if (t.status === 'approved') {
                  bg = 'bg-yellow-500';
                  title = `Touch ${t.touch_number}: scheduled${t.scheduled_at ? ' ' + new Date(t.scheduled_at).toLocaleDateString() : ''}`;
                }
                return (
                  <div
                    key={t.touch_number}
                    className={`w-4 h-2 rounded-sm ${bg} transition-colors`}
                    title={title}
                  />
                );
              })}
            </div>
            <span className="text-[10px] text-gray-500 whitespace-nowrap tabular-nums">
              {sentCount}/{draftCount}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-gray-600 flex-shrink-0">No campaign</span>
        )}

        {/* Demo date + days since */}
        {deal.demo_date && (
          <div className="flex flex-col items-end flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              {new Date(deal.demo_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            {daysSinceDemo !== null && daysSinceDemo >= 0 && (
              <span className={`text-[10px] ${daysSinceDemo > 14 ? 'text-red-400' : daysSinceDemo > 7 ? 'text-yellow-400' : 'text-gray-500'}`}>
                {daysSinceDemo}d ago
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {draftCount === 0 && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Generate
            </button>
          )}
          {onArchive && (
            <button
              onClick={() => onArchive(deal.deal_id)}
              className="p-1.5 text-gray-500 hover:text-red-400"
              title="Archive deal"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-gray-400 hover:text-white"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 py-3 border-t border-gray-800 bg-gray-800/30 space-y-3">
          {/* Quick stats row */}
          <div className="flex items-center gap-4">
            {deal.contact_email && (
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Mail className="w-3 h-3" /> {deal.contact_email}
              </span>
            )}
            {typeof deal.engagement_score === 'number' && deal.engagement_score > 0 && (
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Engagement: {deal.engagement_score}
              </span>
            )}
            {nextTouchDays !== null && (
              <span className={`text-[10px] flex items-center gap-1 ${
                nextTouchDays < 0 ? 'text-red-400' : nextTouchDays <= 2 ? 'text-yellow-400' : 'text-gray-500'
              }`}>
                <Calendar className="w-3 h-3" />
                {nextTouchDays < 0 ? `${Math.abs(nextTouchDays)}d overdue` : nextTouchDays === 0 ? 'Due today' : `Due in ${nextTouchDays}d`}
              </span>
            )}
          </div>

          {/* Touch timeline with dates */}
          {touches.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase">Touch Timeline</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {touches.map((t) => {
                  const dateStr = t.sent_at || t.scheduled_at;
                  return (
                    <div key={t.touch_number} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${
                        t.status === 'sent' ? 'bg-green-500' :
                        t.status === 'approved' ? 'bg-yellow-500' : 'bg-gray-600'
                      }`} />
                      <span className="text-[10px] text-gray-400">
                        T{t.touch_number}
                        {dateStr && (
                          <span className="text-gray-600 ml-0.5">
                            {new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {painPoints.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase">Pain Points</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {painPoints.map((pp, i) => (
                  <span key={i} className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                    {pp}
                  </span>
                ))}
              </div>
            </div>
          )}

          {deal.fathom_summary && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase">Demo Summary</span>
              <p className="text-xs text-gray-400 mt-1 line-clamp-3">{deal.fathom_summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

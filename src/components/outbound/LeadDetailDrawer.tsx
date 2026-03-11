'use client';

import { useState, useEffect } from 'react';
import {
  X, Building2, MapPin, Star, Phone, Mail, Globe, Eye, MousePointerClick,
  MessageSquare, Send, Loader2, ExternalLink, Zap, BarChart3, User, Clock
} from 'lucide-react';

interface LeadDetail {
  lead_id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_title: string | null;
  email_confidence: string | null;
  secondary_contact_name: string | null;
  secondary_contact_email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  website: string | null;
  cuisine_type: string | null;
  price_range: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_business_type: string | null;
  google_delivery_flag: boolean | null;
  google_price_level: number | null;
  pos_system: string | null;
  ordering_platforms: string[] | null;
  has_direct_ordering: boolean | null;
  marketplace_count: number | null;
  market_type: string | null;
  tier: string | null;
  status: string;
  total_score: number | null;
  contact_quality_score: number | null;
  business_strength_score: number | null;
  delivery_potential_score: number | null;
  tech_stack_score: number | null;
  win_pattern_score: number | null;
  mrr_potential_score: number | null;
  engagement_score: number | null;
  email_subject: string | null;
  email_body: string | null;
  email_angle: string | null;
  email_variant_id: string | null;
  send_count: number | null;
  open_count: number | null;
  has_replied: boolean;
  reply_sentiment: string | null;
  reply_summary: string | null;
  reply_date: string | null;
  last_sent_date: string | null;
  first_open_at: string | null;
  last_open_at: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  enriched_at: string | null;
  scored_at: string | null;
  demo_booked_at: string | null;
  demo_outcome: string | null;
  // Aggregated from email_sends
  es_send_count: number;
  es_last_sent_at: string | null;
  es_total_opens: number;
  es_total_clicks: number;
  es_has_reply: boolean;
  es_last_reply_at: string | null;
}

interface EmailSend {
  id: string;
  email_type: string | null;
  subject: string | null;
  angle: string | null;
  variant_id: string | null;
  sent_at: string | null;
  open_count: number;
  click_count: number;
  replied: boolean;
  reply_at: string | null;
  reply_sentiment: string | null;
}

interface Props {
  leadId: string | null;
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  pending_enrichment: 'bg-gray-600', new: 'bg-blue-600', scored: 'bg-cyan-600',
  email_ready: 'bg-yellow-600', sent: 'bg-purple-600', replied: 'bg-green-600',
  demo_booked: 'bg-emerald-600', enriching: 'bg-blue-500', enriched: 'bg-cyan-500',
  bounced: 'bg-red-400', dedup_skipped: 'bg-gray-500', opted_out: 'bg-orange-600',
  sequence_complete: 'bg-indigo-600', wrong_contact: 'bg-red-500',
};

const tierColors: Record<string, string> = {
  tier_1: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  tier_2: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
  tier_3: 'text-gray-400 border-gray-400/30 bg-gray-400/10',
};

const scoreLabels: { key: string; label: string; color: string }[] = [
  { key: 'contact_quality_score', label: 'Contact Quality', color: 'bg-blue-500' },
  { key: 'business_strength_score', label: 'Business Strength', color: 'bg-purple-500' },
  { key: 'delivery_potential_score', label: 'Delivery Potential', color: 'bg-green-500' },
  { key: 'tech_stack_score', label: 'Tech Stack', color: 'bg-cyan-500' },
  { key: 'win_pattern_score', label: 'Win Pattern', color: 'bg-yellow-500' },
  { key: 'mrr_potential_score', label: 'MRR Potential', color: 'bg-orange-500' },
];

export default function LeadDetailDrawer({ leadId, onClose }: Props) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);
    fetch(`/api/bdr/leads?lead_id=${encodeURIComponent(leadId)}`)
      .then(r => r.json())
      .then(data => {
        setLead(data.lead || null);
        setSends(data.sends || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [leadId]);

  if (!leadId) return null;

  const sendCount = lead ? (lead.es_send_count || lead.send_count || 0) : 0;
  const totalOpens = lead ? (lead.es_total_opens || lead.open_count || 0) : 0;
  const totalClicks = lead ? (lead.es_total_clicks || 0) : 0;
  const hasReply = lead ? (lead.es_has_reply || lead.has_replied) : false;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[520px] max-w-[90vw] bg-gray-950 border-l border-gray-800 z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-white">Lead Detail</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : !lead ? (
            <div className="p-8 text-center text-gray-500">Lead not found</div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Business header */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-lg font-bold text-white">{lead.business_name || `Lead ${lead.lead_id}`}</h2>
                  {lead.tier && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${tierColors[lead.tier] || 'text-gray-400'}`}>
                      {lead.tier.replace('_', ' ').toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[lead.status] || 'bg-gray-600'} text-white`}>
                    {lead.status.replace(/_/g, ' ')}
                  </span>
                  {lead.cuisine_type && (
                    <span className="text-[10px] text-gray-500">{lead.cuisine_type}</span>
                  )}
                  {lead.source && (
                    <span className="text-[10px] text-gray-600">via {lead.source}</span>
                  )}
                </div>
              </div>

              {/* Contact info */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-400 mb-2">Contact</h3>
                {lead.contact_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-gray-200">{lead.contact_name}</span>
                    {lead.contact_title && <span className="text-[10px] text-gray-500">{lead.contact_title}</span>}
                  </div>
                )}
                {lead.contact_email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-blue-400">{lead.contact_email}</span>
                    {lead.email_confidence && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        lead.email_confidence === 'high' ? 'bg-green-900/30 text-green-400' :
                        lead.email_confidence === 'medium' ? 'bg-yellow-900/30 text-yellow-400' :
                        'bg-red-900/30 text-red-400'
                      }`}>{lead.email_confidence}</span>
                    )}
                  </div>
                )}
                {lead.secondary_contact_email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-3.5 h-3.5 text-gray-600" />
                    <span className="text-gray-400">{lead.secondary_contact_name || 'Alt'}: {lead.secondary_contact_email}</span>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-gray-300">{lead.phone}</span>
                  </div>
                )}
                {(lead.city || lead.state) && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-gray-300">{[lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {lead.website && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-blue-400 truncate">{lead.website}</span>
                    <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3 h-3 text-gray-500 hover:text-blue-400" />
                    </a>
                  </div>
                )}
                {lead.google_rating && (
                  <div className="flex items-center gap-2 text-sm">
                    <Star className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-yellow-400">{lead.google_rating}</span>
                    <span className="text-gray-500 text-xs">({lead.google_review_count || 0} reviews)</span>
                    {lead.google_price_level && <span className="text-gray-500 text-xs">{'$'.repeat(lead.google_price_level)}</span>}
                  </div>
                )}
              </div>

              {/* Business details */}
              {(lead.pos_system || lead.ordering_platforms || lead.google_delivery_flag !== null) && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-gray-400 mb-2">Business Details</h3>
                  {lead.pos_system && (
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-gray-400 text-xs">POS:</span>
                      <span className="text-gray-200">{lead.pos_system}</span>
                    </div>
                  )}
                  {lead.ordering_platforms && Array.isArray(lead.ordering_platforms) && lead.ordering_platforms.length > 0 && (
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="text-gray-400 text-xs">Platforms:</span>
                      {lead.ordering_platforms.map((p, i) => (
                        <span key={i} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{p}</span>
                      ))}
                    </div>
                  )}
                  {lead.google_delivery_flag !== null && (
                    <div className="text-xs text-gray-400">
                      Delivery: {lead.google_delivery_flag ? <span className="text-green-400">Yes</span> : <span className="text-gray-500">No</span>}
                      {lead.marketplace_count !== null && <span className="ml-3">Marketplaces: {lead.marketplace_count}</span>}
                      {lead.has_direct_ordering !== null && (
                        <span className="ml-3">Direct ordering: {lead.has_direct_ordering ? <span className="text-green-400">Yes</span> : <span className="text-gray-500">No</span>}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Score breakdown */}
              {lead.total_score && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-400">Score Breakdown</h3>
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-sm font-bold text-yellow-400">{lead.total_score}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {scoreLabels.map(({ key, label, color }) => {
                      const val = (lead as unknown as Record<string, unknown>)[key] as number | null;
                      if (!val && val !== 0) return null;
                      const maxScore = 20;
                      const pct = Math.min((val / maxScore) * 100, 100);
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className="text-[10px] text-gray-400 w-28 shrink-0">{label}</span>
                          <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-300 w-6 text-right tabular-nums">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Engagement summary */}
              {sendCount > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-400 mb-3">Engagement</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <Send className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                      <div className="text-lg font-bold text-white">{sendCount}</div>
                      <div className="text-[10px] text-gray-500">Sent</div>
                    </div>
                    <div className="text-center">
                      <Eye className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                      <div className="text-lg font-bold text-white">{totalOpens}</div>
                      <div className="text-[10px] text-gray-500">Opens</div>
                    </div>
                    <div className="text-center">
                      <MousePointerClick className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                      <div className="text-lg font-bold text-white">{totalClicks}</div>
                      <div className="text-[10px] text-gray-500">Clicks</div>
                    </div>
                    <div className="text-center">
                      <MessageSquare className="w-4 h-4 text-green-400 mx-auto mb-1" />
                      <div className="text-lg font-bold text-white">{hasReply ? '1' : '0'}</div>
                      <div className="text-[10px] text-gray-500">Replies</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reply info */}
              {lead.has_replied && lead.reply_summary && (
                <div className={`border rounded-xl p-4 ${
                  lead.reply_sentiment === 'positive' ? 'bg-green-950/20 border-green-800/30' :
                  lead.reply_sentiment === 'negative' ? 'bg-red-950/20 border-red-800/30' :
                  'bg-gray-900 border-gray-800'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className={`w-3.5 h-3.5 ${
                      lead.reply_sentiment === 'positive' ? 'text-green-400' :
                      lead.reply_sentiment === 'negative' ? 'text-red-400' : 'text-gray-400'
                    }`} />
                    <h3 className="text-xs font-semibold text-gray-400">Reply</h3>
                    {lead.reply_sentiment && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        lead.reply_sentiment === 'positive' ? 'bg-green-600 text-white' :
                        lead.reply_sentiment === 'negative' ? 'bg-red-600 text-white' :
                        'bg-gray-600 text-white'
                      }`}>
                        {lead.reply_sentiment}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-300">{lead.reply_summary}</p>
                  {lead.reply_date && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      {new Date(lead.reply_date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              )}

              {/* Demo info */}
              {lead.demo_booked_at && (
                <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-emerald-400 mb-1">Demo Booked</h3>
                  <p className="text-xs text-gray-300">
                    {new Date(lead.demo_booked_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {lead.demo_outcome && <span className="ml-2 text-gray-500">Outcome: {lead.demo_outcome}</span>}
                  </p>
                </div>
              )}

              {/* Email send history */}
              {sends.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-gray-400 mb-3">Email History ({sends.length})</h3>
                  <div className="space-y-2">
                    {sends.map((s, i) => (
                      <div key={s.id || i} className="flex items-start gap-3 p-2 bg-gray-800/30 rounded-lg">
                        <div className="shrink-0 mt-0.5">
                          {s.replied ? (
                            <MessageSquare className="w-3.5 h-3.5 text-green-400" />
                          ) : (s.open_count || 0) > 0 ? (
                            <Eye className="w-3.5 h-3.5 text-yellow-400" />
                          ) : (
                            <Send className="w-3.5 h-3.5 text-blue-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-200 truncate">{s.subject || 'No subject'}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {s.email_type && <span className="text-[10px] text-purple-400">{s.email_type}</span>}
                            {s.angle && <span className="text-[10px] text-gray-500">{s.angle.replace(/_/g, ' ')}</span>}
                            {(s.open_count || 0) > 0 && <span className="text-[10px] text-yellow-400">{s.open_count} opens</span>}
                            {(s.click_count || 0) > 0 && <span className="text-[10px] text-cyan-400">{s.click_count} clicks</span>}
                            {s.replied && (
                              <span className={`text-[10px] ${
                                s.reply_sentiment === 'positive' ? 'text-green-400' :
                                s.reply_sentiment === 'negative' ? 'text-red-400' : 'text-gray-400'
                              }`}>
                                replied{s.reply_sentiment ? ` (${s.reply_sentiment})` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-500 shrink-0">
                          {s.sent_at ? new Date(s.sent_at).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '--'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-4 text-[10px] text-gray-600 flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Created {new Date(lead.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {lead.enriched_at && (
                  <span>Enriched {new Date(lead.enriched_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                )}
                {lead.scored_at && (
                  <span>Scored {new Date(lead.scored_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Check, X, RefreshCw, Star, Loader2,
  Mail, Eye, MousePointerClick, MessageSquare, Zap, FlaskConical,
  Send, Clock, TrendingUp,
} from 'lucide-react';
import EmailPreview from '@/components/ui/EmailPreview';
import type { BdrLead, CampaignEmail } from '@/lib/types';

interface EmailSend {
  id: string;
  subject: string;
  angle: string;
  variant_id?: string | null;
  sent_at: string;
  open_count: number;
  first_open_at?: string | null;
  click_count?: number;
  replied: boolean;
  reply_at: string | null;
  reply_sentiment?: string | null;
}

interface CampaignCardProps {
  lead: BdrLead;
  selected: boolean;
  onSelect: (id: string) => void;
  onAction: (ids: string[], action: 'approve' | 'reject') => Promise<void>;
  onRegenerate: (leadId: string, angle: string, tone?: string, instructions?: string) => Promise<void>;
  onEdit: (leadId: string, subject: string, body: string) => Promise<void>;
  sends?: EmailSend[];
}

const angleLabels: Record<string, string> = {
  missed_calls: 'Missed Calls',
  commission_savings: 'Commission',
  delivery_ops: 'Delivery Ops',
  delivery_savings: 'Delivery Savings',
  tech_consolidation: 'Tech Stack',
  customer_experience: 'CX',
};

const tierColors: Record<string, { bg: string; text: string }> = {
  tier_1: { bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  tier_2: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  tier_3: { bg: 'bg-gray-500/10', text: 'text-gray-400' },
};

const stepStatusColors: Record<string, string> = {
  sent: 'bg-green-500',
  ready: 'bg-yellow-500',
  scheduled: 'bg-blue-500',
  pending: 'bg-gray-600',
  skipped: 'bg-red-500/50',
};

const sentimentColors: Record<string, string> = {
  positive: 'text-green-400',
  neutral: 'text-gray-400',
  negative: 'text-red-400',
  interested: 'text-emerald-400',
  not_interested: 'text-red-400',
};

export default function CampaignCard({
  lead,
  selected,
  onSelect,
  onAction,
  onRegenerate,
  onEdit,
  sends = [],
}: CampaignCardProps) {
  const [showScores, setShowScores] = useState(false);
  const [showRegen, setShowRegen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  const [campaignSteps, setCampaignSteps] = useState<CampaignEmail[]>([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [regenAngle, setRegenAngle] = useState<string>(lead.email_angle || 'missed_calls');
  const [regenTone, setRegenTone] = useState('');
  const [regenInstructions, setRegenInstructions] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testSent, setTestSent] = useState(false);

  // Aggregated engagement metrics
  const metrics = useMemo(() => {
    const totalSent = sends.length;
    const totalOpens = sends.reduce((sum, s) => sum + (s.open_count || 0), 0);
    const totalClicks = sends.reduce((sum, s) => sum + (s.click_count || 0), 0);
    const totalReplies = sends.filter(s => s.replied).length;
    const openRate = totalSent > 0 ? Math.round((sends.filter(s => s.open_count > 0).length / totalSent) * 100) : 0;
    const lastReply = sends.find(s => s.replied && s.reply_sentiment);
    return { totalSent, totalOpens, totalClicks, totalReplies, openRate, lastReply };
  }, [sends]);

  // Fetch campaign steps when toggled
  useEffect(() => {
    if (showCampaign && lead.campaign_template_id && campaignSteps.length === 0) {
      setCampaignLoading(true);
      fetch('/api/bdr/campaigns/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: [lead.lead_id] }),
      })
        .then(res => res.json())
        .then(data => {
          const steps = data.campaigns?.[lead.lead_id] || [];
          setCampaignSteps(steps);
        })
        .catch(() => {})
        .finally(() => setCampaignLoading(false));
    }
  }, [showCampaign, lead.campaign_template_id, lead.lead_id, campaignSteps.length]);

  const handleApprove = async () => {
    setActioning(true);
    try { await onAction([lead.lead_id], 'approve'); } finally { setActioning(false); }
  };

  const handleReject = async () => {
    setActioning(true);
    try { await onAction([lead.lead_id], 'reject'); } finally { setActioning(false); }
  };

  const handleTestSend = async () => {
    setTestSending(true);
    try {
      const res = await fetch('/api/bdr/campaigns/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.lead_id }),
      });
      if (res.ok) {
        setTestSent(true);
        setTimeout(() => setTestSent(false), 3000);
      }
    } catch { /* ignore */ }
    finally { setTestSending(false); }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await onRegenerate(lead.lead_id, regenAngle, regenTone || undefined, regenInstructions || undefined);
      setShowRegen(false);
    } finally {
      setRegenerating(false);
    }
  };

  const handleSaveEdit = async (subject: string, body: string) => {
    await onEdit(lead.lead_id, subject, body);
  };

  const scores = [
    { label: 'Contact', value: lead.contact_quality_score },
    { label: 'Business', value: lead.business_strength_score },
    { label: 'Delivery', value: lead.delivery_potential_score },
    { label: 'Tech', value: lead.tech_stack_score },
    { label: 'Win', value: lead.win_pattern_score },
    { label: 'MRR', value: lead.mrr_potential_score },
  ];

  const hasCampaign = !!lead.campaign_template_id;
  const currentStep = lead.campaign_step || 1;
  const tc = tierColors[lead.tier || ''] || tierColors.tier_3;

  return (
    <div className={`bg-gray-900 border rounded-xl overflow-hidden transition-all ${
      selected ? 'border-blue-500 ring-1 ring-blue-500/20' : 'border-gray-800 hover:border-gray-700'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(lead.lead_id)}
          className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500/30"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">
              {lead.business_name || 'Unknown Business'}
            </span>
            {lead.tier && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tc.bg} ${tc.text}`}>
                {lead.tier.replace('_', ' ').toUpperCase()}
              </span>
            )}
            {lead.email_angle && (
              <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                {angleLabels[lead.email_angle] || lead.email_angle}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-gray-400">{lead.contact_name || 'No contact'}</span>
            {lead.contact_email && (
              <span className="text-xs text-gray-500 truncate">{lead.contact_email}</span>
            )}
            {lead.city && <span className="text-xs text-gray-600">{lead.city}, {lead.state}</span>}
          </div>
        </div>

        {/* Engagement metrics pills */}
        {metrics.totalSent > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="flex items-center gap-1 text-[10px] bg-gray-800 text-gray-400 px-1.5 py-1 rounded" title="Emails sent">
              <Send className="w-3 h-3" />{metrics.totalSent}
            </span>
            <span className={`flex items-center gap-1 text-[10px] px-1.5 py-1 rounded ${
              metrics.totalOpens > 0 ? 'bg-yellow-900/30 text-yellow-400' : 'bg-gray-800 text-gray-600'
            }`} title={`${metrics.totalOpens} opens (${metrics.openRate}% rate)`}>
              <Eye className="w-3 h-3" />{metrics.totalOpens}
            </span>
            <span className={`flex items-center gap-1 text-[10px] px-1.5 py-1 rounded ${
              metrics.totalClicks > 0 ? 'bg-cyan-900/30 text-cyan-400' : 'bg-gray-800 text-gray-600'
            }`} title={`${metrics.totalClicks} link clicks`}>
              <MousePointerClick className="w-3 h-3" />{metrics.totalClicks}
            </span>
            <span className={`flex items-center gap-1 text-[10px] px-1.5 py-1 rounded ${
              metrics.totalReplies > 0 ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-600'
            }`} title={`${metrics.totalReplies} replies`}>
              <MessageSquare className="w-3 h-3" />{metrics.totalReplies}
            </span>
          </div>
        )}

        {/* Score */}
        <button
          onClick={() => setShowScores(!showScores)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
            showScores ? 'bg-yellow-600/20 text-yellow-400' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Star className="w-3 h-3" />
          <span className="font-bold">{lead.total_score || '--'}</span>
        </button>

        {hasCampaign && (
          <button
            onClick={() => setShowCampaign(!showCampaign)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-colors ${
              showCampaign ? 'bg-purple-600/30 text-purple-300' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
            title="View campaign sequence"
          >
            <Zap className="w-3 h-3" />Step {currentStep}
          </button>
        )}

        {sends.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-colors ${
              showHistory ? 'bg-blue-600/30 text-blue-300' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
            title="View send history"
          >
            <Mail className="w-3 h-3" />{sends.length}
          </button>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleTestSend}
            disabled={testSending || !lead.email_subject}
            className={`p-1.5 rounded-lg transition-colors ${
              testSent ? 'bg-green-600/30 text-green-400' : 'bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 disabled:opacity-30'
            }`}
            title={testSent ? 'Test sent!' : 'Send test email'}
          >
            {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
          </button>
          <button onClick={handleApprove} disabled={actioning}
            className="p-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg transition-colors" title="Approve & send">
            {actioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button onClick={handleReject} disabled={actioning}
            className="p-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors" title="Reject">
            <X className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowRegen(!showRegen)}
            className={`p-1.5 rounded-lg transition-colors ${
              showRegen ? 'bg-blue-600/30 text-blue-300' : 'bg-blue-600/20 hover:bg-blue-600/40 text-blue-400'
            }`}
            title="Regenerate email"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Reply sentiment bar */}
      {metrics.totalSent > 0 && metrics.lastReply && (
        <div className="px-4 py-1.5 border-t border-gray-800/50 bg-gray-800/20 flex items-center gap-3">
          <span className="text-[10px] text-gray-500">Last reply:</span>
          <span className={`text-[10px] font-medium ${sentimentColors[metrics.lastReply.reply_sentiment || ''] || 'text-gray-400'}`}>
            {metrics.lastReply.reply_sentiment || 'unknown'}
          </span>
          {metrics.lastReply.reply_at && (
            <span className="text-[10px] text-gray-600">
              {new Date(metrics.lastReply.reply_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {metrics.openRate > 0 && (
            <>
              <span className="text-gray-700">|</span>
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <TrendingUp className="w-3 h-3" />{metrics.openRate}% open rate
              </span>
            </>
          )}
        </div>
      )}

      {/* Score breakdown */}
      {showScores && (
        <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-800/30">
          <div className="grid grid-cols-6 gap-3">
            {scores.map(s => {
              const pct = Math.min(Number(s.value) || 0, 100);
              return (
                <div key={s.label} className="text-center">
                  <div className="text-[10px] text-gray-500 mb-1">{s.label}</div>
                  <div className="relative h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                        pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs font-medium text-white mt-0.5">{s.value ?? '--'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Campaign step progress */}
      {showCampaign && hasCampaign && (
        <div className="px-4 py-3 border-t border-gray-800 bg-purple-900/10 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium text-purple-400 uppercase tracking-wide">Campaign Sequence</div>
            {campaignSteps.length > 0 && (
              <div className="text-[10px] text-gray-500">
                {campaignSteps.filter(s => s.status === 'sent').length}/{campaignSteps.length} sent
              </div>
            )}
          </div>

          {campaignLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
            </div>
          ) : campaignSteps.length > 0 ? (
            <>
              <div className="flex gap-1">
                {campaignSteps.map(step => (
                  <div
                    key={step.id}
                    className={`flex-1 h-2 rounded-full ${stepStatusColors[step.status] || 'bg-gray-600'} ${
                      step.step_number === currentStep ? 'ring-1 ring-white/30' : ''
                    }`}
                    title={`Step ${step.step_number}: ${step.status}${step.channel !== 'email' ? ` (${step.channel})` : ''}`}
                  />
                ))}
              </div>
              <div className="space-y-1">
                {campaignSteps.map(step => (
                  <div key={step.id} className={`flex items-center gap-2 p-1.5 rounded-lg text-xs ${
                    step.step_number === currentStep ? 'bg-purple-900/30 border border-purple-800/50' : ''
                  }`}>
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${
                      step.status === 'sent' ? 'bg-green-600 text-white' :
                      step.status === 'ready' ? 'bg-yellow-600 text-white' :
                      step.status === 'scheduled' ? 'bg-blue-600 text-white' :
                      step.status === 'skipped' ? 'bg-red-600/50 text-red-200' :
                      'bg-gray-700 text-gray-400'
                    }`}>{step.step_number}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-300 truncate">
                        {step.channel === 'email' ? (step.subject || 'Email') : step.channel}
                      </span>
                      {step.angle && (
                        <span className="text-[10px] text-gray-600 ml-1.5">{angleLabels[step.angle] || step.angle}</span>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {step.delay_days > 0 && step.status === 'pending' && (
                        <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />+{step.delay_days}d
                        </span>
                      )}
                      {step.scheduled_at && step.status === 'scheduled' && (
                        <span className="text-[10px] text-blue-400">
                          {new Date(step.scheduled_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {step.sent_at && (
                        <span className="text-[10px] text-green-400">
                          {new Date(step.sent_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        step.status === 'sent' ? 'bg-green-900/50 text-green-300' :
                        step.status === 'ready' ? 'bg-yellow-900/50 text-yellow-300' :
                        step.status === 'scheduled' ? 'bg-blue-900/50 text-blue-300' :
                        step.status === 'skipped' ? 'bg-red-900/50 text-red-300' :
                        'bg-gray-800 text-gray-500'
                      }`}>{step.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500">No campaign steps generated yet</p>
          )}
        </div>
      )}

      {/* Send history with per-email metrics */}
      {showHistory && sends.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-800 bg-gray-800/20 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Send History</div>
            <div className="text-[10px] text-gray-600">{metrics.openRate}% open rate</div>
          </div>
          {sends.map((send, idx) => (
            <div key={send.id} className="flex items-center gap-3 p-2 bg-gray-800/40 rounded-lg">
              <span className="text-[10px] text-gray-600 font-mono w-6 shrink-0">#{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 truncate">{send.subject}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-500">
                    {new Date(send.sent_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </span>
                  {send.angle && (
                    <span className="text-[10px] text-gray-600">{angleLabels[send.angle] || send.angle}</span>
                  )}
                  {send.variant_id && (
                    <span className="text-[10px] text-purple-500/60">v:{send.variant_id.slice(0, 6)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={send.open_count > 0 ? 'flex items-center gap-0.5 text-yellow-400' : ''} title={`${send.open_count} opens`}>
                  <Eye className={`w-3 h-3 ${send.open_count > 0 ? '' : 'text-gray-700'}`} />
                  {send.open_count > 0 && <span className="text-[10px] font-medium">{send.open_count}</span>}
                </span>
                <span className={(send.click_count || 0) > 0 ? 'flex items-center gap-0.5 text-cyan-400' : ''} title={`${send.click_count || 0} clicks`}>
                  <MousePointerClick className={`w-3 h-3 ${(send.click_count || 0) > 0 ? '' : 'text-gray-700'}`} />
                  {(send.click_count || 0) > 0 && <span className="text-[10px] font-medium">{send.click_count}</span>}
                </span>
                {send.replied ? (
                  <span className="flex items-center gap-0.5" title={send.reply_sentiment ? `Reply: ${send.reply_sentiment}` : 'Replied'}>
                    <MessageSquare className={`w-3 h-3 ${sentimentColors[send.reply_sentiment || ''] || 'text-green-400'}`} />
                    {send.reply_sentiment && (
                      <span className={`text-[10px] ${sentimentColors[send.reply_sentiment] || 'text-green-400'}`}>
                        {send.reply_sentiment}
                      </span>
                    )}
                  </span>
                ) : (
                  <MessageSquare className="w-3 h-3 text-gray-700" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Regenerate panel */}
      {showRegen && (
        <div className="px-4 py-3 border-t border-gray-800 bg-blue-900/10 space-y-2">
          <div className="text-[10px] font-medium text-blue-400 uppercase tracking-wide mb-1">Regenerate Email</div>
          <div className="flex gap-2">
            <select value={regenAngle} onChange={(e) => setRegenAngle(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 flex-1">
              {Object.entries(angleLabels).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select value={regenTone} onChange={(e) => setRegenTone(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 flex-1">
              <option value="">Default tone</option>
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="direct">Direct</option>
              <option value="casual">Casual</option>
            </select>
          </div>
          <input type="text" value={regenInstructions} onChange={(e) => setRegenInstructions(e.target.value)}
            placeholder="Custom instructions (optional)"
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white placeholder:text-gray-600" />
          <button onClick={handleRegenerate} disabled={regenerating}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
            {regenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {regenerating ? 'Regenerating...' : 'Regenerate Email'}
          </button>
        </div>
      )}

      {/* Email preview */}
      {lead.email_subject && (
        <div className="px-4 pb-3 pt-1">
          <EmailPreview
            subject={lead.email_subject}
            body={lead.email_body || ''}
            status="draft"
            editable={true}
            onSave={handleSaveEdit}
          />
        </div>
      )}
    </div>
  );
}

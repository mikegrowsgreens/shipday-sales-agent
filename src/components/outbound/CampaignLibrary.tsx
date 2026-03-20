'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, ChevronDown, ChevronUp, Users, Zap, Eye,
  CheckCircle2, AlertCircle, Layers, Mail, Phone, Linkedin,
  Library, ArrowRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import TestSendButton from '@/components/ui/TestSendButton';

interface LibraryStep {
  step_number: number;
  delay_days: number;
  channel: string;
  angle: string;
  tone: string;
  instructions: string;
}

interface LibraryVariant {
  name: string;
  description: string;
  steps: LibraryStep[];
}

interface LibraryTier {
  name: string;
  tier_key: string;
  variants: { A: LibraryVariant; B: LibraryVariant; C?: LibraryVariant };
}

interface SeededTemplate {
  id: number;
  tier: string;
  name: string;
  variant: string | null;
  is_active: boolean;
}

interface AssignResult {
  lead_id: string;
  template_id: number;
  template_name: string;
  variant: string;
  steps_generated: number;
  first_step_subject: string;
}

interface Lead {
  lead_id: string;
  business_name: string | null;
  contact_name: string | null;
  tier: string | null;
  status: string;
}

const tierColors: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  tier_1: { bg: 'bg-yellow-500/5', border: 'border-yellow-500/20', text: 'text-yellow-400', accent: 'bg-yellow-500/20' },
  tier_2: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', text: 'text-blue-400', accent: 'bg-blue-500/20' },
  tier_3: { bg: 'bg-gray-500/5', border: 'border-gray-500/20', text: 'text-gray-400', accent: 'bg-gray-500/20' },
};

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  call: Phone,
  linkedin: Linkedin,
};

export default function CampaignLibrary() {
  const [library, setLibrary] = useState<LibraryTier[]>([]);
  const [seededTemplates, setSeededTemplates] = useState<SeededTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState<Set<string>>(new Set());

  // Email preview state
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [emailPreviews, setEmailPreviews] = useState<Record<string, { subject: string; body: string; lead: { business_name: string; contact_name: string; city: string; state: string } }>>({});

  // Lead selection for assignment
  const [assigningCampaign, setAssigningCampaign] = useState<string | null>(null);
  const [availableLeads, setAvailableLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [assignVariant, setAssignVariant] = useState<'A' | 'B' | 'C' | 'random'>('random');
  const [assigning, setAssigning] = useState(false);
  const [assignResults, setAssignResults] = useState<AssignResult[] | null>(null);

  const { addToast } = useToast();

  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/bdr/campaign-library');
      const data = await res.json();
      setLibrary(data.library || []);
      setSeededTemplates(data.templates || []);
    } catch (err) {
      console.error('[campaign-library] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  const generatePreview = async (tierKey: string, variantKey: string, step: LibraryStep) => {
    const key = `${tierKey}:${variantKey}`;
    if (emailPreviews[key]) return; // already cached
    setPreviewLoading(key);
    try {
      const res = await fetch('/api/bdr/campaign-templates/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, tier: tierKey }),
      });
      if (res.ok) {
        const data = await res.json();
        setEmailPreviews(prev => ({ ...prev, [key]: data }));
      } else {
        addToast('Failed to generate preview', 'error');
      }
    } catch {
      addToast('Preview generation failed', 'error');
    } finally {
      setPreviewLoading(null);
    }
  };

  const toggleExpanded = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const togglePreview = (key: string) => {
    setPreviewOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const openAssignment = async (tierKey: string) => {
    setAssigningCampaign(tierKey);
    setSelectedLeadIds(new Set());
    setAssignResults(null);
    setAssignVariant('random');
    setLeadsLoading(true);

    try {
      // Fetch leads that match this tier and are eligible
      const res = await fetch(`/api/bdr/leads?status=scored,email_ready&limit=100`);
      const data = await res.json();
      const leads = (data.leads || []).filter((l: Lead) =>
        l.tier === tierKey && ['scored', 'email_ready', 'new'].includes(l.status)
      );
      setAvailableLeads(leads);
    } catch {
      setAvailableLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  };

  const closeAssignment = () => {
    setAssigningCampaign(null);
    setAvailableLeads([]);
    setSelectedLeadIds(new Set());
    setAssignResults(null);
  };

  const toggleLeadSelection = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllLeads = () => {
    if (selectedLeadIds.size === availableLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(availableLeads.map(l => l.lead_id)));
    }
  };

  const assignToLeads = async () => {
    if (selectedLeadIds.size === 0 || !assigningCampaign) return;

    setAssigning(true);
    try {
      const body: Record<string, unknown> = {
        lead_ids: Array.from(selectedLeadIds).map(Number),
        tier: assigningCampaign,
      };
      if (assignVariant !== 'random') {
        body.variant = assignVariant;
      }

      const res = await fetch('/api/bdr/campaign-library/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setAssignResults(data.results || []);
        const split = data.variant_split || {};
        const parts = Object.entries(split).map(([k, v]) => `${k}=${v}`).join(', ');
        addToast(`Assigned ${data.generated} leads (${parts || 'done'})`, 'success');
      } else {
        const err = await res.json();
        addToast(`Assignment failed: ${err.error}`, 'error');
      }
    } catch {
      addToast('Failed to assign campaigns', 'error');
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Library className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Campaign Library</h2>
            <p className="text-xs text-gray-500">Pre-built A/B/C campaigns ready for one-click assignment</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{library.length} tiers</span>
          <span className="text-gray-700">|</span>
          <span>{library.reduce((acc, t) => acc + Object.keys(t.variants).length, 0)} campaigns</span>
        </div>
      </div>

      {/* Campaign cards by tier */}
      {library.map(tier => {
        const colors = tierColors[tier.tier_key] || tierColors.tier_3;
        const isExpanded = expanded.has(tier.tier_key);

        return (
          <div key={tier.tier_key} className={`${colors.bg} border ${colors.border} rounded-xl overflow-hidden`}>
            {/* Tier header */}
            <button
              onClick={() => toggleExpanded(tier.tier_key)}
              className="flex items-center gap-3 w-full px-5 py-4 text-left"
            >
              {isExpanded
                ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              }
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${colors.accent} ${colors.text}`}>
                {tier.tier_key.replace('_', ' ').toUpperCase()}
              </span>
              <span className="text-sm font-semibold text-white flex-1">{tier.name}</span>
              <span className="text-xs text-gray-500">{Object.keys(tier.variants).length} variants - 5 steps each</span>
            </button>

            {/* Variant cards */}
            {isExpanded && (
              <div className="px-5 pb-5 grid grid-cols-2 gap-4">
                {(Object.keys(tier.variants) as Array<'A' | 'B' | 'C'>).filter(k => tier.variants[k]).map(variantKey => {
                  const variant = tier.variants[variantKey]!;
                  const cardKey = `${tier.tier_key}:${variantKey}`;
                  const isPreview = previewOpen.has(cardKey);
                  const seeded = seededTemplates.find(
                    t => t.tier === tier.tier_key && t.variant === variantKey
                  );

                  return (
                    <div key={variantKey} className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
                      {/* Variant header */}
                      <div className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            variantKey === 'A' ? 'bg-emerald-500/20 text-emerald-400'
                              : variantKey === 'B' ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-cyan-500/20 text-cyan-400'
                          }`}>
                            {variantKey}
                          </span>
                          <span className="text-sm font-medium text-white">{variant.name}</span>
                          {seeded && (
                            <span className="ml-auto" title="Seeded in database"><CheckCircle2 className="w-3 h-3 text-green-500" /></span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{variant.description}</p>

                        {/* Angle progression preview */}
                        <div className="flex items-center gap-1 pt-1">
                          {variant.steps.map((step, i) => {
                            const ChannelIcon = channelIcons[step.channel] || Mail;
                            return (
                              <div key={i} className="flex items-center gap-1">
                                {i > 0 && <ArrowRight className="w-2.5 h-2.5 text-gray-700" />}
                                <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] ${colors.accent} ${colors.text}`}>
                                  <ChannelIcon className="w-2.5 h-2.5" />
                                  {step.angle.replace(/_/g, ' ')}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-2">
                          <button
                            onClick={() => togglePreview(cardKey)}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg"
                          >
                            <Eye className="w-3 h-3" />
                            {isPreview ? 'Hide Steps' : 'Preview'}
                          </button>
                          <button
                            onClick={() => generatePreview(tier.tier_key, variantKey, variant.steps[0])}
                            disabled={previewLoading === cardKey}
                            className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 text-xs rounded-lg disabled:opacity-50"
                          >
                            {previewLoading === cardKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                            {emailPreviews[cardKey] ? 'Example Generated' : 'Example Email'}
                          </button>
                          <button
                            onClick={() => openAssignment(tier.tier_key)}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-600/80 hover:bg-blue-600 text-white text-xs rounded-lg ml-auto"
                          >
                            <Users className="w-3 h-3" />
                            Assign to Leads
                          </button>
                        </div>

                        {/* Real email preview */}
                        {emailPreviews[cardKey] && (
                          <div className="mt-3 border border-purple-500/20 rounded-lg overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border-b border-purple-500/20">
                              <Mail className="w-3 h-3 text-purple-400" />
                              <span className="text-[10px] text-purple-400 font-medium">Example Email - Step 1</span>
                              <TestSendButton
                                onSend={async (email) => {
                                  const res = await fetch('/api/test-send', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      subject: emailPreviews[cardKey].subject,
                                      body: emailPreviews[cardKey].body,
                                      recipient_email: email,
                                    }),
                                  });
                                  if (!res.ok) throw new Error('Test send failed');
                                }}
                                size="sm"
                              />
                              <span className="text-[10px] text-gray-500 ml-auto">
                                Sample: {emailPreviews[cardKey].lead.business_name} ({emailPreviews[cardKey].lead.city}, {emailPreviews[cardKey].lead.state})
                              </span>
                            </div>
                            <div className="p-3 space-y-2">
                              <div className="text-xs">
                                <span className="text-gray-500">Subject: </span>
                                <span className="text-white font-medium">{emailPreviews[cardKey].subject}</span>
                              </div>
                              <div className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-800/50 rounded p-3">
                                {emailPreviews[cardKey].body}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Step preview */}
                      {isPreview && (
                        <div className="border-t border-gray-800 p-4 space-y-2">
                          {variant.steps.map((step, i) => {
                            const ChannelIcon = channelIcons[step.channel] || Mail;
                            return (
                              <div key={i} className="flex gap-3 text-xs">
                                <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${colors.accent}`}>
                                    <ChannelIcon className={`w-3 h-3 ${colors.text}`} />
                                  </div>
                                  {i < variant.steps.length - 1 && (
                                    <div className="w-px h-full bg-gray-800 min-h-[20px]" />
                                  )}
                                </div>
                                <div className="flex-1 pb-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-white">Step {step.step_number}</span>
                                    <span className="text-gray-600">|</span>
                                    <span className={colors.text}>{step.angle.replace(/_/g, ' ')}</span>
                                    <span className="text-gray-600">|</span>
                                    <span className="text-gray-500">{step.tone}</span>
                                    {step.delay_days > 0 && (
                                      <span className="text-gray-600 ml-auto">+{step.delay_days}d</span>
                                    )}
                                  </div>
                                  <p className="text-gray-400 mt-1 leading-relaxed">{step.instructions}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Assignment modal overlay */}
      {assigningCampaign && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div>
                <h3 className="text-sm font-semibold text-white">Assign Campaign</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select leads for {assigningCampaign.replace('_', ' ').toUpperCase()} campaign
                </p>
              </div>
              <button onClick={closeAssignment} className="text-gray-500 hover:text-white text-sm">
                Close
              </button>
            </div>

            {/* Assignment results */}
            {assignResults && (
              <div className="px-5 py-3 bg-green-500/10 border-b border-green-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-300 font-medium">
                    Successfully assigned {assignResults.length} leads
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {assignResults.map(r => (
                    <span key={r.lead_id} className="text-[10px] text-gray-400 bg-gray-800/50 px-2 py-0.5 rounded">
                      Lead #{r.lead_id} - Variant {r.variant} - {r.steps_generated} steps
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                  Emails are now in the Queue tab for review.
                </p>
              </div>
            )}

            {/* Variant selector */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800">
              <span className="text-xs text-gray-500">Variant:</span>
              {(['random', 'A', 'B', 'C'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setAssignVariant(v)}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                    assignVariant === v
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {v === 'random' ? 'Random' : `Variant ${v}`}
                </button>
              ))}
            </div>

            {/* Lead list */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {leadsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                </div>
              ) : availableLeads.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No eligible leads for this tier</p>
                  <p className="text-xs text-gray-600 mt-1">Leads must be scored or email_ready status</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Select all */}
                  <button
                    onClick={selectAllLeads}
                    className="text-xs text-blue-400 hover:text-blue-300 mb-2"
                  >
                    {selectedLeadIds.size === availableLeads.length ? 'Deselect all' : `Select all (${availableLeads.length})`}
                  </button>

                  {availableLeads.map(lead => (
                    <label
                      key={lead.lead_id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedLeadIds.has(lead.lead_id)
                          ? 'bg-blue-600/10 border border-blue-500/20'
                          : 'bg-gray-800/50 border border-transparent hover:bg-gray-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.has(lead.lead_id)}
                        onChange={() => toggleLeadSelection(lead.lead_id)}
                        className="rounded border-gray-600"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-white font-medium">{lead.business_name || 'Unknown'}</span>
                        {lead.contact_name && (
                          <span className="text-xs text-gray-500 ml-2">{lead.contact_name}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-600">{lead.status}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800">
              <span className="text-xs text-gray-500">
                {selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={closeAssignment}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={assignToLeads}
                  disabled={selectedLeadIds.size === 0 || assigning}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg"
                >
                  {assigning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Generate & Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

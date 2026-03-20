'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Save, ChevronDown, ChevronUp,
  Zap, Users, CheckCircle2, AlertCircle, ShieldCheck,
  Activity, Copy, Archive,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import CampaignBuilder from '@/components/outbound/CampaignBuilder';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TemplateStep {
  step_number: number;
  delay_days: number;
  channel: string;
  angle: string;
  tone: string;
  instructions: string;
  branch_rules?: Record<string, unknown>;
}

interface CampaignTemplate {
  id: number;
  tier: string;
  name: string;
  description: string | null;
  thread_theme: string | null;
  steps: TemplateStep[];
  is_active: boolean;
  auto_approve_score_threshold: number | null;
  is_library_template?: boolean;
  variant?: string | null;
  campaign_notes?: string | null;
  generation_mode?: string | null;
}

interface GenerateResult {
  lead_id: number;
  template_id: number;
  steps_generated: number;
  first_step_subject: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const tierColors: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  tier_1: { bg: 'bg-yellow-500/5', border: 'border-yellow-500/20', text: 'text-yellow-400', accent: 'bg-yellow-500/20' },
  tier_2: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', text: 'text-blue-400', accent: 'bg-blue-500/20' },
  tier_3: { bg: 'bg-gray-500/5', border: 'border-gray-500/20', text: 'text-gray-400', accent: 'bg-gray-500/20' },
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function TierCampaignEditor() {
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());

  // Generate campaign state
  const [generating, setGenerating] = useState<number | null>(null);
  const [generateResults, setGenerateResults] = useState<Record<number, { results: GenerateResult[]; error?: string }>>({});
  const [tierLeadCounts, setTierLeadCounts] = useState<Record<string, number>>({});
  const [tierLeadIds, setTierLeadIds] = useState<Record<string, number[]>>({});

  // Clone/archive state
  const [cloning, setCloning] = useState<number | null>(null);
  const [archiving, setArchiving] = useState<number | null>(null);
  const { addToast } = useToast();

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/bdr/campaign-templates');
      const data = await res.json();
      setTemplates(data.templates || []);
      const exp: Record<number, boolean> = {};
      for (const t of data.templates || []) exp[t.id] = true;
      setExpanded(exp);
    } catch (err) {
      console.error('[templates] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTierCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/bdr/leads?limit=0');
      const data = await res.json();
      const tierDist: Array<{ tier: string; count: number }> = data.tierDist || [];
      const counts: Record<string, number> = {};
      for (const t of tierDist) counts[t.tier] = t.count;
      setTierLeadCounts(counts);
    } catch {
      // non-critical
    }
  }, []);

  const fetchTierLeadIds = useCallback(async (tierKey: string) => {
    try {
      // Fetch scored and email_ready leads separately (API doesn't support comma-separated status)
      const [scoredRes, readyRes] = await Promise.all([
        fetch(`/api/bdr/leads?status=scored&tier=${tierKey}&limit=50`),
        fetch(`/api/bdr/leads?status=email_ready&tier=${tierKey}&limit=50`),
      ]);
      const scoredData = await scoredRes.json();
      const readyData = await readyRes.json();
      const allLeads = [...(scoredData.leads || []), ...(readyData.leads || [])];
      // Deduplicate by lead_id
      const seen = new Set<number>();
      const ids = allLeads
        .map((l: { lead_id: number }) => l.lead_id)
        .filter((id: number) => { if (seen.has(id)) return false; seen.add(id); return true; });
      setTierLeadIds(prev => ({ ...prev, [tierKey]: ids }));
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchTierCounts();
  }, [fetchTemplates, fetchTierCounts]);

  // Fetch lead IDs per tier for CampaignBuilder
  useEffect(() => {
    const tiers = new Set(templates.map(t => t.tier));
    for (const t of tiers) {
      if (!tierLeadIds[t]) fetchTierLeadIds(t);
    }
  }, [templates, tierLeadIds, fetchTierLeadIds]);

  const updateTemplate = (templateId: number, updater: (t: CampaignTemplate) => CampaignTemplate) => {
    setTemplates(prev => prev.map(t => t.id === templateId ? updater(t) : t));
    setDirty(prev => new Set(prev).add(templateId));
  };

  const saveTemplate = async (templateId: number) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    setSaving(templateId);
    try {
      await fetch('/api/bdr/campaign-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: templateId,
          name: template.name,
          description: template.description,
          thread_theme: template.thread_theme,
          steps: template.steps,
          auto_approve_score_threshold: template.auto_approve_score_threshold,
          campaign_notes: template.campaign_notes,
          generation_mode: template.generation_mode,
        }),
      });
      setDirty(prev => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
      addToast('Template saved', 'success');
    } catch (err) {
      console.error('[save template] error:', err);
      addToast('Failed to save template', 'error');
    } finally {
      setSaving(null);
    }
  };

  const generateForTier = async (template: CampaignTemplate) => {
    setGenerating(template.id);
    setGenerateResults(prev => ({ ...prev, [template.id]: { results: [] } }));

    try {
      // Fetch scored and email_ready leads for this tier separately
      const [scoredRes, readyRes] = await Promise.all([
        fetch(`/api/bdr/leads?status=scored&tier=${template.tier}&limit=50`),
        fetch(`/api/bdr/leads?status=email_ready&tier=${template.tier}&limit=50`),
      ]);
      const scoredData = await scoredRes.json();
      const readyData = await readyRes.json();
      const allLeads = [...(scoredData.leads || []), ...(readyData.leads || [])];

      // Deduplicate and take up to 10
      const seen = new Set<number>();
      const eligibleIds = allLeads
        .map((l: { lead_id: number }) => l.lead_id)
        .filter((id: number) => { if (seen.has(id)) return false; seen.add(id); return true; })
        .slice(0, 10);

      if (eligibleIds.length === 0) {
        setGenerateResults(prev => ({
          ...prev,
          [template.id]: { results: [], error: 'No eligible leads found for this tier.' },
        }));
        return;
      }

      // force=true allows regeneration for previously-contacted leads
      const res = await fetch('/api/bdr/campaigns/generate-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: eligibleIds, template_id: template.id, force: true }),
      });

      if (res.ok) {
        const data = await res.json();
        setGenerateResults(prev => ({
          ...prev,
          [template.id]: { results: data.results || [] },
        }));
      } else {
        const err = await res.json();
        setGenerateResults(prev => ({
          ...prev,
          [template.id]: { results: [], error: err.error || 'Generation failed' },
        }));
      }
    } catch (err) {
      console.error('[generateForTier] error:', err);
      setGenerateResults(prev => ({
        ...prev,
        [template.id]: { results: [], error: 'Network error' },
      }));
    } finally {
      setGenerating(null);
    }
  };

  const cloneTemplate = async (templateId: number) => {
    setCloning(templateId);
    try {
      const res = await fetch(`/api/bdr/campaigns/${templateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clone' }),
      });
      if (res.ok) {
        const data = await res.json();
        addToast(`Campaign cloned: ${data.template?.name}`, 'success');
        fetchTemplates();
      } else {
        const err = await res.json();
        addToast(`Clone failed: ${err.error}`, 'error');
      }
    } catch {
      addToast('Network error', 'error');
    } finally {
      setCloning(null);
    }
  };

  const archiveTemplate = async (templateId: number) => {
    setArchiving(templateId);
    try {
      const res = await fetch(`/api/bdr/campaigns/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      });
      if (res.ok) {
        addToast('Campaign archived', 'success');
        fetchTemplates();
      } else {
        const err = await res.json();
        addToast(`Archive failed: ${err.error}`, 'error');
      }
    } catch {
      addToast('Network error', 'error');
    } finally {
      setArchiving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  const tierOrder = ['tier_1', 'tier_2', 'tier_3'];

  return (
    <div className="space-y-6">
      {tierOrder.map(tierKey => {
        const tierTemplates = templates.filter(t => t.tier === tierKey);
        if (tierTemplates.length === 0) return null;
        const colors = tierColors[tierKey] || tierColors.tier_3;

        return tierTemplates.map(template => {
          const isExpanded = expanded[template.id] !== false;
          const isDirty = dirty.has(template.id);
          const isGenerating = generating === template.id;
          const genResult = generateResults[template.id];
          const leadCount = tierLeadCounts[tierKey] || 0;
          const leadIds = tierLeadIds[tierKey] || [];

          return (
            <div key={template.id} className={`${colors.bg} border ${colors.border} rounded-xl overflow-hidden`}>
              {/* Template header */}
              <div className="flex items-center gap-3 px-5 py-4">
                <button
                  onClick={() => setExpanded(prev => ({ ...prev, [template.id]: !prev[template.id] }))}
                  className="shrink-0"
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${colors.accent} ${colors.text}`}>
                      {tierKey.replace('_', ' ').toUpperCase()}
                    </span>
                    <input
                      type="text"
                      value={template.name}
                      onChange={(e) => updateTemplate(template.id, t => ({ ...t, name: e.target.value }))}
                      className="text-sm font-semibold text-white bg-transparent border-none outline-none flex-1"
                    />
                  </div>
                  <input
                    type="text"
                    value={template.description || ''}
                    onChange={(e) => updateTemplate(template.id, t => ({ ...t, description: e.target.value }))}
                    placeholder="Template description..."
                    className="text-xs text-gray-500 bg-transparent border-none outline-none w-full mt-0.5"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {leadCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-500">
                      <Users className="w-3 h-3" />
                      {leadCount} leads
                    </span>
                  )}

                  {/* Variant badge */}
                  {template.variant && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      template.variant === 'A' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : template.variant === 'B' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    }`}>
                      Variant {template.variant}
                    </span>
                  )}

                  {/* Library badge */}
                  {template.is_library_template && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      Library
                    </span>
                  )}

                  {/* Adaptive badge */}
                  {template.steps.some(s => s.branch_rules && Object.keys(s.branch_rules).length > 0) && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 text-[10px] font-medium border border-purple-500/30">
                      <Activity className="w-3 h-3" />
                      Adaptive
                    </span>
                  )}

                  {/* Auto-approve toggle */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const newVal = template.auto_approve_score_threshold !== null ? null : 50;
                        updateTemplate(template.id, t => ({ ...t, auto_approve_score_threshold: newVal }));
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-colors ${
                        template.auto_approve_score_threshold !== null
                          ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                          : 'bg-gray-800 text-gray-500 border border-gray-700'
                      }`}
                      title={template.auto_approve_score_threshold !== null
                        ? `Auto-approves leads with score >= ${template.auto_approve_score_threshold}`
                        : 'Enable auto-approve for this tier'}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      Auto
                    </button>
                    {template.auto_approve_score_threshold !== null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] text-gray-500">&ge;</span>
                        <input
                          type="number"
                          value={template.auto_approve_score_threshold}
                          onChange={(e) => updateTemplate(template.id, t => ({
                            ...t,
                            auto_approve_score_threshold: parseInt(e.target.value) || 0,
                          }))}
                          className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white text-center"
                          min={0}
                          max={100}
                        />
                      </div>
                    )}
                  </div>

                  {/* Clone button */}
                  <button
                    onClick={() => cloneTemplate(template.id)}
                    disabled={cloning === template.id}
                    className="flex items-center gap-1 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs rounded-lg"
                    title="Clone this campaign"
                  >
                    {cloning === template.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                  </button>

                  {/* Archive button */}
                  <button
                    onClick={() => archiveTemplate(template.id)}
                    disabled={archiving === template.id}
                    className="flex items-center gap-1 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400 text-xs rounded-lg"
                    title="Archive this campaign"
                  >
                    {archiving === template.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                  </button>

                  {/* Legacy Generate Button (per-step) */}
                  <button
                    onClick={() => generateForTier(template)}
                    disabled={isGenerating || isDirty}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/80 hover:bg-green-600 disabled:opacity-50 text-white text-xs rounded-lg"
                    title={isDirty ? 'Save template first' : 'Generate per-step campaigns for eligible leads'}
                  >
                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Generate
                  </button>

                  {isDirty && (
                    <button
                      onClick={() => saveTemplate(template.id)}
                      disabled={saving === template.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg"
                    >
                      {saving === template.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save
                    </button>
                  )}
                </div>
              </div>

              {/* Generation results banner */}
              {genResult && (
                <div className={`mx-5 mb-3 px-4 py-3 rounded-lg border ${
                  genResult.error
                    ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-green-500/10 border-green-500/20'
                }`}>
                  {genResult.error ? (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-xs text-red-300">{genResult.error}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                        <span className="text-xs text-green-300 font-medium">
                          Generated campaigns for {genResult.results.length} leads
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 ml-6">
                        {genResult.results.map(r => (
                          <span key={r.lead_id} className="text-[10px] text-gray-400 bg-gray-800/50 px-2 py-0.5 rounded">
                            Lead #{r.lead_id}: {r.steps_generated} steps
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-500 ml-6">
                        First step emails are now in the Queue tab for review and approval.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Campaign Builder (replaces per-step editor) */}
              {isExpanded && (
                <div className="px-5 pb-5">
                  <CampaignBuilder
                    templateId={template.id}
                    tier={tierKey}
                    leadIds={leadIds}
                    onGenerated={() => {
                      fetchTierCounts();
                      fetchTierLeadIds(tierKey);
                    }}
                  />
                </div>
              )}
            </div>
          );
        });
      })}
    </div>
  );
}

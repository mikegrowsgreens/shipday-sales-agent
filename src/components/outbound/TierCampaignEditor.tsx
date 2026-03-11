'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Save, Plus, Trash2, ChevronDown, ChevronUp,
  Play, Eye, GripVertical, Mail, Phone, Linkedin,
  Zap, Users, CheckCircle2, AlertCircle, ShieldCheck,
  GitBranch, Activity,
} from 'lucide-react';
import EmailPreview from '@/components/ui/EmailPreview';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BranchRule {
  action: string;
  channel?: string;
  angle?: string;
  tone?: string;
  reduce_delay_days?: number;
}

interface StepBranchRules {
  no_opens?: BranchRule;
  opened_no_reply?: BranchRule;
  clicked?: BranchRule;
  multi_open?: BranchRule;
}

interface TemplateStep {
  step_number: number;
  delay_days: number;
  channel: string;
  angle: string;
  tone: string;
  instructions: string;
  branch_rules?: StepBranchRules;
}

interface CampaignTemplate {
  id: number;
  tier: string;
  name: string;
  description: string | null;
  steps: TemplateStep[];
  is_active: boolean;
  auto_approve_score_threshold: number | null;
}

interface TestResult {
  subject: string;
  body: string;
  lead: {
    business_name: string;
    contact_name: string;
    city: string;
    state: string;
    tier: string;
  };
}

interface GenerateResult {
  lead_id: number;
  template_id: number;
  steps_generated: number;
  first_step_subject: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const angleOptions = [
  { value: 'missed_calls', label: 'Missed Calls' },
  { value: 'commission_savings', label: 'Commission Savings' },
  { value: 'delivery_ops', label: 'Delivery Ops' },
  { value: 'tech_consolidation', label: 'Tech Stack' },
  { value: 'customer_experience', label: 'Customer Experience' },
];

const toneOptions = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'direct', label: 'Direct' },
  { value: 'casual', label: 'Casual' },
];

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  call: Phone,
  linkedin: Linkedin,
};

const tierColors: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  tier_1: { bg: 'bg-yellow-500/5', border: 'border-yellow-500/20', text: 'text-yellow-400', accent: 'bg-yellow-500/20' },
  tier_2: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', text: 'text-blue-400', accent: 'bg-blue-500/20' },
  tier_3: { bg: 'bg-gray-500/5', border: 'border-gray-500/20', text: 'text-gray-400', accent: 'bg-gray-500/20' },
};

const engagementSignals = [
  { key: 'no_opens' as const, label: 'No Opens', icon: '📭', desc: 'Lead hasn\'t opened any emails' },
  { key: 'opened_no_reply' as const, label: 'Opened, No Reply', icon: '👁️', desc: 'Opened emails but no reply' },
  { key: 'clicked' as const, label: 'Clicked Links', icon: '🔥', desc: 'Clicked links in emails' },
  { key: 'multi_open' as const, label: 'Multiple Opens', icon: '🔄', desc: 'Opened emails 3+ times' },
];

const branchActions = [
  { value: 'switch_channel', label: 'Switch Channel', desc: 'Change to call/LinkedIn' },
  { value: 'change_angle', label: 'Change Angle', desc: 'Try a different approach' },
  { value: 'regenerate', label: 'Regenerate (AI)', desc: 'AI rewrites with context' },
  { value: 'direct_cta', label: 'Direct CTA', desc: 'More assertive approach' },
  { value: 'accelerate', label: 'Accelerate', desc: 'Send next step sooner' },
  { value: 'skip', label: 'Skip Step', desc: 'Skip this step entirely' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function TierCampaignEditor() {
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [testingStep, setTestingStep] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [branchOpen, setBranchOpen] = useState<Set<string>>(new Set());

  // Generate campaign state
  const [generating, setGenerating] = useState<number | null>(null);
  const [generateResults, setGenerateResults] = useState<Record<number, { results: GenerateResult[]; error?: string }>>({});
  const [tierLeadCounts, setTierLeadCounts] = useState<Record<string, number>>({});

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

  useEffect(() => { fetchTemplates(); fetchTierCounts(); }, [fetchTemplates, fetchTierCounts]);

  const updateTemplate = (templateId: number, updater: (t: CampaignTemplate) => CampaignTemplate) => {
    setTemplates(prev => prev.map(t => t.id === templateId ? updater(t) : t));
    setDirty(prev => new Set(prev).add(templateId));
  };

  const updateStep = (templateId: number, stepIdx: number, field: string, value: string | number) => {
    updateTemplate(templateId, t => ({
      ...t,
      steps: t.steps.map((s, i) => i === stepIdx ? { ...s, [field]: value } : s),
    }));
  };

  const updateBranchRule = (
    templateId: number,
    stepIdx: number,
    signal: keyof StepBranchRules,
    rule: BranchRule | undefined
  ) => {
    updateTemplate(templateId, t => ({
      ...t,
      steps: t.steps.map((s, i) => {
        if (i !== stepIdx) return s;
        const newRules = { ...(s.branch_rules || {}) };
        if (rule) {
          newRules[signal] = rule;
        } else {
          delete newRules[signal];
        }
        const hasRules = Object.keys(newRules).length > 0;
        return { ...s, branch_rules: hasRules ? newRules : undefined };
      }),
    }));
  };

  const addStep = (templateId: number) => {
    updateTemplate(templateId, t => ({
      ...t,
      steps: [...t.steps, {
        step_number: t.steps.length + 1,
        delay_days: t.steps.length > 0 ? (t.steps[t.steps.length - 1].delay_days + 3) : 0,
        channel: 'email',
        angle: 'missed_calls',
        tone: 'professional',
        instructions: '',
      }],
    }));
  };

  const removeStep = (templateId: number, stepIdx: number) => {
    updateTemplate(templateId, t => ({
      ...t,
      steps: t.steps.filter((_, i) => i !== stepIdx).map((s, i) => ({ ...s, step_number: i + 1 })),
    }));
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
          steps: template.steps,
          auto_approve_score_threshold: template.auto_approve_score_threshold,
        }),
      });
      setDirty(prev => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
    } catch (err) {
      console.error('[save template] error:', err);
    } finally {
      setSaving(null);
    }
  };

  const testStep = async (template: CampaignTemplate, step: TemplateStep) => {
    const key = `${template.id}-${step.step_number}`;
    setTestingStep(key);
    try {
      const res = await fetch('/api/bdr/campaign-templates/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, tier: template.tier }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResults(prev => ({ ...prev, [key]: data }));
      }
    } catch (err) {
      console.error('[test step] error:', err);
    } finally {
      setTestingStep(null);
    }
  };

  const generateForTier = async (template: CampaignTemplate) => {
    setGenerating(template.id);
    setGenerateResults(prev => ({ ...prev, [template.id]: { results: [] } }));

    try {
      const leadsRes = await fetch(`/api/bdr/campaigns?status=email_ready&tier=${template.tier}&limit=50`);
      const leadsData = await leadsRes.json();
      const leads = leadsData.leads || [];

      const scoredRes = await fetch(`/api/bdr/leads?status=scored&limit=50`);
      const scoredData = await scoredRes.json();
      const scoredLeads = (scoredData.leads || []).filter((l: { tier: string }) => l.tier === template.tier);

      const eligibleIds = [
        ...leads.filter((l: { campaign_template_id?: number }) => !l.campaign_template_id).map((l: { lead_id: number }) => l.lead_id),
        ...scoredLeads.map((l: { lead_id: number }) => l.lead_id),
      ].slice(0, 10);

      if (eligibleIds.length === 0) {
        setGenerateResults(prev => ({
          ...prev,
          [template.id]: { results: [], error: 'No eligible leads found for this tier.' },
        }));
        return;
      }

      const res = await fetch('/api/bdr/campaigns/generate-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: eligibleIds, template_id: template.id }),
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

  const toggleBranch = (key: string) => {
    setBranchOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
                  <span className="text-xs text-gray-500">{template.steps.length} steps</span>

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
                        ? `Auto-approves leads with score ≥ ${template.auto_approve_score_threshold}`
                        : 'Enable auto-approve for this tier'}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      Auto
                    </button>
                    {template.auto_approve_score_threshold !== null && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] text-gray-500">≥</span>
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

                  {/* Generate Campaign Button */}
                  <button
                    onClick={() => generateForTier(template)}
                    disabled={isGenerating || isDirty}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/80 hover:bg-green-600 disabled:opacity-50 text-white text-xs rounded-lg"
                    title={isDirty ? 'Save template first' : 'Generate campaigns for eligible leads'}
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

              {/* Steps editor */}
              {isExpanded && (
                <div className="px-5 pb-4 space-y-3">
                  {/* Timeline visualization */}
                  <div className="flex items-center gap-1 px-2 py-2 bg-gray-900/40 rounded-lg overflow-x-auto">
                    {template.steps.map((step, idx) => {
                      const ChannelIcon = channelIcons[step.channel] || Mail;
                      const hasBranch = step.branch_rules && Object.keys(step.branch_rules).length > 0;
                      return (
                        <div key={idx} className="flex items-center gap-1 shrink-0">
                          {idx > 0 && (
                            <div className="flex items-center gap-0.5 px-1">
                              <div className="w-6 h-px bg-gray-700" />
                              <span className="text-[9px] text-gray-600">{step.delay_days}d</span>
                              <div className="w-6 h-px bg-gray-700" />
                            </div>
                          )}
                          <div className={`flex items-center gap-1 px-2 py-1 rounded ${colors.accent} ${colors.text} ${hasBranch ? 'ring-1 ring-purple-500/40' : ''}`}>
                            <ChannelIcon className="w-3 h-3" />
                            <span className="text-[10px] font-medium">
                              #{step.step_number} {angleOptions.find(a => a.value === step.angle)?.label || step.angle}
                            </span>
                            {hasBranch && <GitBranch className="w-2.5 h-2.5 text-purple-400" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Step editors */}
                  {template.steps.map((step, idx) => {
                    const testKey = `${template.id}-${step.step_number}`;
                    const branchKey = `${template.id}-${idx}`;
                    const testResult = testResults[testKey];
                    const isTesting = testingStep === testKey;
                    const isBranchOpen = branchOpen.has(branchKey);
                    const hasBranch = step.branch_rules && Object.keys(step.branch_rules).length > 0;
                    const branchCount = step.branch_rules ? Object.keys(step.branch_rules).length : 0;

                    return (
                      <div key={idx} className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
                        <div className="p-4 space-y-3">
                          {/* Step header */}
                          <div className="flex items-center gap-3">
                            <GripVertical className="w-4 h-4 text-gray-700 shrink-0" />
                            <span className={`text-xs font-bold ${colors.text} w-6`}>#{step.step_number}</span>

                            {/* Channel */}
                            <select
                              value={step.channel}
                              onChange={(e) => updateStep(template.id, idx, 'channel', e.target.value)}
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
                            >
                              <option value="email">Email</option>
                              <option value="call">Call</option>
                              <option value="linkedin">LinkedIn</option>
                            </select>

                            {/* Delay */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-600">After</span>
                              <input
                                type="number"
                                value={step.delay_days}
                                onChange={(e) => updateStep(template.id, idx, 'delay_days', parseInt(e.target.value) || 0)}
                                className="w-12 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center"
                                min={0}
                              />
                              <span className="text-[10px] text-gray-600">days</span>
                            </div>

                            {/* Angle */}
                            <select
                              value={step.angle}
                              onChange={(e) => updateStep(template.id, idx, 'angle', e.target.value)}
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 flex-1"
                            >
                              {angleOptions.map(a => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                              ))}
                            </select>

                            {/* Tone */}
                            <select
                              value={step.tone}
                              onChange={(e) => updateStep(template.id, idx, 'tone', e.target.value)}
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
                            >
                              {toneOptions.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>

                            {/* Branch Rules Toggle */}
                            {step.step_number > 1 && (
                              <button
                                onClick={() => toggleBranch(branchKey)}
                                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg shrink-0 transition-colors ${
                                  hasBranch
                                    ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                                    : 'bg-gray-800 text-gray-500 hover:text-purple-400 border border-gray-700'
                                }`}
                                title="Configure engagement-adaptive branch rules"
                              >
                                <GitBranch className="w-3 h-3" />
                                {hasBranch ? `${branchCount} rule${branchCount > 1 ? 's' : ''}` : 'Branch'}
                              </button>
                            )}

                            {/* Test & Delete buttons */}
                            <button
                              onClick={() => testStep(template, step)}
                              disabled={isTesting}
                              className="flex items-center gap-1 px-2 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 text-xs rounded-lg shrink-0"
                              title="Test this step with a sample lead"
                            >
                              {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                              Test
                            </button>

                            <button
                              onClick={() => removeStep(template.id, idx)}
                              className="p-1 text-gray-600 hover:text-red-400 shrink-0"
                              title="Remove step"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Instructions */}
                          <textarea
                            value={step.instructions}
                            onChange={(e) => updateStep(template.id, idx, 'instructions', e.target.value)}
                            placeholder="AI generation instructions for this step..."
                            rows={2}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-white placeholder:text-gray-600 resize-none"
                          />

                          {/* Test result */}
                          {testResult && (
                            <div className="border border-purple-500/20 rounded-lg overflow-hidden">
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border-b border-purple-500/20">
                                <Eye className="w-3 h-3 text-purple-400" />
                                <span className="text-[10px] text-purple-400 font-medium">Test Preview</span>
                                <span className="text-[10px] text-gray-500 ml-auto">
                                  Sample: {testResult.lead.business_name} ({testResult.lead.city}, {testResult.lead.state})
                                </span>
                              </div>
                              <div className="p-3">
                                <EmailPreview
                                  subject={testResult.subject}
                                  body={testResult.body}
                                  status="draft"
                                  editable={true}
                                  defaultExpanded={true}
                                  onSave={(subject, body) => {
                                    setTestResults(prev => ({
                                      ...prev,
                                      [testKey]: { ...prev[testKey], subject, body },
                                    }));
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Branch Rules Panel */}
                        {isBranchOpen && step.step_number > 1 && (
                          <BranchRulesPanel
                            step={step}
                            stepIdx={idx}
                            templateId={template.id}
                            onUpdate={updateBranchRule}
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Add step button */}
                  <button
                    onClick={() => addStep(template.id)}
                    className="flex items-center gap-1.5 w-full justify-center py-2 border border-dashed border-gray-700 hover:border-gray-500 rounded-lg text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Step
                  </button>
                </div>
              )}
            </div>
          );
        });
      })}
    </div>
  );
}

// ─── Branch Rules Panel ─────────────────────────────────────────────────────

function BranchRulesPanel({
  step,
  stepIdx,
  templateId,
  onUpdate,
}: {
  step: TemplateStep;
  stepIdx: number;
  templateId: number;
  onUpdate: (templateId: number, stepIdx: number, signal: keyof StepBranchRules, rule: BranchRule | undefined) => void;
}) {
  const rules = step.branch_rules || {};

  return (
    <div className="border-t border-purple-500/20 bg-purple-950/20 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <GitBranch className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs text-purple-400 font-medium">Engagement-Adaptive Branch Rules</span>
        <span className="text-[10px] text-gray-600 ml-auto">
          If no rules set, intelligent defaults apply automatically
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {engagementSignals.map(sig => {
          const rule = rules[sig.key];
          const isActive = !!rule;

          return (
            <div
              key={sig.key}
              className={`rounded-lg border p-3 space-y-2 ${
                isActive
                  ? 'border-purple-500/30 bg-purple-500/5'
                  : 'border-gray-800 bg-gray-900/40'
              }`}
            >
              {/* Signal header */}
              <div className="flex items-center gap-2">
                <span className="text-sm">{sig.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-medium">{sig.label}</p>
                  <p className="text-[10px] text-gray-500">{sig.desc}</p>
                </div>
                <button
                  onClick={() => {
                    if (isActive) {
                      onUpdate(templateId, stepIdx, sig.key, undefined);
                    } else {
                      onUpdate(templateId, stepIdx, sig.key, {
                        action: sig.key === 'no_opens' ? 'switch_channel' :
                                sig.key === 'clicked' ? 'accelerate' :
                                'regenerate',
                        ...(sig.key === 'no_opens' ? { channel: 'call' } : {}),
                        ...(sig.key === 'clicked' ? { reduce_delay_days: 1 } : {}),
                      });
                    }
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                    isActive
                      ? 'bg-purple-600/30 text-purple-300 hover:bg-red-600/30 hover:text-red-300'
                      : 'bg-gray-800 text-gray-500 hover:text-purple-400'
                  }`}
                >
                  {isActive ? 'Remove' : 'Add Rule'}
                </button>
              </div>

              {/* Rule config */}
              {isActive && rule && (
                <div className="space-y-2 pt-1 border-t border-purple-500/10">
                  {/* Action selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-10">Action</span>
                    <select
                      value={rule.action}
                      onChange={(e) => {
                        const newRule: BranchRule = { action: e.target.value };
                        if (e.target.value === 'switch_channel') newRule.channel = rule.channel || 'call';
                        if (e.target.value === 'change_angle') newRule.angle = rule.angle || 'commission_savings';
                        if (e.target.value === 'accelerate') newRule.reduce_delay_days = rule.reduce_delay_days || 1;
                        if (e.target.value === 'regenerate' || e.target.value === 'direct_cta') {
                          newRule.tone = rule.tone || (e.target.value === 'direct_cta' ? 'direct' : undefined);
                        }
                        onUpdate(templateId, stepIdx, sig.key, newRule);
                      }}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300"
                    >
                      {branchActions.map(a => (
                        <option key={a.value} value={a.value}>{a.label} — {a.desc}</option>
                      ))}
                    </select>
                  </div>

                  {/* Channel (for switch_channel) */}
                  {rule.action === 'switch_channel' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-10">To</span>
                      <select
                        value={rule.channel || 'call'}
                        onChange={(e) => onUpdate(templateId, stepIdx, sig.key, { ...rule, channel: e.target.value })}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300"
                      >
                        <option value="call">📞 Call</option>
                        <option value="linkedin">💼 LinkedIn</option>
                        <option value="sms">💬 SMS</option>
                      </select>
                    </div>
                  )}

                  {/* Angle (for change_angle) */}
                  {rule.action === 'change_angle' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-10">Angle</span>
                      <select
                        value={rule.angle || ''}
                        onChange={(e) => onUpdate(templateId, stepIdx, sig.key, { ...rule, angle: e.target.value })}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300"
                      >
                        {angleOptions.map(a => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Tone (for regenerate/direct_cta) */}
                  {(rule.action === 'regenerate' || rule.action === 'direct_cta') && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-10">Tone</span>
                      <select
                        value={rule.tone || ''}
                        onChange={(e) => onUpdate(templateId, stepIdx, sig.key, { ...rule, tone: e.target.value || undefined })}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300"
                      >
                        <option value="">Auto (based on signal)</option>
                        {toneOptions.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Delay reduction (for accelerate) */}
                  {rule.action === 'accelerate' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-10">Speed</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500">-</span>
                        <input
                          type="number"
                          value={rule.reduce_delay_days || 1}
                          onChange={(e) => onUpdate(templateId, stepIdx, sig.key, {
                            ...rule,
                            reduce_delay_days: Math.max(1, parseInt(e.target.value) || 1),
                          })}
                          className="w-10 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white text-center"
                          min={1}
                          max={7}
                        />
                        <span className="text-[10px] text-gray-500">days from next step delay</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-gray-600 italic">
        Branch rules are evaluated when a scheduled step comes due. The system checks engagement signals from all prior emails sent to this lead.
        Without rules, the system applies smart defaults: no opens → switch to call after 2+ emails; opened → AI regenerates with engagement context.
      </p>
    </div>
  );
}

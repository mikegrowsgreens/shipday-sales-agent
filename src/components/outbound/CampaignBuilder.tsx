'use client';

import { useState } from 'react';
import {
  Loader2, Zap, Eye, Sparkles, SlidersHorizontal,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import CampaignPreviewPanel from '@/components/outbound/CampaignPreviewPanel';

interface PreviewStep {
  step_number: number;
  delay_days: number;
  subject: string;
  body: string;
  angle: string;
  tone: string;
}

interface PreviewResult {
  steps: PreviewStep[];
  sample_lead: {
    business_name: string;
    contact_name: string;
    city: string;
    state: string;
  };
  theme: string;
  tier: string;
}

interface GenerateResult {
  generated: number;
  template_id: number;
  results: Array<{
    lead_id: number;
    template_id: number;
    steps_generated: number;
    first_step_subject: string;
  }>;
}

const themeOptions = [
  { value: 'roi_savings', label: 'ROI Savings' },
  { value: 'pain_point', label: 'Pain Point' },
  { value: 'growth', label: 'Growth' },
  { value: 'competitor_switch', label: 'Competitor Switch' },
  { value: 'simplicity', label: 'Simplicity' },
  { value: 'revenue_recovery', label: 'Revenue Recovery' },
  { value: 'custom', label: 'Custom' },
];

interface CampaignBuilderProps {
  templateId?: number;
  tier: string;
  leadIds?: number[];
  onGenerated?: (result: GenerateResult) => void;
}

export default function CampaignBuilder({
  templateId,
  tier,
  leadIds,
  onGenerated,
}: CampaignBuilderProps) {
  const [theme, setTheme] = useState('roi_savings');
  const [customTheme, setCustomTheme] = useState('');
  const [stepCount, setStepCount] = useState(5);
  const [campaignNotes, setCampaignNotes] = useState('');

  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);

  const { addToast } = useToast();

  const effectiveTheme = theme === 'custom' ? customTheme : theme;

  const handlePreview = async () => {
    if (!effectiveTheme) {
      addToast('Please select or enter a theme', 'error');
      return;
    }

    setPreviewing(true);
    setPreviewResult(null);

    try {
      const res = await fetch('/api/bdr/campaigns/preview-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: effectiveTheme,
          step_count: stepCount,
          campaign_notes: campaignNotes || undefined,
          tier,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewResult(data);
      } else {
        const err = await res.json();
        addToast(err.error || 'Preview failed', 'error');
      }
    } catch {
      addToast('Network error generating preview', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    if (!effectiveTheme) {
      addToast('Please select or enter a theme', 'error');
      return;
    }

    if (!leadIds?.length) {
      addToast('No leads selected for generation', 'error');
      return;
    }

    setGenerating(true);
    setGenerateResult(null);

    try {
      const res = await fetch('/api/bdr/campaigns/generate-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_ids: leadIds,
          theme: effectiveTheme,
          step_count: stepCount,
          campaign_notes: campaignNotes || undefined,
          template_id: templateId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGenerateResult(data);
        addToast(`Generated campaigns for ${data.generated} leads`, 'success');
        onGenerated?.(data);
      } else {
        const err = await res.json();
        addToast(err.error || 'Generation failed', 'error');
      }
    } catch {
      addToast('Network error generating campaign', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-medium text-white">Theme-Based Campaign Builder</span>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          {/* Theme selector */}
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Campaign Theme</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
            >
              {themeOptions.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Step count */}
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Steps</label>
            <input
              type="number"
              value={stepCount}
              onChange={(e) => setStepCount(Math.min(7, Math.max(3, parseInt(e.target.value) || 5)))}
              min={3}
              max={7}
              className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white text-center focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Custom theme text */}
        {theme === 'custom' && (
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Custom Theme</label>
            <input
              type="text"
              value={customTheme}
              onChange={(e) => setCustomTheme(e.target.value)}
              placeholder="e.g., Local delivery hero, seasonal menu launch..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500"
            />
          </div>
        )}

        {/* Campaign notes */}
        <div>
          <label className="block text-[10px] text-gray-500 mb-1">Campaign Notes (optional)</label>
          <textarea
            value={campaignNotes}
            onChange={(e) => setCampaignNotes(e.target.value)}
            placeholder="Additional context for the AI: specific value props to emphasize, competitor mentions, seasonal angles..."
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 resize-none focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handlePreview}
            disabled={previewing || (!effectiveTheme)}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
          >
            {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            {previewing ? 'Generating...' : 'Preview Campaign'}
          </button>

          {leadIds && leadIds.length > 0 && (
            <button
              onClick={handleGenerate}
              disabled={generating || (!effectiveTheme)}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600/80 hover:bg-green-600 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {generating ? 'Generating...' : `Generate for ${leadIds.length} Lead${leadIds.length !== 1 ? 's' : ''}`}
            </button>
          )}

          <div className="flex-1" />
          <span className="text-[10px] text-gray-600">
            {themeOptions.find(t => t.value === theme)?.label || theme} / {stepCount} steps
          </span>
        </div>
      </div>

      {/* Generation results banner */}
      {generateResult && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-300 font-medium">
              Generated campaigns for {generateResult.generated} leads
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {generateResult.results.map(r => (
              <span key={r.lead_id} className="text-[10px] text-gray-400 bg-gray-800/50 px-2 py-0.5 rounded">
                Lead #{r.lead_id}: {r.steps_generated} steps
              </span>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            First step emails are now in the Queue tab for review.
          </p>
        </div>
      )}

      {/* Preview panel */}
      {previewResult && (
        <CampaignPreviewPanel
          steps={previewResult.steps}
          sampleLead={previewResult.sample_lead}
          theme={previewResult.theme}
          tier={previewResult.tier}
          onTestSend={async (step, email) => {
            const res = await fetch('/api/test-send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                subject: step.subject,
                body: step.body,
                recipient_email: email,
              }),
            });
            if (!res.ok) throw new Error('Test send failed');
          }}
        />
      )}
    </div>
  );
}

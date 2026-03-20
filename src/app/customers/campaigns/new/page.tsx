'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Sparkles, Check } from 'lucide-react';
import { Customer, CustomerCampaignType } from '@/lib/types';
import { CustomerSegmentFilter, SegmentFilters } from '@/components/customers/CustomerSegmentFilter';

const CAMPAIGN_TYPES: { key: CustomerCampaignType; label: string; description: string }[] = [
  { key: 'upsell', label: 'Upsell', description: 'Upgrade customers to higher plans' },
  { key: 'retention', label: 'Retention', description: 'Re-engage at-risk customers' },
  { key: 'feature_adoption', label: 'Feature Adoption', description: 'Drive usage of key features' },
  { key: 'winback', label: 'Win-back', description: 'Bring back churned customers' },
  { key: 'review_request', label: 'Review/Referral', description: 'Request reviews from happy customers' },
  { key: 'announcement', label: 'Announcement', description: 'Share news with customers' },
];

type Step = 'setup' | 'template' | 'confirm';

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedType = searchParams.get('type') as CustomerCampaignType | null;

  const [step, setStep] = useState<Step>('setup');
  const [name, setName] = useState('');
  const [campaignType, setCampaignType] = useState<CustomerCampaignType>(preselectedType || 'upsell');
  const [segment, setSegment] = useState<SegmentFilters>({});
  const [subjectTemplate, setSubjectTemplate] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState('');
  const [useAI, setUseAI] = useState(true);

  const [preview, setPreview] = useState<{ count: number; customers: Customer[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Debounced segment preview
  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      fetch('/api/customers/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(segment),
      })
        .then(r => r.json())
        .then(data => setPreview({ count: data.count || 0, customers: data.customers || [] }))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [segment]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/customers/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          campaign_type: campaignType,
          target_segment: segment,
          subject_template: useAI ? null : subjectTemplate || null,
          body_template: useAI ? null : bodyTemplate || null,
        }),
      });
      const campaign = await res.json();
      if (campaign.id) {
        router.push(`/customers/campaigns/${campaign.id}`);
      }
    } catch (err) {
      console.error('Failed to create campaign:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <Link
        href="/customers/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaigns
      </Link>

      <h1 className="text-xl font-semibold text-gray-100">Create Campaign</h1>

      {/* Step Indicators */}
      <div className="flex items-center gap-2 text-xs">
        {(['setup', 'template', 'confirm'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px bg-gray-700" />}
            <button
              onClick={() => {
                if (s === 'setup' || (s === 'template' && name.trim()) || (s === 'confirm' && name.trim())) {
                  setStep(s);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-colors ${
                step === s
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs bg-gray-800">
                {i + 1}
              </span>
              {s === 'setup' ? 'Setup' : s === 'template' ? 'Template' : 'Confirm'}
            </button>
          </div>
        ))}
      </div>

      {/* Step 1: Setup */}
      {step === 'setup' && (
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Q1 2026 Upsell Push"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">Campaign Type</label>
            <div className="grid grid-cols-2 gap-2">
              {CAMPAIGN_TYPES.map(type => (
                <button
                  key={type.key}
                  onClick={() => setCampaignType(type.key)}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    campaignType === type.key
                      ? 'border-blue-500/50 bg-blue-600/10'
                      : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                  }`}
                >
                  <p className={`text-sm font-medium ${campaignType === type.key ? 'text-blue-400' : 'text-gray-300'}`}>
                    {type.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">Target Audience</label>
            <CustomerSegmentFilter
              value={segment}
              onChange={setSegment}
              preview={preview}
              loading={previewLoading}
            />
          </div>

          <button
            onClick={() => setStep('template')}
            disabled={!name.trim() || !preview?.count}
            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next: Email Template
          </button>
        </div>
      )}

      {/* Step 2: Template */}
      {step === 'template' && (
        <div className="space-y-5">
          <div className="flex gap-3">
            <button
              onClick={() => setUseAI(true)}
              className={`flex-1 px-4 py-3 rounded-lg border text-left transition-colors ${
                useAI
                  ? 'border-purple-500/50 bg-purple-600/10'
                  : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className={`w-4 h-4 ${useAI ? 'text-purple-400' : 'text-gray-500'}`} />
                <span className={`text-sm font-medium ${useAI ? 'text-purple-400' : 'text-gray-300'}`}>
                  AI Generated
                </span>
              </div>
              <p className="text-xs text-gray-500">Personalized email for each customer using AI</p>
            </button>
            <button
              onClick={() => setUseAI(false)}
              className={`flex-1 px-4 py-3 rounded-lg border text-left transition-colors ${
                !useAI
                  ? 'border-blue-500/50 bg-blue-600/10'
                  : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
              }`}
            >
              <span className={`text-sm font-medium ${!useAI ? 'text-blue-400' : 'text-gray-300'}`}>
                Manual Template
              </span>
              <p className="text-xs text-gray-500 mt-1">Write your own subject and body template</p>
            </button>
          </div>

          {useAI ? (
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <p className="text-sm text-gray-300 mb-2">AI will generate a personalized email for each customer based on:</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>- Their current plan and usage data</li>
                <li>- Account health score and activity</li>
                <li>- Recent email history (if available)</li>
                <li>- Campaign type: <span className="text-gray-300">{CAMPAIGN_TYPES.find(t => t.key === campaignType)?.label}</span></li>
              </ul>
              <div className="mt-3">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Optional guidance for AI</label>
                <textarea
                  value={bodyTemplate}
                  onChange={e => setBodyTemplate(e.target.value)}
                  placeholder="e.g., Mention the new multi-location feature. Focus on cost savings."
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Subject Template</label>
                <input
                  type="text"
                  value={subjectTemplate}
                  onChange={e => setSubjectTemplate(e.target.value)}
                  placeholder="e.g., quick question about {{business_name}}'s plan"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
                />
                <p className="text-xs text-gray-600 mt-1">Variables: {'{{business_name}}'}, {'{{contact_name}}'}, {'{{plan}}'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Body Template</label>
                <textarea
                  value={bodyTemplate}
                  onChange={e => setBodyTemplate(e.target.value)}
                  placeholder="Write your email body..."
                  rows={6}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('setup')}
              className="px-4 py-2.5 text-gray-400 rounded-lg text-sm font-medium hover:text-gray-200 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep('confirm')}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              Next: Confirm
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 'confirm' && (
        <div className="space-y-5">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Campaign Name</span>
              <span className="text-sm text-gray-200">{name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Type</span>
              <span className="text-sm text-gray-200">{CAMPAIGN_TYPES.find(t => t.key === campaignType)?.label}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Recipients</span>
              <span className="text-sm text-gray-200">{preview?.count || 0} customers</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Email Method</span>
              <span className="text-sm text-gray-200">{useAI ? 'AI Generated' : 'Manual Template'}</span>
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-3">
            <p className="text-xs text-yellow-400">
              This will create the campaign in <strong>draft</strong> status. After creation, you'll generate emails,
              review them, and approve before sending.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('template')}
              className="px-4 py-2.5 text-gray-400 rounded-lg text-sm font-medium hover:text-gray-200 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {creating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              ) : (
                <><Check className="w-4 h-4" /> Create Campaign</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

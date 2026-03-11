'use client';

import { useState } from 'react';
import {
  FlaskConical, Loader2, Shuffle, ArrowRight, Check,
  Eye, ChevronDown, ChevronUp, BarChart3,
} from 'lucide-react';

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

interface VariantConfig {
  angle: string;
  tone: string;
}

interface VariantResult {
  subject: string;
  body: string;
  angle: string;
}

interface ABResult {
  lead_id: number;
  ab_test_id: string;
  assigned_variant: string;
  variant_a: VariantResult;
  variant_b: VariantResult;
}

interface ABTestPanelProps {
  selectedLeadIds: number[];
  onComplete?: () => void;
}

export default function ABTestPanel({ selectedLeadIds, onComplete }: ABTestPanelProps) {
  const [variantA, setVariantA] = useState<VariantConfig>({ angle: 'missed_calls', tone: 'professional' });
  const [variantB, setVariantB] = useState<VariantConfig>({ angle: 'commission_savings', tone: 'friendly' });
  const [autoSplit, setAutoSplit] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<ABResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);

  const runTest = async () => {
    if (selectedLeadIds.length === 0) return;

    setGenerating(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch('/api/bdr/campaigns/ab-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_ids: selectedLeadIds,
          variant_a: variantA,
          variant_b: variantB,
          auto_split: autoSplit,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'A/B test failed');
        return;
      }

      const data = await res.json();
      setResults(data.results);
      onComplete?.();
    } catch {
      setError('Network error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800">
        <FlaskConical className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-semibold text-white">A/B Test</span>
        <span className="text-xs text-gray-500 ml-auto">
          {selectedLeadIds.length} lead{selectedLeadIds.length !== 1 ? 's' : ''} selected
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Variant configurators */}
        <div className="grid grid-cols-2 gap-4">
          {/* Variant A */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded">A</span>
              <span className="text-xs text-gray-400">Variant A</span>
            </div>
            <select
              value={variantA.angle}
              onChange={(e) => setVariantA(prev => ({ ...prev, angle: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
            >
              {angleOptions.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <select
              value={variantA.tone}
              onChange={(e) => setVariantA(prev => ({ ...prev, tone: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
            >
              {toneOptions.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* VS divider */}
          <div className="hidden" /> {/* grid spacer */}

          {/* Variant B */}
          <div className="space-y-2 -mt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-orange-400 bg-orange-500/20 px-2 py-0.5 rounded">B</span>
              <span className="text-xs text-gray-400">Variant B</span>
            </div>
            <select
              value={variantB.angle}
              onChange={(e) => setVariantB(prev => ({ ...prev, angle: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
            >
              {angleOptions.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <select
              value={variantB.tone}
              onChange={(e) => setVariantB(prev => ({ ...prev, tone: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
            >
              {toneOptions.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Split mode */}
        <div className="flex items-center gap-3 px-3 py-2 bg-gray-800/50 rounded-lg">
          <Shuffle className="w-4 h-4 text-gray-500" />
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSplit}
              onChange={(e) => setAutoSplit(e.target.checked)}
              className="rounded bg-gray-700 border-gray-600 text-blue-500"
            />
            Auto-split (alternate A/B across leads)
          </label>
          {!autoSplit && (
            <span className="text-[10px] text-gray-600 ml-auto">All leads get Variant A by default</span>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={runTest}
          disabled={generating || selectedLeadIds.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating variants...
            </>
          ) : (
            <>
              <FlaskConical className="w-4 h-4" />
              Generate A/B Test
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400 font-medium">
                Generated {results.length} A/B test{results.length > 1 ? 's' : ''}
              </span>
              <span className="text-[10px] text-gray-500 ml-auto">
                {results.filter(r => r.assigned_variant === 'A').length}A / {results.filter(r => r.assigned_variant === 'B').length}B
              </span>
            </div>

            {results.map(r => {
              const isExpanded = expandedResult === r.lead_id;
              return (
                <div key={r.lead_id} className="border border-gray-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedResult(isExpanded ? null : r.lead_id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800/50 text-left"
                  >
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
                    <span className="text-xs text-gray-400">Lead #{r.lead_id}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      r.assigned_variant === 'A' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      {r.assigned_variant}
                    </span>
                    <span className="text-[10px] text-gray-600 ml-auto truncate max-w-xs">
                      {r.assigned_variant === 'A' ? r.variant_a.subject : r.variant_b.subject}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-800 px-3 py-3 space-y-3">
                      {/* Variant A preview */}
                      <div className={`rounded-lg border p-3 ${r.assigned_variant === 'A' ? 'border-blue-500/30 bg-blue-500/5' : 'border-gray-800 bg-gray-900/30'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">A</span>
                          <span className="text-[10px] text-gray-500">{angleOptions.find(a => a.value === r.variant_a.angle)?.label}</span>
                          {r.assigned_variant === 'A' && <span className="text-[10px] text-green-400 ml-auto">Active</span>}
                        </div>
                        <p className="text-xs text-white font-medium mb-1">{r.variant_a.subject}</p>
                        <p className="text-[11px] text-gray-400 whitespace-pre-wrap line-clamp-4">{r.variant_a.body}</p>
                      </div>

                      {/* Variant B preview */}
                      <div className={`rounded-lg border p-3 ${r.assigned_variant === 'B' ? 'border-orange-500/30 bg-orange-500/5' : 'border-gray-800 bg-gray-900/30'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold text-orange-400 bg-orange-500/20 px-1.5 py-0.5 rounded">B</span>
                          <span className="text-[10px] text-gray-500">{angleOptions.find(a => a.value === r.variant_b.angle)?.label}</span>
                          {r.assigned_variant === 'B' && <span className="text-[10px] text-green-400 ml-auto">Active</span>}
                        </div>
                        <p className="text-xs text-white font-medium mb-1">{r.variant_b.subject}</p>
                        <p className="text-[11px] text-gray-400 whitespace-pre-wrap line-clamp-4">{r.variant_b.body}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

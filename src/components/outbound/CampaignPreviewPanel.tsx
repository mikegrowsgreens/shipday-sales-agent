'use client';

import { useState } from 'react';
import {
  Mail, Save, Loader2, Pencil, Check, X,
  Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import TestSendButton from '@/components/ui/TestSendButton';

interface PreviewStep {
  step_number: number;
  delay_days: number;
  subject: string;
  body: string;
  angle: string;
  tone: string;
}

interface CampaignPreviewPanelProps {
  steps: PreviewStep[];
  sampleLead?: {
    business_name: string;
    contact_name: string;
    city: string;
    state: string;
  };
  theme?: string;
  tier?: string;
  onSaveStep?: (stepNumber: number, subject: string, body: string) => void;
  onSaveAll?: (steps: PreviewStep[]) => void;
  onTestSend?: (step: PreviewStep, email: string) => Promise<void>;
  saving?: boolean;
}

const tierColors: Record<string, { text: string; accent: string }> = {
  tier_1: { text: 'text-yellow-400', accent: 'bg-yellow-500/20' },
  tier_2: { text: 'text-blue-400', accent: 'bg-blue-500/20' },
  tier_3: { text: 'text-gray-400', accent: 'bg-gray-500/20' },
};

export default function CampaignPreviewPanel({
  steps: initialSteps,
  sampleLead,
  theme,
  tier,
  onSaveStep,
  onSaveAll,
  onTestSend,
  saving = false,
}: CampaignPreviewPanelProps) {
  const [steps, setSteps] = useState<PreviewStep[]>(initialSteps);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [editAll, setEditAll] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(
    new Set(initialSteps.map(s => s.step_number))
  );

  const colors = tierColors[tier || 'tier_3'] || tierColors.tier_3;

  const toggleExpanded = (stepNum: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepNum)) next.delete(stepNum);
      else next.add(stepNum);
      return next;
    });
  };

  const updateStepField = (stepNum: number, field: 'subject' | 'body', value: string) => {
    setSteps(prev => prev.map(s =>
      s.step_number === stepNum ? { ...s, [field]: value } : s
    ));
  };

  const handleSaveStep = (stepNum: number) => {
    const step = steps.find(s => s.step_number === stepNum);
    if (step && onSaveStep) {
      onSaveStep(stepNum, step.subject, step.body);
    }
    setEditingStep(null);
  };

  const handleSaveAll = () => {
    if (onSaveAll) onSaveAll(steps);
    setEditAll(false);
  };

  const cancelEdit = (stepNum: number) => {
    const original = initialSteps.find(s => s.step_number === stepNum);
    if (original) {
      setSteps(prev => prev.map(s =>
        s.step_number === stepNum ? { ...original } : s
      ));
    }
    setEditingStep(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-white">
            Campaign Preview
          </span>
          {theme && (
            <span className="text-xs text-gray-500">
              {theme}
            </span>
          )}
          {sampleLead && (
            <span className="text-[10px] text-gray-600 ml-2">
              Sample: {sampleLead.business_name} ({sampleLead.city}, {sampleLead.state})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditAll(!editAll)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
              editAll
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
            }`}
          >
            <Pencil className="w-3 h-3" />
            {editAll ? 'Editing All' : 'Edit All'}
          </button>
          {editAll && onSaveAll && (
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save All
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {steps.map((step, idx) => {
          const isExpanded = expandedSteps.has(step.step_number);
          const isEditing = editAll || editingStep === step.step_number;
          const isLast = idx === steps.length - 1;

          return (
            <div key={step.step_number} className="flex gap-4">
              {/* Timeline spine */}
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colors.accent} border border-gray-700`}>
                  <span className={`text-xs font-bold ${colors.text}`}>{step.step_number}</span>
                </div>
                {!isLast && (
                  <div className="w-px flex-1 bg-gray-800 min-h-[16px]" />
                )}
              </div>

              {/* Step content */}
              <div className={`flex-1 mb-4 ${isLast ? '' : 'pb-2'}`}>
                {/* Step header */}
                <button
                  onClick={() => toggleExpanded(step.step_number)}
                  className="flex items-center gap-2 w-full text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">
                        {step.subject || '(No subject)'}
                      </span>
                      {step.delay_days > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-gray-500 shrink-0">
                          <Clock className="w-2.5 h-2.5" />
                          +{step.delay_days}d
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors.accent} ${colors.text}`}>
                        {step.angle.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-gray-600">{step.tone}</span>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-gray-600 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-600 shrink-0" />
                  }
                </button>

                {/* Step body */}
                {isExpanded && (
                  <div className="mt-3 bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
                    {isEditing ? (
                      <div className="p-4 space-y-3">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Subject</label>
                          <input
                            type="text"
                            value={step.subject}
                            onChange={(e) => updateStepField(step.step_number, 'subject', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-1">Body</label>
                          <textarea
                            value={step.body}
                            onChange={(e) => updateStepField(step.step_number, 'body', e.target.value)}
                            rows={8}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                          />
                        </div>
                        {!editAll && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveStep(step.step_number)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg"
                            >
                              <Check className="w-3 h-3" />
                              Save
                            </button>
                            <button
                              onClick={() => cancelEdit(step.step_number)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg"
                            >
                              <X className="w-3 h-3" />
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4">
                        <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                          {step.body || '(No body)'}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          {onSaveStep && !editAll && (
                            <button
                              onClick={() => setEditingStep(step.step_number)}
                              className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              Edit
                            </button>
                          )}
                          {onTestSend && (
                            <TestSendButton
                              onSend={(email) => onTestSend(step, email)}
                              size="sm"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

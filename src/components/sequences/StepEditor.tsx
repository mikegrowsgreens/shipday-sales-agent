'use client';

import { useState } from 'react';
import {
  X, Mail, Phone, Linkedin, MessageSquare, PenLine,
  RefreshCw, Loader2, GitBranch, LogOut, Clock, Tag,
  Plus, Trash2,
} from 'lucide-react';
import type { FlowStep, StepType, BranchCondition, ExitAction } from '@/lib/types';
import { STEP_TYPE_CONFIG, BRANCH_CONDITION_LABELS } from './StepNode';

const STEP_TYPES: { value: StepType; label: string; icon: typeof Mail }[] = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'phone', label: 'Phone Call', icon: Phone },
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { value: 'sms', label: 'SMS', icon: MessageSquare },
  { value: 'manual', label: 'Manual Task', icon: PenLine },
];

const BRANCH_CONDITIONS: { value: BranchCondition; label: string; description: string }[] = [
  { value: 'opened', label: 'Opened', description: 'Email was opened' },
  { value: 'not_opened', label: 'Not Opened', description: 'No opens after wait period' },
  { value: 'replied', label: 'Replied', description: 'Contact replied (any sentiment)' },
  { value: 'replied_positive', label: 'Replied Positive', description: 'Positive reply detected' },
  { value: 'replied_negative', label: 'Replied Negative', description: 'Negative reply detected' },
  { value: 'bounced', label: 'Bounced', description: 'Email bounced' },
  { value: 'clicked', label: 'Clicked', description: 'Link was clicked' },
  { value: 'no_engagement', label: 'No Engagement', description: 'No activity after wait' },
];

interface StepEditorProps {
  step: FlowStep;
  onUpdate: (updates: Partial<FlowStep>) => void;
  onClose: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  isRegenerating: boolean;
  sequenceContext: string; // description/prompt for AI context
}

export default function StepEditor({
  step,
  onUpdate,
  onClose,
  onRegenerate,
  onDelete,
  isRegenerating,
  sequenceContext,
}: StepEditorProps) {
  const config = STEP_TYPE_CONFIG[step.stepType] || STEP_TYPE_CONFIG.email;

  return (
    <div className="w-[380px] bg-gray-900 border-l border-gray-800 h-full overflow-y-auto flex-shrink-0">
      {/* Header */}
      <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded ${config.bgColor} flex items-center justify-center`}>
            <config.icon className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Edit {config.label} Step</span>
        </div>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Step Type Selector */}
        <Field label="Step Type">
          <div className="flex gap-1.5 flex-wrap">
            {STEP_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => onUpdate({ stepType: t.value })}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  step.stepType === t.value
                    ? `${STEP_TYPE_CONFIG[t.value].bgColor} border-transparent text-white`
                    : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                }`}
              >
                <t.icon className="w-3 h-3" />
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        {/* Timing */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wait (days)">
            <input
              type="number"
              min={0}
              value={step.delayDays}
              onChange={(e) => onUpdate({ delayDays: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </Field>
          <Field label="Variant Label">
            <input
              type="text"
              value={step.variantLabel}
              onChange={(e) => onUpdate({ variantLabel: e.target.value })}
              placeholder="A/B"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </Field>
        </div>

        {/* Send Window */}
        <Field label="Send Window (PST)">
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={step.sendWindowStart}
              onChange={(e) => onUpdate({ sendWindowStart: e.target.value })}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-gray-500">to</span>
            <input
              type="time"
              value={step.sendWindowEnd}
              onChange={(e) => onUpdate({ sendWindowEnd: e.target.value })}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            />
          </div>
        </Field>

        {/* Branch Condition */}
        {step.branchCondition !== null && (
          <Field label="Branch Condition">
            <select
              value={step.branchCondition || ''}
              onChange={(e) => onUpdate({ branchCondition: (e.target.value || null) as BranchCondition | null })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">No condition (default path)</option>
              {BRANCH_CONDITIONS.map(c => (
                <option key={c.value} value={c.value}>{c.label} — {c.description}</option>
              ))}
            </select>
            <Field label="Wait for condition (days)">
              <input
                type="number"
                min={1}
                max={14}
                value={step.branchWaitDays}
                onChange={(e) => onUpdate({ branchWaitDays: parseInt(e.target.value) || 2 })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </Field>
          </Field>
        )}

        {/* Channel-Specific Content */}
        <div className="border-t border-gray-800 pt-4">
          {step.stepType === 'email' && (
            <EmailEditor step={step} onUpdate={onUpdate} />
          )}
          {step.stepType === 'phone' && (
            <PhoneEditor step={step} onUpdate={onUpdate} />
          )}
          {step.stepType === 'linkedin' && (
            <LinkedInEditor step={step} onUpdate={onUpdate} />
          )}
          {step.stepType === 'sms' && (
            <SmsEditor step={step} onUpdate={onUpdate} />
          )}
          {step.stepType === 'manual' && (
            <ManualEditor step={step} onUpdate={onUpdate} />
          )}
        </div>

        {/* Exit Step Toggle */}
        <div className="border-t border-gray-800 pt-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={step.isExitStep}
              onChange={(e) => onUpdate({ isExitStep: e.target.checked, exitAction: e.target.checked ? 'complete' : null })}
              className="rounded border-gray-600 bg-gray-800"
            />
            <LogOut className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-sm text-gray-300">Exit step (end sequence here)</span>
          </label>
          {step.isExitStep && (
            <div className="mt-2 ml-6">
              <select
                value={step.exitAction || 'complete'}
                onChange={(e) => onUpdate({ exitAction: e.target.value as ExitAction })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
              >
                <option value="complete">Mark sequence complete</option>
                <option value="create_task">Create follow-up task</option>
                <option value="move_to_sequence">Move to another sequence</option>
              </select>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-gray-800 pt-4 flex items-center gap-2">
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {isRegenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Regenerate
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 text-red-400 hover:bg-red-900/20 text-xs px-3 py-1.5 rounded-lg transition-colors ml-auto"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Channel Editors ──────────────────────────────────────────────────────────

function EmailEditor({ step, onUpdate }: { step: FlowStep; onUpdate: (u: Partial<FlowStep>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Subject Line">
        <input
          type="text"
          value={step.subjectTemplate}
          onChange={(e) => onUpdate({ subjectTemplate: e.target.value })}
          placeholder="Hey {{first_name}}, quick question about {{business_name}}"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
        />
      </Field>
      <Field label="Email Body">
        <textarea
          value={step.bodyTemplate}
          onChange={(e) => onUpdate({ bodyTemplate: e.target.value })}
          placeholder="Email body template..."
          rows={8}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none font-mono text-xs leading-relaxed"
        />
      </Field>
      <VariableButtons onInsert={(v) => onUpdate({ bodyTemplate: step.bodyTemplate + v })} />
    </div>
  );
}

function PhoneEditor({ step, onUpdate }: { step: FlowStep; onUpdate: (u: Partial<FlowStep>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Call Script / Talking Points">
        <textarea
          value={step.taskInstructions}
          onChange={(e) => onUpdate({ taskInstructions: e.target.value })}
          placeholder="Key points to cover on this call:&#10;1. Introduction&#10;2. Value proposition&#10;3. Ask for meeting"
          rows={10}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        />
      </Field>
      <div className="bg-green-900/20 border border-green-800/30 rounded-lg p-3">
        <p className="text-[10px] text-green-400 font-medium mb-1">Phone Step Tips</p>
        <ul className="text-[10px] text-green-300/70 space-y-0.5 list-disc pl-3">
          <li>Opens as a task in Action Queue when due</li>
          <li>Include objection-handling notes</li>
          <li>Reference previous touches for context</li>
        </ul>
      </div>
    </div>
  );
}

function LinkedInEditor({ step, onUpdate }: { step: FlowStep; onUpdate: (u: Partial<FlowStep>) => void }) {
  const charCount = step.bodyTemplate?.length || 0;
  const isOver = charCount > 300;
  return (
    <div className="space-y-3">
      <Field label="LinkedIn Message">
        <textarea
          value={step.bodyTemplate}
          onChange={(e) => onUpdate({ bodyTemplate: e.target.value })}
          placeholder="Hey {{first_name}}, noticed we're both in the {{company}} space..."
          rows={6}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        />
        <span className={`text-[10px] ${isOver ? 'text-yellow-400' : 'text-gray-600'}`}>
          {charCount}/300 chars {isOver && '(LinkedIn limits to ~300 for connection requests)'}
        </span>
      </Field>
      <VariableButtons onInsert={(v) => onUpdate({ bodyTemplate: step.bodyTemplate + v })} />
      <Field label="Task Instructions (optional)">
        <textarea
          value={step.taskInstructions}
          onChange={(e) => onUpdate({ taskInstructions: e.target.value })}
          placeholder="Additional context: profile viewing, commenting on post, etc."
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        />
      </Field>
    </div>
  );
}

function SmsEditor({ step, onUpdate }: { step: FlowStep; onUpdate: (u: Partial<FlowStep>) => void }) {
  const charCount = step.bodyTemplate?.length || 0;
  const segments = Math.ceil(charCount / 160) || 1;
  return (
    <div className="space-y-3">
      <Field label="SMS Message">
        <textarea
          value={step.bodyTemplate}
          onChange={(e) => onUpdate({ bodyTemplate: e.target.value })}
          placeholder="Hey {{first_name}}, quick question about {{business_name}}..."
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        />
        <div className="flex items-center gap-3 mt-1">
          <span className={`text-[10px] ${charCount > 160 ? 'text-yellow-400' : 'text-gray-600'}`}>
            {charCount}/160 chars
          </span>
          {segments > 1 && (
            <span className="text-[10px] text-yellow-400">{segments} SMS segments</span>
          )}
        </div>
      </Field>
      <VariableButtons onInsert={(v) => onUpdate({ bodyTemplate: step.bodyTemplate + v })} />
    </div>
  );
}

function ManualEditor({ step, onUpdate }: { step: FlowStep; onUpdate: (u: Partial<FlowStep>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Task Instructions">
        <textarea
          value={step.taskInstructions}
          onChange={(e) => onUpdate({ taskInstructions: e.target.value })}
          placeholder="Describe what needs to be done manually:&#10;- Research the company&#10;- Personalize the next email&#10;- Check CRM for deal status"
          rows={8}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        />
      </Field>
    </div>
  );
}

// ─── Shared Sub-Components ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1.5 font-medium">{label}</label>
      {children}
    </div>
  );
}

function VariableButtons({ onInsert }: { onInsert: (v: string) => void }) {
  const vars = ['{{first_name}}', '{{business_name}}', '{{company}}', '{{city}}'];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-gray-600">Variables:</span>
      {vars.map(v => (
        <button
          key={v}
          onClick={() => onInsert(v)}
          className="text-[10px] bg-gray-800 border border-gray-700 text-gray-400 px-1.5 py-0.5 rounded hover:text-white hover:border-gray-600 transition-colors"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

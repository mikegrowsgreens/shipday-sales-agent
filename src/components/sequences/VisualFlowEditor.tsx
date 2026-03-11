'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Loader2, Sparkles, Wand2, PenLine,
  Plus, Mail, Phone, Linkedin, MessageSquare, Copy,
  Bookmark, GitBranch, ChevronDown, Clock,
} from 'lucide-react';
import type { FlowStep, StepType, BranchCondition, StepMetrics } from '@/lib/types';
import StepNode, { STEP_TYPE_CONFIG } from './StepNode';
import StepEditor from './StepEditor';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface SequenceData {
  sequenceId?: number;
  name: string;
  description: string;
  pauseOnReply: boolean;
  pauseOnBooking: boolean;
  isTemplate: boolean;
  templateCategory: string;
  tags: string[];
}

interface VisualFlowEditorProps {
  initialData?: Partial<SequenceData>;
  initialSteps?: FlowStep[];
  stepMetrics?: Record<number, StepMetrics>;
  onSaveAsTemplate?: () => void;
}

const STEP_TYPES: { value: StepType; label: string; icon: typeof Mail }[] = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { value: 'sms', label: 'SMS', icon: MessageSquare },
  { value: 'manual', label: 'Task', icon: PenLine },
];

let tempIdCounter = 0;
function newTempId() { return `temp_${++tempIdCounter}`; }

function createDefaultStep(type: StepType, parentId: string | null, delayDays: number = 2): FlowStep {
  return {
    id: newTempId(),
    parentId,
    branchCondition: null,
    branchWaitDays: 2,
    stepType: type,
    delayDays,
    sendWindowStart: '09:00',
    sendWindowEnd: '17:00',
    subjectTemplate: '',
    bodyTemplate: '',
    taskInstructions: '',
    variantLabel: '',
    isExitStep: false,
    exitAction: null,
    exitActionConfig: {},
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function VisualFlowEditor({
  initialData,
  initialSteps,
  stepMetrics,
  onSaveAsTemplate,
}: VisualFlowEditorProps) {
  const router = useRouter();

  // Sequence metadata
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [pauseOnReply, setPauseOnReply] = useState(initialData?.pauseOnReply ?? true);
  const [pauseOnBooking, setPauseOnBooking] = useState(initialData?.pauseOnBooking ?? true);
  const sequenceId = initialData?.sequenceId;

  // Steps (flat array with tree structure via parentId)
  const [steps, setSteps] = useState<FlowStep[]>(() => {
    if (initialSteps && initialSteps.length > 0) return initialSteps;
    const root = createDefaultStep('email', null, 0);
    return [root];
  });

  // Editor state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [regeneratingStepId, setRegeneratingStepId] = useState<string | null>(null);

  // AI generation state
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState('');
  const [aiStepCount, setAiStepCount] = useState(5);
  const [aiChannels, setAiChannels] = useState<string[]>(['email', 'phone', 'linkedin']);
  const [generating, setGenerating] = useState(false);

  // Computed tree
  const { roots, childrenMap, totalDays } = useMemo(() => {
    const childrenMap: Record<string, FlowStep[]> = {};
    const roots: FlowStep[] = [];
    let totalDays = 0;

    for (const step of steps) {
      if (!step.parentId) {
        roots.push(step);
      } else {
        if (!childrenMap[step.parentId]) childrenMap[step.parentId] = [];
        childrenMap[step.parentId].push(step);
      }
      totalDays += step.delayDays;
    }

    return { roots, childrenMap, totalDays };
  }, [steps]);

  const selectedStep = steps.find(s => s.id === selectedStepId) || null;

  // ─── Step Operations ────────────────────────────────────────────────────

  const addStep = useCallback((type: StepType, parentId: string | null) => {
    const newStep = createDefaultStep(type, parentId, parentId ? 2 : 0);
    setSteps(prev => [...prev, newStep]);
    setSelectedStepId(newStep.id);
  }, []);

  const addBranch = useCallback((parentId: string, condition: BranchCondition) => {
    const newStep = createDefaultStep('email', parentId, 0);
    newStep.branchCondition = condition;
    setSteps(prev => [...prev, newStep]);
    setSelectedStepId(newStep.id);
  }, []);

  const updateStep = useCallback((stepId: string, updates: Partial<FlowStep>) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, ...updates } : s));
  }, []);

  const deleteStep = useCallback((stepId: string) => {
    setSteps(prev => {
      // Find children of this step
      const children = prev.filter(s => s.parentId === stepId);
      const step = prev.find(s => s.id === stepId);
      if (!step) return prev;

      // Reconnect children to this step's parent
      const reconnected = prev
        .filter(s => s.id !== stepId)
        .map(s => s.parentId === stepId ? { ...s, parentId: step.parentId } : s);

      return reconnected;
    });
    if (selectedStepId === stepId) setSelectedStepId(null);
  }, [selectedStepId]);

  const duplicateStep = useCallback((stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;
    const newStep: FlowStep = {
      ...step,
      id: newTempId(),
      variantLabel: `${step.variantLabel || 'A'} copy`,
      metrics: undefined,
    };
    setSteps(prev => [...prev, newStep]);
    setSelectedStepId(newStep.id);
  }, [steps]);

  const regenerateStep = useCallback(async (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    setRegeneratingStepId(stepId);
    setError('');

    try {
      const surrounding = steps
        .filter(s => s.parentId === step.parentId || s.id === step.parentId)
        .filter(s => s.id !== stepId)
        .slice(0, 3)
        .map(s => ({
          step_type: s.stepType,
          subject_template: s.subjectTemplate,
          body_template: s.bodyTemplate,
        }));

      const res = await fetch('/api/sequences/regenerate-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_type: step.stepType,
          context: aiPrompt || description || name,
          surrounding_steps: surrounding,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Regeneration failed');
      const data = await res.json();

      updateStep(stepId, {
        subjectTemplate: data.subject_template || '',
        bodyTemplate: data.body_template || '',
        taskInstructions: data.task_instructions || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setRegeneratingStepId(null);
    }
  }, [steps, aiPrompt, description, name, updateStep]);

  // ─── AI Generation ──────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) { setError('Describe the sequence'); return; }
    setGenerating(true);
    setError('');

    try {
      const res = await fetch('/api/sequences/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          channel_mix: aiChannels,
          num_steps: aiStepCount,
          tone: aiTone || undefined,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Generation failed');
      const data = await res.json();

      if (data.name && !name) setName(data.name);
      if (data.description && !description) setDescription(data.description);

      if (data.steps?.length) {
        // Convert flat generated steps to flow steps with tree structure
        const flowSteps: FlowStep[] = [];
        let prevId: string | null = null;

        for (let i = 0; i < data.steps.length; i++) {
          const s = data.steps[i];
          const step = createDefaultStep(s.step_type || 'email', prevId, s.delay_days ?? (i === 0 ? 0 : 2));
          step.subjectTemplate = s.subject_template || '';
          step.bodyTemplate = s.body_template || '';
          step.taskInstructions = s.task_instructions || '';
          step.sendWindowStart = s.send_window_start || '09:00';
          step.sendWindowEnd = s.send_window_end || '17:00';
          flowSteps.push(step);
          prevId = step.id;
        }

        setSteps(flowSteps);
        setSelectedStepId(flowSteps[0]?.id || null);
      }

      setMode('manual');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // ─── Save ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim()) { setError('Sequence name is required'); return; }
    if (steps.length === 0) { setError('Add at least one step'); return; }

    setSaving(true);
    setError('');

    try {
      // Convert flow steps to API format
      // Build step_order and parent_step_order mapping
      const apiSteps = steps.map((s, i) => {
        const parentIndex = s.parentId ? steps.findIndex(p => p.id === s.parentId) : -1;
        return {
          step_order: i + 1,
          step_type: s.stepType,
          delay_days: s.delayDays,
          send_window_start: s.sendWindowStart,
          send_window_end: s.sendWindowEnd,
          subject_template: s.subjectTemplate || null,
          body_template: s.bodyTemplate || null,
          task_instructions: s.taskInstructions || null,
          variant_label: s.variantLabel || null,
          parent_step_order: parentIndex >= 0 ? parentIndex + 1 : null,
          branch_condition: s.branchCondition,
          branch_wait_days: s.branchWaitDays,
          is_exit_step: s.isExitStep,
          exit_action: s.exitAction,
          exit_action_config: s.exitActionConfig,
        };
      });

      const url = sequenceId ? `/api/sequences/${sequenceId}` : '/api/sequences';
      const method = sequenceId ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          pause_on_reply: pauseOnReply,
          pause_on_booking: pauseOnBooking,
          steps: apiSteps,
        }),
      });

      if (!response.ok) throw new Error((await response.json()).error || 'Save failed');
      const data = await response.json();
      router.push(`/sequences/${data.sequence.sequence_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ─── Branch Dialog ──────────────────────────────────────────────────────

  const [showBranchDialog, setShowBranchDialog] = useState<string | null>(null);

  const handleAddBranch = (parentId: string) => {
    setShowBranchDialog(parentId);
  };

  const confirmAddBranch = (condition: BranchCondition) => {
    if (showBranchDialog) {
      addBranch(showBranchDialog, condition);
    }
    setShowBranchDialog(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-950 flex-shrink-0">
          <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setMode('manual')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
                  mode === 'manual' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <PenLine className="w-3 h-3" /> Manual
              </button>
              <button
                onClick={() => setMode('auto')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
                  mode === 'auto' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Sparkles className="w-3 h-3" /> AI Generate
              </button>
            </div>
            {onSaveAsTemplate && (
              <button
                onClick={onSaveAsTemplate}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg transition-colors"
              >
                <Bookmark className="w-3 h-3" /> Save as Template
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {sequenceId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 bg-red-900/30 border border-red-800 text-red-400 text-sm px-4 py-2.5 rounded-lg">
            {error}
          </div>
        )}

        {/* AI Generation Panel */}
        {mode === 'auto' && (
          <div className="mx-5 mt-4 bg-gray-900 border border-blue-800/40 rounded-xl p-4 space-y-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-400">
              <Wand2 className="w-4 h-4" /> AI Sequence Generator
            </div>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe your campaign: target audience, goal, channels, timing..."
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Channels</label>
                <div className="flex gap-1">
                  {STEP_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setAiChannels(prev => prev.includes(t.value) ? prev.filter(c => c !== t.value) : [...prev, t.value])}
                      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                        aiChannels.includes(t.value)
                          ? `${STEP_TYPE_CONFIG[t.value].bgColor} border-transparent text-white`
                          : 'bg-gray-800 border-gray-700 text-gray-500'
                      }`}
                    >
                      <t.icon className="w-2.5 h-2.5" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Steps</label>
                <select value={aiStepCount} onChange={(e) => setAiStepCount(parseInt(e.target.value))} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300">
                  {[3,4,5,6,7,8,10].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Tone</label>
                <select value={aiTone} onChange={(e) => setAiTone(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300">
                  <option value="">Default</option>
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="direct">Direct</option>
                  <option value="casual">Casual</option>
                  <option value="consultative">Consultative</option>
                </select>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating || !aiPrompt.trim()}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
              >
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        )}

        {/* Sequence Info Bar */}
        <div className="mx-5 mt-4 flex-shrink-0">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1 font-medium">Sequence Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cold Outreach — Restaurant Owners"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1 font-medium">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-5">
                <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={pauseOnReply} onChange={(e) => setPauseOnReply(e.target.checked)} className="rounded border-gray-700 bg-gray-800" />
                  Pause on reply
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={pauseOnBooking} onChange={(e) => setPauseOnBooking(e.target.checked)} className="rounded border-gray-700 bg-gray-800" />
                  Pause on booking
                </label>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-gray-500">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{totalDays}d total</span>
                <span>{steps.length} steps</span>
              </div>
            </div>
          </div>
        </div>

        {/* Flow Canvas */}
        <div className="flex-1 overflow-auto px-5 py-6">
          <div className="flex flex-col items-center min-h-full">
            {roots.map((root) => (
              <FlowTree
                key={root.id}
                step={root}
                childrenMap={childrenMap}
                selectedStepId={selectedStepId}
                regeneratingStepId={regeneratingStepId}
                onSelect={setSelectedStepId}
                onDelete={deleteStep}
                onDuplicate={duplicateStep}
                onAddBranch={handleAddBranch}
                onRegenerate={regenerateStep}
                onAddStep={addStep}
                isRoot
              />
            ))}

            {/* Add first step button (if no steps) */}
            {steps.length === 0 && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-gray-500">Start building your sequence</p>
                <div className="flex gap-2">
                  {STEP_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => addStep(t.value, null)}
                      className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <t.icon className="w-3 h-3" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Side Panel Editor */}
      {selectedStep && (
        <StepEditor
          step={selectedStep}
          onUpdate={(updates) => updateStep(selectedStep.id, updates)}
          onClose={() => setSelectedStepId(null)}
          onRegenerate={() => regenerateStep(selectedStep.id)}
          onDelete={() => deleteStep(selectedStep.id)}
          isRegenerating={regeneratingStepId === selectedStep.id}
          sequenceContext={aiPrompt || description || name}
        />
      )}

      {/* Branch Condition Dialog */}
      {showBranchDialog && (
        <BranchDialog
          onSelect={confirmAddBranch}
          onClose={() => setShowBranchDialog(null)}
        />
      )}
    </div>
  );
}

// ─── Flow Tree Renderer ─────────────────────────────────────────────────────

function FlowTree({
  step,
  childrenMap,
  selectedStepId,
  regeneratingStepId,
  onSelect,
  onDelete,
  onDuplicate,
  onAddBranch,
  onRegenerate,
  onAddStep,
  isRoot = false,
}: {
  step: FlowStep;
  childrenMap: Record<string, FlowStep[]>;
  selectedStepId: string | null;
  regeneratingStepId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddBranch: (id: string) => void;
  onRegenerate: (id: string) => void;
  onAddStep: (type: StepType, parentId: string | null) => void;
  isRoot?: boolean;
}) {
  const children = childrenMap[step.id] || [];
  const branchChildren = children.filter(c => c.branchCondition);
  const linearChild = children.find(c => !c.branchCondition);

  // Show add step dropdown state
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <div className="flex flex-col items-center">
      {/* The step node */}
      <StepNode
        step={step}
        isSelected={selectedStepId === step.id}
        isRoot={isRoot}
        onSelect={() => onSelect(step.id)}
        onDelete={() => onDelete(step.id)}
        onDuplicate={() => onDuplicate(step.id)}
        onAddBranch={() => onAddBranch(step.id)}
        onRegenerate={() => onRegenerate(step.id)}
        isRegenerating={regeneratingStepId === step.id}
      />

      {/* Branches fork */}
      {branchChildren.length > 0 && (
        <div className="flex flex-col items-center">
          {/* Vertical connector down */}
          <div className="w-px h-4 bg-gray-700" />

          {/* Branch diamond */}
          <div className="w-8 h-8 rounded-lg bg-yellow-900/40 border border-yellow-700/40 flex items-center justify-center rotate-45 my-1">
            <GitBranch className="w-3.5 h-3.5 text-yellow-400 -rotate-45" />
          </div>

          {/* Horizontal rail + vertical drops */}
          <div className="flex items-start gap-0">
            {/* Include linear child as "default" branch if exists */}
            {[...branchChildren, ...(linearChild ? [linearChild] : [])].map((child, i, arr) => (
              <div key={child.id} className="flex flex-col items-center">
                {/* Horizontal connector */}
                <div className="flex items-center">
                  {i === 0 ? (
                    <div className={`h-px ${arr.length > 1 ? 'w-8' : 'w-0'} bg-gray-700`} />
                  ) : i === arr.length - 1 ? (
                    <div className="h-px w-8 bg-gray-700" />
                  ) : (
                    <div className="h-px w-16 bg-gray-700" />
                  )}
                </div>

                {/* Vertical drop to child */}
                <div className="w-px h-4 bg-gray-700" />

                {/* Recurse into child */}
                <FlowTree
                  step={child}
                  childrenMap={childrenMap}
                  selectedStepId={selectedStepId}
                  regeneratingStepId={regeneratingStepId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onAddBranch={onAddBranch}
                  onRegenerate={onRegenerate}
                  onAddStep={onAddStep}
                />

                {/* Spacer between branches */}
                {i < arr.length - 1 && <div className="w-6" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linear child (only if no branches) */}
      {!branchChildren.length && linearChild && (
        <>
          {/* Connector */}
          <div className="flex flex-col items-center">
            <div className="w-px h-3 bg-gray-700" />
            {linearChild.delayDays > 0 && (
              <span className="text-[9px] text-gray-600 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800 my-0.5">
                +{linearChild.delayDays}d
              </span>
            )}
            <div className="w-px h-3 bg-gray-700" />
          </div>
          <FlowTree
            step={linearChild}
            childrenMap={childrenMap}
            selectedStepId={selectedStepId}
            regeneratingStepId={regeneratingStepId}
            onSelect={onSelect}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onAddBranch={onAddBranch}
            onRegenerate={onRegenerate}
            onAddStep={onAddStep}
          />
        </>
      )}

      {/* Add step button at the end of a path (only if no children or after branches) */}
      {children.length === 0 && !step.isExitStep && (
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-gray-700" />
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 border-dashed hover:border-blue-500 hover:bg-gray-800/80 flex items-center justify-center transition-all group"
            >
              <Plus className="w-3.5 h-3.5 text-gray-500 group-hover:text-blue-400 transition-colors" />
            </button>
            {showAddMenu && (
              <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1.5 min-w-[150px]">
                {STEP_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => { onAddStep(t.value, step.id); setShowAddMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    <div className={`w-4 h-4 rounded ${STEP_TYPE_CONFIG[t.value].bgColor} flex items-center justify-center`}>
                      <t.icon className="w-2.5 h-2.5 text-white" />
                    </div>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Branch Condition Dialog ────────────────────────────────────────────────

const BRANCH_OPTIONS: { value: BranchCondition; label: string; desc: string; color: string }[] = [
  { value: 'opened', label: 'If Opened', desc: 'Email was opened', color: 'border-blue-500/40 hover:border-blue-400' },
  { value: 'not_opened', label: 'If Not Opened', desc: 'No opens after wait', color: 'border-gray-600 hover:border-gray-500' },
  { value: 'replied', label: 'If Replied', desc: 'Any reply received', color: 'border-green-500/40 hover:border-green-400' },
  { value: 'replied_positive', label: 'If Replied +', desc: 'Positive reply', color: 'border-green-500/40 hover:border-green-400' },
  { value: 'clicked', label: 'If Clicked', desc: 'Link was clicked', color: 'border-cyan-500/40 hover:border-cyan-400' },
  { value: 'bounced', label: 'If Bounced', desc: 'Email bounced', color: 'border-red-500/40 hover:border-red-400' },
  { value: 'no_engagement', label: 'No Engagement', desc: 'No activity at all', color: 'border-yellow-500/40 hover:border-yellow-400' },
];

function BranchDialog({ onSelect, onClose }: { onSelect: (c: BranchCondition) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-[400px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-5 h-5 text-yellow-400" />
          <h3 className="text-sm font-semibold text-white">Add Branch Condition</h3>
        </div>
        <p className="text-xs text-gray-400 mb-4">Choose what engagement signal triggers this branch path.</p>
        <div className="grid gap-2">
          {BRANCH_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className={`flex items-center gap-3 p-3 rounded-lg border bg-gray-800/50 transition-all cursor-pointer ${opt.color}`}
            >
              <div className="flex-1 text-left">
                <span className="text-sm text-white font-medium">{opt.label}</span>
                <span className="text-xs text-gray-500 ml-2">{opt.desc}</span>
              </div>
              <ChevronDown className="w-3 h-3 text-gray-500 -rotate-90" />
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

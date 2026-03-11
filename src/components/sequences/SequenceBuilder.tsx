'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, GripVertical, Mail, Phone, Linkedin,
  MessageSquare, PenLine, ArrowLeft, Save, Loader2,
  Sparkles, RefreshCw, Wand2, ChevronDown, ChevronRight,
  ArrowUp, ArrowDown, Clock, Tag, Copy,
} from 'lucide-react';

interface Step {
  step_type: string;
  delay_days: number;
  send_window_start: string;
  send_window_end: string;
  subject_template: string;
  body_template: string;
  task_instructions: string;
  variant_label?: string;
}

interface SequenceBuilderProps {
  initialName?: string;
  initialDescription?: string;
  initialSteps?: Step[];
  initialPauseOnReply?: boolean;
  initialPauseOnBooking?: boolean;
  sequenceId?: number;
}

const stepTypes = [
  { value: 'email', label: 'Email', icon: Mail, color: 'bg-blue-600', borderColor: 'border-blue-600' },
  { value: 'phone', label: 'Phone Call', icon: Phone, color: 'bg-green-600', borderColor: 'border-green-600' },
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'bg-cyan-600', borderColor: 'border-cyan-600' },
  { value: 'sms', label: 'SMS', icon: MessageSquare, color: 'bg-purple-600', borderColor: 'border-purple-600' },
  { value: 'manual', label: 'Manual Task', icon: PenLine, color: 'bg-gray-600', borderColor: 'border-gray-600' },
];

const defaultStep: Step = {
  step_type: 'email',
  delay_days: 0,
  send_window_start: '09:00',
  send_window_end: '17:00',
  subject_template: '',
  body_template: '',
  task_instructions: '',
};

export default function SequenceBuilder({
  initialName = '',
  initialDescription = '',
  initialSteps = [],
  initialPauseOnReply = true,
  initialPauseOnBooking = true,
  sequenceId,
}: SequenceBuilderProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [pauseOnReply, setPauseOnReply] = useState(initialPauseOnReply);
  const [pauseOnBooking, setPauseOnBooking] = useState(initialPauseOnBooking);
  const [steps, setSteps] = useState<Step[]>(
    initialSteps.length > 0 ? initialSteps : [{ ...defaultStep }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Collapsed/expanded step tracking
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(
    new Set(initialSteps.length === 0 ? [0] : [])
  );

  // AI Generation state
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiTone, setAiTone] = useState('');
  const [aiStepCount, setAiStepCount] = useState(5);
  const [aiChannels, setAiChannels] = useState<string[]>(['email', 'phone', 'linkedin']);
  const [generating, setGenerating] = useState(false);
  const [regeneratingStep, setRegeneratingStep] = useState<number | null>(null);

  // Calculate total sequence duration
  const totalDays = useMemo(() => {
    return steps.reduce((sum, s) => sum + (s.delay_days || 0), 0);
  }, [steps]);

  // Calculate cumulative day for each step
  const cumulativeDays = useMemo(() => {
    let running = 0;
    return steps.map(s => {
      running += s.delay_days || 0;
      return running;
    });
  }, [steps]);

  const toggleStep = (index: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleChannel = (ch: string) => {
    setAiChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  };

  const addStep = (type: string) => {
    const newIndex = steps.length;
    setSteps([...steps, {
      ...defaultStep,
      step_type: type,
      delay_days: steps.length === 0 ? 0 : 2,
    }]);
    setExpandedSteps(prev => new Set(prev).add(newIndex));
  };

  const duplicateStep = (index: number) => {
    const newSteps = [...steps];
    const cloned = { ...newSteps[index], variant_label: `${newSteps[index].variant_label || 'A'} copy` };
    newSteps.splice(index + 1, 0, cloned);
    setSteps(newSteps);
    // Update expanded indices
    setExpandedSteps(prev => {
      const next = new Set<number>();
      prev.forEach(i => next.add(i >= index + 1 ? i + 1 : i));
      next.add(index + 1);
      return next;
    });
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    setExpandedSteps(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    setSteps(newSteps);
    // Update expanded state
    setExpandedSteps(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i === index) next.add(targetIndex);
        else if (i === targetIndex) next.add(index);
        else next.add(i);
      });
      return next;
    });
  };

  const updateStep = (index: number, field: keyof Step, value: string | number) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) {
      setError('Describe the sequence you want to generate');
      return;
    }

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

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json();

      if (data.name && !name) setName(data.name);
      if (data.description && !description) setDescription(data.description);
      if (data.steps?.length) {
        setSteps(data.steps.map((s: Step) => ({
          step_type: s.step_type || 'email',
          delay_days: s.delay_days ?? 0,
          send_window_start: s.send_window_start || '09:00',
          send_window_end: s.send_window_end || '17:00',
          subject_template: s.subject_template || '',
          body_template: s.body_template || '',
          task_instructions: s.task_instructions || '',
        })));
        // Expand first step
        setExpandedSteps(new Set([0]));
      }

      setMode('manual');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateStep = async (index: number) => {
    if (!aiPrompt.trim() && !description.trim()) {
      setError('Provide a description or AI prompt for context');
      return;
    }

    setRegeneratingStep(index);
    setError('');

    try {
      const surrounding = steps
        .filter((_, i) => Math.abs(i - index) <= 1 && i !== index)
        .map(s => ({
          step_type: s.step_type,
          subject_template: s.subject_template,
          body_template: s.body_template,
        }));

      const res = await fetch('/api/sequences/regenerate-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step_type: steps[index].step_type,
          context: aiPrompt || description || name,
          surrounding_steps: surrounding,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Regeneration failed');
      }

      const newStep = await res.json();
      const newSteps = [...steps];
      newSteps[index] = {
        step_type: newStep.step_type || steps[index].step_type,
        delay_days: newStep.delay_days ?? steps[index].delay_days,
        send_window_start: newStep.send_window_start || steps[index].send_window_start,
        send_window_end: newStep.send_window_end || steps[index].send_window_end,
        subject_template: newStep.subject_template || '',
        body_template: newStep.body_template || '',
        task_instructions: newStep.task_instructions || '',
      };
      setSteps(newSteps);
      // Expand the regenerated step
      setExpandedSteps(prev => new Set(prev).add(index));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setRegeneratingStep(null);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Sequence name is required');
      return;
    }
    if (steps.length === 0) {
      setError('Add at least one step');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const url = sequenceId
        ? `/api/sequences/${sequenceId}`
        : '/api/sequences';
      const method = sequenceId ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          pause_on_reply: pauseOnReply,
          pause_on_booking: pauseOnBooking,
          steps,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      const data = await response.json();
      router.push(`/sequences/${data.sequence.sequence_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const getStepPreview = (step: Step): string => {
    if (step.step_type === 'email') {
      return step.subject_template || 'No subject';
    }
    if (step.step_type === 'phone' || step.step_type === 'manual') {
      return step.task_instructions?.substring(0, 80) || 'No instructions';
    }
    return step.body_template?.substring(0, 80) || 'No content';
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
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
              <Sparkles className="w-3 h-3" /> Auto-Generate
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {sequenceId ? 'Update Sequence' : 'Create Sequence'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Auto-Generate Panel */}
      {mode === 'auto' && (
        <div className="bg-gray-900 border border-blue-800/50 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-400">
            <Wand2 className="w-4 h-4" />
            AI Sequence Generator
          </div>
          <p className="text-xs text-gray-400">
            Describe the campaign and Claude will generate a complete multi-step sequence with email content, call scripts, and LinkedIn messages.
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Describe your campaign</label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Follow up with restaurant owners who attended our webinar about reducing delivery costs. Emphasize 20-30% savings on commissions. Mix of emails and calls over 2 weeks."
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Channels</label>
              <div className="flex gap-1.5">
                {stepTypes.map(t => (
                  <button
                    key={t.value}
                    onClick={() => toggleChannel(t.value)}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      aiChannels.includes(t.value)
                        ? `${t.color} border-transparent text-white`
                        : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <t.icon className="w-3 h-3" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Steps</label>
              <select
                value={aiStepCount}
                onChange={(e) => setAiStepCount(parseInt(e.target.value))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
              >
                {[3, 4, 5, 6, 7, 8, 10].map(n => (
                  <option key={n} value={n}>{n} steps</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Tone</label>
              <select
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">Default</option>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="direct">Direct</option>
                <option value="casual">Casual</option>
                <option value="consultative">Consultative</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !aiPrompt.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Sequence
              </>
            )}
          </button>
        </div>
      )}

      {/* Sequence Info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Sequence Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Post-Demo Follow Up"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this sequence's purpose"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pauseOnReply}
                onChange={(e) => setPauseOnReply(e.target.checked)}
                className="rounded border-gray-700 bg-gray-800"
              />
              Pause on reply
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pauseOnBooking}
                onChange={(e) => setPauseOnBooking(e.target.checked)}
                className="rounded border-gray-700 bg-gray-800"
              />
              Pause on booking
            </label>
          </div>
          {/* Sequence summary */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {totalDays} day{totalDays !== 1 ? 's' : ''} total
            </span>
            <span>{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
            <span>
              {stepTypes.filter(t => steps.some(s => s.step_type === t.value)).map(t => t.label).join(' · ')}
            </span>
          </div>
        </div>
      </div>

      {/* Steps Timeline */}
      <div className="space-y-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Steps</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpandedSteps(new Set(steps.map((_, i) => i)))}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Expand All
            </button>
            <span className="text-gray-700">|</span>
            <button
              onClick={() => setExpandedSteps(new Set())}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>

        {steps.map((step, index) => {
          const typeConfig = stepTypes.find((t) => t.value === step.step_type) || stepTypes[0];
          const Icon = typeConfig.icon;
          const isRegenerating = regeneratingStep === index;
          const isExpanded = expandedSteps.has(index);

          return (
            <div key={index}>
              {/* Timeline connector */}
              {index > 0 && (
                <div className="flex items-center pl-[18px] py-0">
                  <div className="w-px h-6 bg-gray-700 ml-px" />
                  {step.delay_days > 0 && (
                    <span className="text-[10px] text-gray-600 ml-3 -mt-1">
                      +{step.delay_days}d (Day {cumulativeDays[index]})
                    </span>
                  )}
                </div>
              )}

              <div className={`bg-gray-900 border rounded-xl transition-all ${
                isExpanded ? `${typeConfig.borderColor} border-opacity-50` : 'border-gray-800 hover:border-gray-700'
              }`}>
                {/* Step header (always visible) */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                  onClick={() => toggleStep(index)}
                >
                  <GripVertical className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <div className={`w-7 h-7 rounded-lg ${typeConfig.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">Step {index + 1}</span>
                      <span className="text-[10px] text-gray-500 uppercase">{typeConfig.label}</span>
                      {step.variant_label && (
                        <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Tag className="w-2.5 h-2.5" />
                          {step.variant_label}
                        </span>
                      )}
                      {index === 0 && (
                        <span className="text-[10px] bg-green-900/40 text-green-400 px-1.5 py-0.5 rounded">Immediate</span>
                      )}
                    </div>
                    {/* Preview when collapsed */}
                    {!isExpanded && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {getStepPreview(step)}
                      </p>
                    )}
                  </div>

                  {/* Delay badge */}
                  {step.delay_days > 0 && (
                    <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded flex-shrink-0">
                      +{step.delay_days}d
                    </span>
                  )}

                  {/* Expand/collapse icon */}
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-800">
                    {/* Step controls row */}
                    <div className="flex items-center gap-2 pt-3">
                      <select
                        value={step.step_type}
                        onChange={(e) => updateStep(index, 'step_type', e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                      >
                        {stepTypes.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>

                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] text-gray-500">Wait</label>
                        <input
                          type="number"
                          min={0}
                          value={step.delay_days}
                          onChange={(e) => updateStep(index, 'delay_days', parseInt(e.target.value) || 0)}
                          className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-[10px] text-gray-500">days</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] text-gray-500">Variant</label>
                        <input
                          type="text"
                          value={step.variant_label || ''}
                          onChange={(e) => updateStep(index, 'variant_label', e.target.value)}
                          placeholder="A/B"
                          className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={(e) => { e.stopPropagation(); moveStep(index, 'up'); }}
                          disabled={index === 0}
                          className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-30 transition-colors"
                          title="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveStep(index, 'down'); }}
                          disabled={index === steps.length - 1}
                          className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-30 transition-colors"
                          title="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRegenerateStep(index); }}
                          disabled={isRegenerating}
                          className="p-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded transition-colors"
                          title="Regenerate this step"
                        >
                          {isRegenerating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); duplicateStep(index); }}
                          className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
                          title="Duplicate step"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeStep(index); }}
                          className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                          title="Delete step"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Step content based on type */}
                    {step.step_type === 'email' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={step.subject_template}
                          onChange={(e) => updateStep(index, 'subject_template', e.target.value)}
                          placeholder="Email subject (use {{first_name}}, {{business_name}} for variables)"
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
                        />
                        <textarea
                          value={step.body_template}
                          onChange={(e) => updateStep(index, 'body_template', e.target.value)}
                          placeholder="Email body template..."
                          rows={5}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                        />
                        {/* Variable helpers */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-600">Variables:</span>
                          {['{{first_name}}', '{{business_name}}', '{{company}}'].map(v => (
                            <button
                              key={v}
                              onClick={() => {
                                // Insert at cursor position in body
                                updateStep(index, 'body_template', step.body_template + v);
                              }}
                              className="text-[10px] bg-gray-800 border border-gray-700 text-gray-400 px-1.5 py-0.5 rounded hover:text-white hover:border-gray-600 transition-colors"
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {step.step_type === 'phone' && (
                      <textarea
                        value={step.task_instructions}
                        onChange={(e) => updateStep(index, 'task_instructions', e.target.value)}
                        placeholder="Call script / talking points..."
                        rows={4}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                      />
                    )}

                    {step.step_type === 'linkedin' && (
                      <textarea
                        value={step.body_template}
                        onChange={(e) => updateStep(index, 'body_template', e.target.value)}
                        placeholder="LinkedIn message template (use {{first_name}} for variables)"
                        rows={3}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                      />
                    )}

                    {step.step_type === 'sms' && (
                      <div className="space-y-1">
                        <textarea
                          value={step.body_template}
                          onChange={(e) => updateStep(index, 'body_template', e.target.value)}
                          placeholder="SMS message (160 chars max recommended)"
                          rows={2}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                        />
                        <span className={`text-[10px] ${(step.body_template?.length || 0) > 160 ? 'text-yellow-400' : 'text-gray-600'}`}>
                          {step.body_template?.length || 0}/160 chars
                        </span>
                      </div>
                    )}

                    {step.step_type === 'manual' && (
                      <textarea
                        value={step.task_instructions}
                        onChange={(e) => updateStep(index, 'task_instructions', e.target.value)}
                        placeholder="Instructions for this manual task..."
                        rows={3}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500 resize-none"
                      />
                    )}

                    {/* Send window */}
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-gray-500">Send window:</span>
                      <input
                        type="time"
                        value={step.send_window_start}
                        onChange={(e) => updateStep(index, 'send_window_start', e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-[10px] text-gray-500">to</span>
                      <input
                        type="time"
                        value={step.send_window_end}
                        onChange={(e) => updateStep(index, 'send_window_end', e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-[10px] text-gray-500">PST</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Add step buttons */}
        <div className="flex flex-wrap gap-2 pt-3 pl-5">
          {stepTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => addStep(type.value)}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" />
              <type.icon className="w-3 h-3" />
              {type.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Workflow, Users, BarChart3, Copy,
  Bookmark, Play, Pause, Loader2, Trash2,
} from 'lucide-react';
import type { FlowStep, StepMetrics, BranchCondition, ExitAction, SequenceAnalyticsData } from '@/lib/types';
import VisualFlowEditor from '@/components/sequences/VisualFlowEditor';
import EnrollmentDashboard from '@/components/sequences/EnrollmentDashboard';
import SequenceAnalytics from '@/components/sequences/SequenceAnalytics';

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface SequenceData {
  sequence_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  pause_on_reply: boolean;
  pause_on_booking: boolean;
  is_template: boolean;
  template_category: string | null;
  tags: string[];
  cloned_from: number | null;
}

interface StepData {
  step_id: number;
  step_order: number;
  step_type: string;
  delay_days: number;
  send_window_start: string;
  send_window_end: string;
  subject_template: string | null;
  body_template: string | null;
  task_instructions: string | null;
  variant_label: string | null;
  parent_step_id: number | null;
  branch_condition: string | null;
  branch_wait_days: number;
  is_exit_step: boolean;
  exit_action: string | null;
  exit_action_config: Record<string, unknown>;
}

interface EnrollmentData {
  enrollment_id: number;
  contact_id: number;
  sequence_id: number;
  status: string;
  current_step: number;
  next_step_at: string | null;
  paused_reason: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  email: string | null;
  contact_email: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  contact_name: string | null;
}

interface StepMetricData {
  step_id: number;
  step_order: number;
  step_type: string;
  branch_condition: string | null;
  total_executions: number;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  replied_count: number;
  bounced_count: number;
  failed_count: number;
  skipped_count: number;
  open_rate: number;
  reply_rate: number;
  click_rate: number;
}

interface EnrollmentSummary {
  total_enrolled: number;
  active_enrolled: number;
  completed: number;
  replied: number;
  booked: number;
}

interface SequenceDetailClientProps {
  sequence: SequenceData;
  steps: StepData[];
  enrollments: EnrollmentData[];
  stepMetrics: StepMetricData[];
  enrollmentSummary: EnrollmentSummary;
}

type Tab = 'builder' | 'enrollments' | 'analytics';

// ─── Component ──────────────────────────────────────────────────────────────

export default function SequenceDetailClient({
  sequence,
  steps,
  enrollments,
  stepMetrics,
  enrollmentSummary,
}: SequenceDetailClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('builder');
  const [isCloning, setIsCloning] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Convert DB steps → FlowStep format for the visual editor
  const flowSteps = useMemo<FlowStep[]>(() => {
    // Build step_id → step_order lookup for parent resolution
    const idToOrder: Record<number, string> = {};
    for (const s of steps) {
      idToOrder[s.step_id] = String(s.step_id);
    }

    return steps.map((s) => ({
      id: String(s.step_id),
      parentId: s.parent_step_id ? String(s.parent_step_id) : null,
      branchCondition: (s.branch_condition as BranchCondition) || null,
      branchWaitDays: s.branch_wait_days || 0,
      stepType: s.step_type as FlowStep['stepType'],
      delayDays: s.delay_days,
      sendWindowStart: s.send_window_start || '09:00',
      sendWindowEnd: s.send_window_end || '17:00',
      subjectTemplate: s.subject_template || '',
      bodyTemplate: s.body_template || '',
      taskInstructions: s.task_instructions || '',
      variantLabel: s.variant_label || '',
      isExitStep: s.is_exit_step || false,
      exitAction: (s.exit_action as ExitAction) || null,
      exitActionConfig: s.exit_action_config || {},
      metrics: stepMetrics.find((m) => m.step_id === s.step_id) as StepMetrics | undefined,
    }));
  }, [steps, stepMetrics]);

  // Build step metrics map for the flow editor
  const metricsMap = useMemo<Record<number, StepMetrics>>(() => {
    const map: Record<number, StepMetrics> = {};
    for (const m of stepMetrics) {
      map[m.step_id] = m as StepMetrics;
    }
    return map;
  }, [stepMetrics]);

  // Build analytics data for the analytics tab
  const analyticsData = useMemo<SequenceAnalyticsData>(() => ({
    sequence_id: sequence.sequence_id,
    total_enrolled: enrollmentSummary.total_enrolled,
    active_enrolled: enrollmentSummary.active_enrolled,
    completed: enrollmentSummary.completed,
    replied: enrollmentSummary.replied,
    booked: enrollmentSummary.booked,
    avg_completion_rate: enrollmentSummary.total_enrolled > 0
      ? Math.round((enrollmentSummary.completed / enrollmentSummary.total_enrolled) * 100)
      : 0,
    step_metrics: stepMetrics as StepMetrics[],
  }), [sequence, enrollmentSummary, stepMetrics]);

  // Map enrollments to the format EnrollmentDashboard expects
  const mappedEnrollments = useMemo(() =>
    enrollments.map((e) => ({
      enrollment_id: e.enrollment_id,
      contact_id: e.contact_id,
      sequence_id: e.sequence_id,
      status: e.status as 'active' | 'paused' | 'completed' | 'replied' | 'booked',
      current_step: e.current_step,
      current_step_id: null,
      next_step_at: e.next_step_at,
      paused_reason: e.paused_reason,
      started_at: e.started_at,
      completed_at: e.completed_at,
      created_at: e.created_at,
      updated_at: e.updated_at,
      contact_name: e.contact_name || '',
      contact_email: e.contact_email || e.email || '',
      business_name: e.business_name || '',
    })),
    [enrollments]
  );

  // Clone sequence
  const handleClone = useCallback(async () => {
    setIsCloning(true);
    try {
      const res = await fetch(`/api/sequences/${sequence.sequence_id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/sequences/${data.sequence.sequence_id}`);
      }
    } catch (err) {
      console.error('Clone failed:', err);
    } finally {
      setIsCloning(false);
    }
  }, [sequence.sequence_id, router]);

  // Toggle active state
  const handleToggleActive = useCallback(async () => {
    setIsToggling(true);
    try {
      await fetch(`/api/sequences/${sequence.sequence_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !sequence.is_active }),
      });
      router.refresh();
    } catch (err) {
      console.error('Toggle failed:', err);
    } finally {
      setIsToggling(false);
    }
  }, [sequence, router]);

  // Save as template
  const handleSaveAsTemplate = useCallback(async () => {
    try {
      await fetch(`/api/sequences/${sequence.sequence_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_template: true }),
      });
      router.refresh();
    } catch (err) {
      console.error('Save as template failed:', err);
    }
  }, [sequence.sequence_id, router]);

  // Delete sequence
  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this sequence? This will remove all steps, enrollments, and execution data.')) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/sequences/${sequence.sequence_id}`, { method: 'DELETE' });
      router.push('/sequences');
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [sequence.sequence_id, router]);

  const tabs: { key: Tab; label: string; icon: typeof Workflow; count?: number }[] = [
    { key: 'builder', label: 'Builder', icon: Workflow },
    { key: 'enrollments', label: 'Enrollments', icon: Users, count: enrollmentSummary.total_enrolled },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/sequences')}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-white">{sequence.name}</h1>
                {sequence.is_active ? (
                  <span className="flex items-center gap-1 text-[10px] bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full font-medium">
                    <Play className="w-2.5 h-2.5" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                    <Pause className="w-2.5 h-2.5" /> Paused
                  </span>
                )}
                {sequence.is_template && (
                  <span className="flex items-center gap-1 text-[10px] bg-purple-900/40 text-purple-400 px-2 py-0.5 rounded-full font-medium">
                    <Bookmark className="w-2.5 h-2.5" /> Template
                  </span>
                )}
              </div>
              {sequence.description && (
                <p className="text-xs text-gray-500 mt-0.5">{sequence.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleActive}
              disabled={isToggling}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                sequence.is_active
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
              }`}
            >
              {isToggling ? <Loader2 className="w-3 h-3 animate-spin" /> : sequence.is_active ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {sequence.is_active ? 'Pause' : 'Activate'}
            </button>
            <button
              onClick={handleClone}
              disabled={isCloning}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              {isCloning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
              Clone
            </button>
            {!sequence.is_template && (
              <button
                onClick={handleSaveAsTemplate}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                <Bookmark className="w-3 h-3" />
                Save as Template
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-900/20 text-red-400 hover:bg-red-900/40 transition-colors"
            >
              {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded-full ml-0.5">{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'builder' && (
          <VisualFlowEditor
            initialData={{
              sequenceId: sequence.sequence_id,
              name: sequence.name,
              description: sequence.description || '',
              pauseOnReply: sequence.pause_on_reply,
              pauseOnBooking: sequence.pause_on_booking,
              isTemplate: sequence.is_template,
              templateCategory: sequence.template_category || '',
              tags: sequence.tags || [],
            }}
            initialSteps={flowSteps}
            stepMetrics={metricsMap}
            onSaveAsTemplate={handleSaveAsTemplate}
          />
        )}

        {activeTab === 'enrollments' && (
          <div className="p-6">
            <EnrollmentDashboard
              sequenceId={sequence.sequence_id}
              enrollments={mappedEnrollments}
              totalSteps={steps.length}
              onRefresh={() => window.location.reload()}
            />
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="p-6">
            <SequenceAnalytics analytics={analyticsData} />
          </div>
        )}
      </div>
    </div>
  );
}

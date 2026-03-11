'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ListTodo, Phone, Linkedin, MessageSquare, PenLine,
  Mail, Clock, Building2, CheckCircle2, SkipForward,
  Loader2, Sparkles, AlarmClock, Target, ChevronDown,
  ChevronUp, RefreshCw, Zap, Timer,
} from 'lucide-react';
import TaskActions from '@/components/queue/TaskActions';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskRow {
  task_id: number;
  contact_id: number;
  enrollment_id: number | null;
  step_id: number | null;
  task_type: string;
  title: string;
  instructions: string | null;
  priority: number;
  status: string;
  due_at: string | null;
  snoozed_until: string | null;
  contact_email: string;
  contact_phone: string | null;
  contact_name: string;
  business_name: string | null;
  linkedin_url: string | null;
  lifecycle_stage: string;
}

interface PlanAction {
  priority: number;
  type: string;
  title: string;
  detail: string;
  contact_name?: string;
  business_name?: string;
  estimated_minutes?: number;
}

interface DailyTarget {
  metric: string;
  current: number;
  target: number;
  status: string;
}

interface DailyPlan {
  greeting: string;
  priority_actions: PlanAction[];
  daily_targets: DailyTarget[];
  time_estimate: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const taskTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  linkedin_message: Linkedin,
  linkedin_connect: Linkedin,
  linkedin_view: Linkedin,
  sms: MessageSquare,
  email_review: Mail,
  manual: PenLine,
};

const taskTypeColors: Record<string, string> = {
  call: 'bg-green-600',
  linkedin_message: 'bg-cyan-600',
  linkedin_connect: 'bg-cyan-600',
  linkedin_view: 'bg-cyan-600',
  sms: 'bg-purple-600',
  email_review: 'bg-blue-600',
  manual: 'bg-gray-600',
};

const planTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  reply: Mail,
  call: Phone,
  followup: RefreshCw,
  hot_lead: Zap,
  callback: AlarmClock,
  sequence: ListTodo,
};

const planTypeColors: Record<string, string> = {
  reply: 'text-blue-400',
  call: 'text-green-400',
  followup: 'text-yellow-400',
  hot_lead: 'text-orange-400',
  callback: 'text-purple-400',
  sequence: 'text-cyan-400',
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function QueuePage() {
  const [tab, setTab] = useState<'plan' | 'queue'>('plan');
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completedToday, setCompletedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks?status=pending&limit=100');
      const data = await res.json();
      setTasks(data.tasks || []);

      const cRes = await fetch('/api/tasks?status=completed&limit=1');
      // Count completed today from separate query
      const completedRes = await fetch('/api/tasks?status=completed&limit=100');
      const completedData = await completedRes.json();
      const todayCompleted = (completedData.tasks || []).filter((t: TaskRow) =>
        t.status === 'completed' && new Date(t.due_at || '').toDateString() === new Date().toDateString()
      );
      setCompletedToday(todayCompleted.length);
    } catch (e) {
      console.error('[queue] error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const generatePlan = async () => {
    setPlanLoading(true);
    try {
      const res = await fetch('/api/tasks/daily-plan', { method: 'POST' });
      const data = await res.json();
      setPlan(data.plan);
    } catch (e) {
      console.error('[plan] error:', e);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleSnooze = async (taskId: number, hours: number) => {
    try {
      await fetch('/api/tasks/snooze', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, hours }),
      });
      setTasks(prev => prev.filter(t => t.task_id !== taskId));
    } catch (e) {
      console.error('[snooze] error:', e);
    }
  };

  const handleBatchAction = async (action: 'complete' | 'skip') => {
    if (selectedTasks.size === 0) return;
    setBatchLoading(true);
    try {
      await fetch('/api/tasks/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_ids: Array.from(selectedTasks),
          action,
        }),
      });
      setSelectedTasks(new Set());
      fetchTasks();
    } catch (e) {
      console.error('[batch] error:', e);
    } finally {
      setBatchLoading(false);
    }
  };

  const toggleTask = (taskId: number) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedTasks.size === tasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(tasks.map(t => t.task_id)));
    }
  };

  // Group tasks
  const callTasks = tasks.filter(t => t.task_type === 'call');
  const linkedinTasks = tasks.filter(t => t.task_type.startsWith('linkedin'));
  const smsTasks = tasks.filter(t => t.task_type === 'sms');
  const otherTasks = tasks.filter(t => !['call', 'sms'].includes(t.task_type) && !t.task_type.startsWith('linkedin'));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Action Queue</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {tasks.length} pending tasks
            {completedToday > 0 && ` · ${completedToday} completed today`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab Toggle */}
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5">
            <button
              onClick={() => setTab('plan')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                tab === 'plan' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Sparkles className="w-3 h-3" /> Daily Plan
            </button>
            <button
              onClick={() => setTab('queue')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                tab === 'queue' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <ListTodo className="w-3 h-3" /> Queue
            </button>
          </div>
        </div>
      </div>

      {/* ─── Daily Plan Tab ─────────────────────────────────────────────── */}
      {tab === 'plan' && (
        <div className="space-y-4">
          {!plan && !planLoading && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <Sparkles className="w-10 h-10 text-blue-400 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-white mb-2">Generate Your Daily Plan</h2>
              <p className="text-sm text-gray-400 mb-4 max-w-md mx-auto">
                AI will analyze your queue, hot leads, recent replies, and scheduled callbacks
                to create a prioritized action plan for today.
              </p>
              <button
                onClick={generatePlan}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Generate Plan
              </button>
            </div>
          )}

          {planLoading && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Analyzing your pipeline and generating your daily plan...</p>
            </div>
          )}

          {plan && !planLoading && (
            <>
              {/* Greeting */}
              <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-800/30 rounded-xl p-5">
                <p className="text-sm text-blue-200">{plan.greeting}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Timer className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs text-gray-400">{plan.time_estimate}</span>
                </div>
              </div>

              {/* Daily Targets */}
              {plan.daily_targets && plan.daily_targets.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {plan.daily_targets.map(dt => (
                    <div key={dt.metric} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-gray-500 uppercase">{dt.metric}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          dt.status === 'ahead' ? 'bg-green-600/20 text-green-400' :
                          dt.status === 'on_track' ? 'bg-yellow-600/20 text-yellow-400' :
                          'bg-red-600/20 text-red-400'
                        }`}>
                          {dt.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-white">{dt.current}</span>
                        <span className="text-xs text-gray-500">/ {dt.target}</span>
                      </div>
                      <div className="mt-1.5 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            dt.status === 'ahead' ? 'bg-green-500' :
                            dt.status === 'on_track' ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min((dt.current / dt.target) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Priority Actions */}
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <Target className="w-4 h-4" /> Priority Actions
                </h2>
                {plan.priority_actions.map((action, i) => {
                  const Icon = planTypeIcons[action.type] || ListTodo;
                  const color = planTypeColors[action.type] || 'text-gray-400';
                  return (
                    <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-800 shrink-0">
                          <span className="text-xs font-bold text-gray-300">#{action.priority}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Icon className={`w-3.5 h-3.5 ${color}`} />
                            <span className="text-sm font-medium text-white">{action.title}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{action.detail}</p>
                          <div className="flex items-center gap-3 mt-2">
                            {action.contact_name && (
                              <span className="text-[10px] text-gray-500">{action.contact_name}</span>
                            )}
                            {action.business_name && (
                              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> {action.business_name}
                              </span>
                            )}
                            {action.estimated_minutes && (
                              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> ~{action.estimated_minutes}min
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={generatePlan}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Regenerate Plan
              </button>
            </>
          )}
        </div>
      )}

      {/* ─── Queue Tab ──────────────────────────────────────────────────── */}
      {tab === 'queue' && (
        <div className="space-y-4">
          {/* Batch Action Bar */}
          {selectedTasks.size > 0 && (
            <div className="bg-blue-600/10 border border-blue-700/30 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-blue-300">{selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''} selected</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBatchAction('complete')}
                  disabled={batchLoading}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Complete All
                </button>
                <button
                  onClick={() => handleBatchAction('skip')}
                  disabled={batchLoading}
                  className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  <SkipForward className="w-3 h-3" /> Skip All
                </button>
                <button
                  onClick={() => setSelectedTasks(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-300 px-2"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Select All */}
          {tasks.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={toggleAll} className="text-xs text-gray-500 hover:text-gray-300">
                {selectedTasks.size === tasks.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}

          {tasks.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <p className="text-gray-300 font-medium">All caught up!</p>
              <p className="text-sm text-gray-500 mt-1">No pending tasks. Enroll contacts in sequences to generate tasks.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {callTasks.length > 0 && (
                <TaskSection
                  title="Phone Calls"
                  icon={Phone}
                  color="text-green-400"
                  tasks={callTasks}
                  selectedTasks={selectedTasks}
                  onToggle={toggleTask}
                  onSnooze={handleSnooze}
                  onRefresh={fetchTasks}
                />
              )}
              {linkedinTasks.length > 0 && (
                <TaskSection
                  title="LinkedIn"
                  icon={Linkedin}
                  color="text-cyan-400"
                  tasks={linkedinTasks}
                  selectedTasks={selectedTasks}
                  onToggle={toggleTask}
                  onSnooze={handleSnooze}
                  onRefresh={fetchTasks}
                />
              )}
              {smsTasks.length > 0 && (
                <TaskSection
                  title="SMS"
                  icon={MessageSquare}
                  color="text-purple-400"
                  tasks={smsTasks}
                  selectedTasks={selectedTasks}
                  onToggle={toggleTask}
                  onSnooze={handleSnooze}
                  onRefresh={fetchTasks}
                />
              )}
              {otherTasks.length > 0 && (
                <TaskSection
                  title="Other Tasks"
                  icon={PenLine}
                  color="text-gray-400"
                  tasks={otherTasks}
                  selectedTasks={selectedTasks}
                  onToggle={toggleTask}
                  onSnooze={handleSnooze}
                  onRefresh={fetchTasks}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Task Section ───────────────────────────────────────────────────────────

function TaskSection({
  title,
  icon: Icon,
  color,
  tasks,
  selectedTasks,
  onToggle,
  onSnooze,
  onRefresh,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  tasks: TaskRow[];
  selectedTasks: Set<number>;
  onToggle: (id: number) => void;
  onSnooze: (id: number, hours: number) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 mb-3 group"
      >
        <Icon className={`w-4 h-4 ${color}`} />
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{tasks.length}</span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2">
          {tasks.map(task => {
            const TypeIcon = taskTypeIcons[task.task_type] || PenLine;
            const bgColor = taskTypeColors[task.task_type] || 'bg-gray-600';
            const isSelected = selectedTasks.has(task.task_id);
            const isOverdue = task.due_at && new Date(task.due_at) < new Date();

            return (
              <div
                key={task.task_id}
                className={`bg-gray-900 border rounded-xl p-4 hover:border-gray-700 transition-all ${
                  isSelected ? 'border-blue-600/50 bg-blue-600/5' :
                  isOverdue ? 'border-red-800/50' : 'border-gray-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => onToggle(task.task_id)}
                    className={`w-5 h-5 rounded border-2 shrink-0 mt-1 transition-colors ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3 h-3 text-white mx-auto" />}
                  </button>

                  <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
                    <TypeIcon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/contacts/${task.contact_id}`} className="text-sm font-medium text-white hover:text-blue-400">
                        {task.contact_name}
                      </Link>
                      {task.business_name && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" /> {task.business_name}
                        </span>
                      )}
                      {isOverdue && (
                        <span className="text-[10px] bg-red-600/20 text-red-400 px-1.5 py-0.5 rounded">OVERDUE</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{task.title}</p>
                    {task.instructions && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.instructions}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {task.contact_phone && (
                        <span className="text-[10px] text-gray-500">
                          <Phone className="w-3 h-3 inline mr-0.5" />{task.contact_phone}
                        </span>
                      )}
                      {task.contact_email && (
                        <span className="text-[10px] text-gray-500">
                          <Mail className="w-3 h-3 inline mr-0.5" />{task.contact_email}
                        </span>
                      )}
                      {task.due_at && (
                        <span className={`text-[10px] ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
                          <Clock className="w-3 h-3 inline mr-0.5" />
                          Due {new Date(task.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Snooze + Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="relative group">
                      <button
                        className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs px-2 py-1.5 rounded-lg transition-colors"
                        title="Snooze"
                      >
                        <AlarmClock className="w-3 h-3" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 hidden group-hover:block">
                        {[
                          { label: '1h', hours: 1 },
                          { label: '4h', hours: 4 },
                          { label: 'Tomorrow', hours: 24 },
                        ].map(opt => (
                          <button
                            key={opt.hours}
                            onClick={() => onSnooze(task.task_id, opt.hours)}
                            className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 whitespace-nowrap"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <TaskActions task={task} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

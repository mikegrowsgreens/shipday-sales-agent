import { query } from '@/lib/db';
import Link from 'next/link';
import {
  Bookmark, Plus, Workflow, Mail, Phone, Linkedin,
  MessageSquare, PenLine, Clock, Copy, ArrowLeft,
  Tag, Users,
} from 'lucide-react';

interface TemplateRow {
  sequence_id: number;
  name: string;
  description: string | null;
  template_category: string | null;
  tags: string[];
  created_at: string;
  step_count: string;
  clone_count: string;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  cold_outreach: { label: 'Cold Outreach', color: 'bg-blue-900/40 text-blue-400' },
  follow_up: { label: 'Follow-Up', color: 'bg-green-900/40 text-green-400' },
  nurture: { label: 'Nurture', color: 'bg-purple-900/40 text-purple-400' },
  event: { label: 'Event', color: 'bg-yellow-900/40 text-yellow-400' },
  re_engagement: { label: 'Re-Engagement', color: 'bg-orange-900/40 text-orange-400' },
  onboarding: { label: 'Onboarding', color: 'bg-cyan-900/40 text-cyan-400' },
};

const stepTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  phone: Phone,
  linkedin: Linkedin,
  sms: MessageSquare,
  manual: PenLine,
};

const stepTypeColors: Record<string, string> = {
  email: 'text-blue-400',
  phone: 'text-green-400',
  linkedin: 'text-cyan-400',
  sms: 'text-purple-400',
  manual: 'text-gray-400',
};

async function getTemplates(category?: string) {
  try {
    let sql = `
      SELECT
        s.*,
        COUNT(DISTINCT ss.step_id)::text as step_count,
        COUNT(DISTINCT s2.sequence_id)::text as clone_count
      FROM crm.sequences s
      LEFT JOIN crm.sequence_steps ss ON ss.sequence_id = s.sequence_id
      LEFT JOIN crm.sequences s2 ON s2.cloned_from = s.sequence_id
      WHERE s.is_template = true
    `;
    const params: unknown[] = [];
    if (category) {
      params.push(category);
      sql += ` AND s.template_category = $${params.length}`;
    }
    sql += ` GROUP BY s.sequence_id ORDER BY s.created_at DESC`;
    return await query<TemplateRow>(sql, params);
  } catch (error) {
    console.error('[templates] error:', error);
    return [];
  }
}

async function getStepTypeBreakdown() {
  try {
    return await query<{ sequence_id: number; step_type: string; count: string }>(`
      SELECT ss.sequence_id, ss.step_type, COUNT(*)::text as count
      FROM crm.sequence_steps ss
      JOIN crm.sequences s ON s.sequence_id = ss.sequence_id
      WHERE s.is_template = true
      GROUP BY ss.sequence_id, ss.step_type
    `);
  } catch {
    return [];
  }
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const [templates, stepBreakdown] = await Promise.all([
    getTemplates(category),
    getStepTypeBreakdown(),
  ]);

  const stepMap: Record<number, Record<string, number>> = {};
  for (const row of stepBreakdown) {
    if (!stepMap[row.sequence_id]) stepMap[row.sequence_id] = {};
    stepMap[row.sequence_id][row.step_type] = parseInt(row.count);
  }

  const categories = Object.entries(CATEGORY_LABELS);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/sequences"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Sequence Templates</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Clone proven sequences to jumpstart your outreach
            </p>
          </div>
        </div>
        <Link
          href="/sequences/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Sequence
        </Link>
      </div>

      {/* Category Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href="/sequences/templates"
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            !category ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          All
        </Link>
        {categories.map(([key, { label }]) => (
          <Link
            key={key}
            href={`/sequences/templates?category=${key}`}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              category === key ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Bookmark className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No templates found</p>
          <p className="text-sm text-gray-500 mt-1">
            Save your best sequences as templates to reuse them
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {templates.map((tpl) => {
            const types = stepMap[tpl.sequence_id] || {};
            const stepCount = parseInt(tpl.step_count);
            const cloneCount = parseInt(tpl.clone_count);
            const catConfig = tpl.template_category ? CATEGORY_LABELS[tpl.template_category] : null;

            return (
              <div
                key={tpl.sequence_id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Bookmark className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <h3 className="text-sm font-semibold text-white truncate">{tpl.name}</h3>
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{tpl.description}</p>
                    )}
                  </div>
                </div>

                {/* Category + Tags */}
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  {catConfig && (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${catConfig.color}`}>
                      {catConfig.label}
                    </span>
                  )}
                  {tpl.tags?.map((tag) => (
                    <span key={tag} className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Step info */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span className="text-[11px] text-gray-400">{stepCount} steps</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {Object.entries(types).map(([type, count]) => {
                      const Icon = stepTypeIcons[type] || PenLine;
                      const color = stepTypeColors[type] || 'text-gray-400';
                      return (
                        <div key={type} className="flex items-center gap-0.5" title={`${count} ${type}`}>
                          <Icon className={`w-3 h-3 ${color}`} />
                          <span className={`text-[10px] ${color}`}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                  {cloneCount > 0 && (
                    <div className="flex items-center gap-1 ml-auto">
                      <Users className="w-3 h-3 text-gray-500" />
                      <span className="text-[10px] text-gray-500">{cloneCount} clones</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link
                    href={`/sequences/${tpl.sequence_id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    <Workflow className="w-3 h-3" />
                    View
                  </Link>
                  <CloneButton sequenceId={tpl.sequence_id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Client component for clone button (needs interactivity)
function CloneButton({ sequenceId }: { sequenceId: number }) {
  return (
    <form
      action={async () => {
        'use server';
        const { queryOne, query: dbQuery } = await import('@/lib/db');
        const source = await queryOne<{ sequence_id: number; name: string; description: string | null; pause_on_reply: boolean; pause_on_booking: boolean; tags: string[] }>(
          `SELECT * FROM crm.sequences WHERE sequence_id = $1`, [sequenceId]
        );
        if (!source) return;

        const cloned = await queryOne<{ sequence_id: number }>(
          `INSERT INTO crm.sequences (name, description, pause_on_reply, pause_on_booking, tags, cloned_from)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING sequence_id`,
          [`${source.name} (copy)`, source.description, source.pause_on_reply, source.pause_on_booking, source.tags, sequenceId]
        );
        if (!cloned) return;

        const sourceSteps = await dbQuery<{
          step_id: number; step_order: number; step_type: string; delay_days: number;
          send_window_start: string; send_window_end: string;
          subject_template: string | null; body_template: string | null;
          task_instructions: string | null; variant_label: string | null;
          parent_step_id: number | null; branch_condition: string | null; branch_wait_days: number;
          is_exit_step: boolean; exit_action: string | null; exit_action_config: unknown;
        }>(`SELECT * FROM crm.sequence_steps WHERE sequence_id = $1 ORDER BY step_order`, [sequenceId]);

        const stepIdMap: Record<number, number> = {};
        for (const step of sourceSteps) {
          const newStep = await queryOne<{ step_id: number }>(
            `INSERT INTO crm.sequence_steps (
              sequence_id, step_order, step_type, delay_days,
              send_window_start, send_window_end,
              subject_template, body_template, task_instructions, variant_label,
              branch_condition, branch_wait_days,
              is_exit_step, exit_action, exit_action_config
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING step_id`,
            [
              cloned.sequence_id, step.step_order, step.step_type, step.delay_days,
              step.send_window_start, step.send_window_end,
              step.subject_template, step.body_template, step.task_instructions, step.variant_label,
              step.branch_condition, step.branch_wait_days,
              step.is_exit_step, step.exit_action, JSON.stringify(step.exit_action_config || {}),
            ]
          );
          if (newStep) stepIdMap[step.step_id] = newStep.step_id;
        }

        for (const step of sourceSteps) {
          if (step.parent_step_id && stepIdMap[step.parent_step_id] && stepIdMap[step.step_id]) {
            await dbQuery(
              `UPDATE crm.sequence_steps SET parent_step_id = $1 WHERE step_id = $2`,
              [stepIdMap[step.parent_step_id], stepIdMap[step.step_id]]
            );
          }
        }

        const { redirect } = await import('next/navigation');
        redirect(`/sequences/${cloned.sequence_id}`);
      }}
    >
      <button
        type="submit"
        className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
      >
        <Copy className="w-3 h-3" />
        Clone
      </button>
    </form>
  );
}

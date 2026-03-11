import { query } from '@/lib/db';
import Link from 'next/link';
import {
  Workflow, Play, Pause, Users, Clock, Mail,
  Phone, Linkedin, MessageSquare, PenLine, Plus,
  Bookmark,
} from 'lucide-react';

interface SequenceRow {
  sequence_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  is_template: boolean;
  template_category: string | null;
  tags: string[];
  pause_on_reply: boolean;
  pause_on_booking: boolean;
  created_at: string;
  active_enrollments: string;
  total_enrollments: string;
  step_count: string;
}

async function getSequences() {
  try {
    return await query<SequenceRow>(`
      SELECT
        s.*,
        COUNT(DISTINCT se.enrollment_id) FILTER (WHERE se.status = 'active')::text as active_enrollments,
        COUNT(DISTINCT se.enrollment_id)::text as total_enrollments,
        COUNT(DISTINCT ss.step_id)::text as step_count
      FROM crm.sequences s
      LEFT JOIN crm.sequence_enrollments se ON se.sequence_id = s.sequence_id
      LEFT JOIN crm.sequence_steps ss ON ss.sequence_id = s.sequence_id
      WHERE (s.is_template = false OR s.is_template IS NULL)
      GROUP BY s.sequence_id
      ORDER BY s.created_at DESC
    `);
  } catch (error) {
    console.error('[sequences] error:', error);
    return [];
  }
}

async function getStepTypeBreakdown() {
  try {
    return await query<{ sequence_id: number; step_type: string; count: string }>(`
      SELECT sequence_id, step_type, COUNT(*)::text as count
      FROM crm.sequence_steps
      GROUP BY sequence_id, step_type
      ORDER BY sequence_id, step_type
    `);
  } catch {
    return [];
  }
}

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

export default async function SequencesPage() {
  const [sequences, stepBreakdown] = await Promise.all([
    getSequences(),
    getStepTypeBreakdown(),
  ]);

  // Build step type map
  const stepMap: Record<number, Record<string, number>> = {};
  for (const row of stepBreakdown) {
    if (!stepMap[row.sequence_id]) stepMap[row.sequence_id] = {};
    stepMap[row.sequence_id][row.step_type] = parseInt(row.count);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sequences</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Build multitouch outreach sequences — email, phone, LinkedIn, SMS
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sequences/templates"
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Bookmark className="w-4 h-4" /> Templates
          </Link>
          <Link
            href="/sequences/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> New Sequence
          </Link>
        </div>
      </div>

      {sequences.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Workflow className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No sequences yet</p>
          <p className="text-sm text-gray-500 mt-1">Create your first sequence to start automating outreach</p>
          <Link
            href="/sequences/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg mt-4 transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Sequence
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {sequences.map((seq) => {
            const activeCount = parseInt(seq.active_enrollments);
            const totalCount = parseInt(seq.total_enrollments);
            const stepCount = parseInt(seq.step_count);
            const types = stepMap[seq.sequence_id] || {};

            return (
              <Link key={seq.sequence_id} href={`/sequences/${seq.sequence_id}`}>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-all cursor-pointer group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                          {seq.name}
                        </h3>
                        {seq.is_active ? (
                          <span className="flex items-center gap-1 text-[10px] bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full font-medium">
                            <Play className="w-2.5 h-2.5" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                            <Pause className="w-2.5 h-2.5" /> Paused
                          </span>
                        )}
                      </div>
                      {seq.description && (
                        <p className="text-sm text-gray-400 mt-1 truncate">{seq.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 mt-4 pt-3 border-t border-gray-800/50">
                    {/* Step types */}
                    <div className="flex items-center gap-3">
                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs text-gray-400">{stepCount} steps</span>
                      <div className="flex items-center gap-1.5">
                        {Object.entries(types).map(([type, count]) => {
                          const Icon = stepTypeIcons[type] || PenLine;
                          const color = stepTypeColors[type] || 'text-gray-400';
                          return (
                            <div key={type} className="flex items-center gap-0.5" title={`${count} ${type} steps`}>
                              <Icon className={`w-3 h-3 ${color}`} />
                              <span className={`text-[10px] ${color}`}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Enrollment stats */}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Users className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs text-gray-400">
                        <span className="text-white font-medium">{activeCount}</span> active
                        {totalCount > activeCount && (
                          <span className="text-gray-500"> / {totalCount} total</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

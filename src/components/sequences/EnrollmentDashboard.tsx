'use client';

import { useState } from 'react';
import {
  Users, Play, Pause, Trash2, Search, Filter,
  ChevronDown, Clock, CheckCircle, XCircle, Mail,
  AlertTriangle, Calendar, UserMinus,
} from 'lucide-react';
import type { SequenceEnrollment, EnrollmentStatus } from '@/lib/types';

interface EnrollmentDashboardProps {
  sequenceId: number;
  enrollments: (SequenceEnrollment & {
    contact_name?: string;
    contact_email?: string;
    business_name?: string;
    first_name?: string;
    last_name?: string;
  })[];
  totalSteps: number;
  onRefresh: () => void;
}

const STATUS_CONFIG: Record<EnrollmentStatus, { label: string; color: string; bg: string; icon: typeof Play }> = {
  active: { label: 'Active', color: 'text-green-400', bg: 'bg-green-900/30', icon: Play },
  paused: { label: 'Paused', color: 'text-yellow-400', bg: 'bg-yellow-900/30', icon: Pause },
  completed: { label: 'Completed', color: 'text-gray-400', bg: 'bg-gray-800', icon: CheckCircle },
  replied: { label: 'Replied', color: 'text-blue-400', bg: 'bg-blue-900/30', icon: Mail },
  booked: { label: 'Booked', color: 'text-cyan-400', bg: 'bg-cyan-900/30', icon: Calendar },
};

export default function EnrollmentDashboard({
  sequenceId,
  enrollments,
  totalSteps,
  onRefresh,
}: EnrollmentDashboardProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | 'all'>('all');
  const [stepFilter, setStepFilter] = useState<number | 'all'>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  // Filter enrollments
  const filtered = enrollments.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (stepFilter !== 'all' && e.current_step !== stepFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
      const email = (e.contact_email || '').toLowerCase();
      const biz = (e.business_name || '').toLowerCase();
      if (!name.includes(q) && !email.includes(q) && !biz.includes(q)) return false;
    }
    return true;
  });

  // Status counts
  const statusCounts = enrollments.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(e => e.enrollment_id)));
  };

  const handleBulkAction = async (action: 'pause' | 'resume' | 'remove') => {
    if (selected.size === 0) return;
    setActionLoading(true);

    try {
      const res = await fetch(`/api/sequences/${sequenceId}/enrollments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_ids: Array.from(selected),
          action,
        }),
      });

      if (!res.ok) throw new Error('Action failed');
      setSelected(new Set());
      onRefresh();
    } catch (err) {
      console.error('Bulk action failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const getContactName = (e: EnrollmentDashboardProps['enrollments'][0]) => {
    if (e.contact_name) return e.contact_name;
    if (e.first_name || e.last_name) return `${e.first_name || ''} ${e.last_name || ''}`.trim();
    return e.contact_email || 'Unknown';
  };

  return (
    <div className="space-y-4">
      {/* Status Summary Cards */}
      <div className="grid grid-cols-5 gap-3">
        {(Object.entries(STATUS_CONFIG) as [EnrollmentStatus, typeof STATUS_CONFIG.active][]).map(([status, config]) => {
          const count = statusCounts[status] || 0;
          const isActive = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(isActive ? 'all' : status)}
              className={`p-3 rounded-xl border transition-all text-left ${
                isActive
                  ? `${config.bg} border-${config.color.replace('text-', '')}/30`
                  : 'bg-gray-900 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <config.icon className={`w-3.5 h-3.5 ${config.color}`} />
                <span className={`text-xs font-medium ${isActive ? config.color : 'text-gray-400'}`}>{config.label}</span>
              </div>
              <p className={`text-xl font-bold mt-1 ${isActive ? 'text-white' : 'text-gray-300'}`}>{count}</p>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={stepFilter === 'all' ? '' : stepFilter}
          onChange={(e) => setStepFilter(e.target.value ? parseInt(e.target.value) : 'all')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">All steps</option>
          {Array.from({ length: totalSteps }, (_, i) => (
            <option key={i} value={i + 1}>Step {i + 1}</option>
          ))}
        </select>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-400">{selected.size} selected</span>
            <button
              onClick={() => handleBulkAction('pause')}
              disabled={actionLoading}
              className="flex items-center gap-1 text-xs text-yellow-400 hover:bg-yellow-900/20 px-2 py-1 rounded transition-colors"
            >
              <Pause className="w-3 h-3" /> Pause
            </button>
            <button
              onClick={() => handleBulkAction('resume')}
              disabled={actionLoading}
              className="flex items-center gap-1 text-xs text-green-400 hover:bg-green-900/20 px-2 py-1 rounded transition-colors"
            >
              <Play className="w-3 h-3" /> Resume
            </button>
            <button
              onClick={() => handleBulkAction('remove')}
              disabled={actionLoading}
              className="flex items-center gap-1 text-xs text-red-400 hover:bg-red-900/20 px-2 py-1 rounded transition-colors"
            >
              <UserMinus className="w-3 h-3" /> Remove
            </button>
          </div>
        )}
      </div>

      {/* Enrollments Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-4 py-2.5 text-left">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={selectAll}
                  className="rounded border-gray-600 bg-gray-800"
                />
              </th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-gray-500 uppercase">Contact</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-gray-500 uppercase">Step</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-gray-500 uppercase">Next Action</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-gray-500 uppercase">Started</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  {enrollments.length === 0 ? 'No contacts enrolled yet' : 'No matches found'}
                </td>
              </tr>
            ) : (
              filtered.map(enrollment => {
                const statusConfig = STATUS_CONFIG[enrollment.status] || STATUS_CONFIG.active;
                const isChecked = selected.has(enrollment.enrollment_id);

                return (
                  <tr
                    key={enrollment.enrollment_id}
                    className={`border-b border-gray-800/50 transition-colors ${isChecked ? 'bg-blue-900/10' : 'hover:bg-gray-800/30'}`}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(enrollment.enrollment_id)}
                        className="rounded border-gray-600 bg-gray-800"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div>
                        <p className="text-sm text-white font-medium">{getContactName(enrollment)}</p>
                        <p className="text-[11px] text-gray-500">
                          {enrollment.contact_email}
                          {enrollment.business_name && ` · ${enrollment.business_name}`}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                        <statusConfig.icon className="w-2.5 h-2.5" />
                        {statusConfig.label}
                      </span>
                      {enrollment.paused_reason && (
                        <p className="text-[10px] text-gray-600 mt-0.5">{enrollment.paused_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium">{enrollment.current_step}</span>
                        <span className="text-[10px] text-gray-600">/ {totalSteps}</span>
                        {/* Progress bar */}
                        <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${(enrollment.current_step / totalSteps) * 100}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {enrollment.next_step_at ? (
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(enrollment.next_step_at)}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-gray-500">
                        {formatDate(enrollment.started_at)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffMs < 0) return 'Overdue';
  if (diffHours < 1) return 'Soon';
  if (diffHours < 24) return `${Math.round(diffHours)}h`;
  if (diffDays < 7) return `${Math.round(diffDays)}d`;
  return formatDate(dateStr);
}

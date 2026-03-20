'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, Filter, X } from 'lucide-react';
import { Customer } from '@/lib/types';

const ALL_PLANS = [
  { key: 'branded_elite_lite', label: 'Elite Lite' },
  { key: 'branded_elite_custom', label: 'Elite Custom' },
  { key: 'branded_premium_plus', label: 'Premium Plus' },
  { key: 'branded_premium', label: 'Premium' },
  { key: 'business_advanced_lite', label: 'Biz Advanced Lite' },
  { key: 'business_advanced', label: 'Biz Advanced' },
  { key: 'pro', label: 'Pro' },
  { key: 'elite', label: 'Elite' },
];

const STATUSES = [
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'churned', label: 'Churned' },
];

export interface SegmentFilters {
  plans?: string[];
  statuses?: string[];
  states?: string[];
  health_min?: number;
  health_max?: number;
  avg_orders_min?: number;
  avg_orders_max?: number;
  avg_order_value_min?: number;
  avg_order_value_max?: number;
  signup_before?: string;
  signup_after?: string;
  last_active_before?: string;
  last_active_after?: string;
  has_email_history?: boolean;
  tags_include?: string[];
  tags_exclude?: string[];
}

interface CustomerSegmentFilterProps {
  value: SegmentFilters;
  onChange: (filters: SegmentFilters) => void;
  preview?: { count: number; customers: Customer[] } | null;
  loading?: boolean;
}

export function CustomerSegmentFilter({ value, onChange, preview, loading }: CustomerSegmentFilterProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (patch: Partial<SegmentFilters>) => {
    onChange({ ...value, ...patch });
  };

  const togglePlan = (plan: string) => {
    const current = value.plans || [];
    const next = current.includes(plan) ? current.filter(p => p !== plan) : [...current, plan];
    update({ plans: next.length ? next : undefined });
  };

  const toggleStatus = (status: string) => {
    const current = value.statuses || [];
    const next = current.includes(status) ? current.filter(s => s !== status) : [...current, status];
    update({ statuses: next.length ? next : undefined });
  };

  const activeFilterCount = [
    value.plans?.length,
    value.statuses?.length,
    value.states?.length,
    value.health_min != null || value.health_max != null,
    value.avg_orders_min != null || value.avg_orders_max != null,
    value.avg_order_value_min != null || value.avg_order_value_max != null,
    value.signup_after || value.signup_before,
    value.last_active_after || value.last_active_before,
    value.has_email_history != null,
    value.tags_include?.length,
    value.tags_exclude?.length,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Plan Filter */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-2 block">Plans</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_PLANS.map(plan => (
            <button
              key={plan.key}
              onClick={() => togglePlan(plan.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                (value.plans || []).includes(plan.key)
                  ? 'bg-blue-600/30 text-blue-400 ring-1 ring-blue-500/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {plan.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Filter */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-2 block">Status</label>
        <div className="flex gap-1.5">
          {STATUSES.map(status => (
            <button
              key={status.key}
              onClick={() => toggleStatus(status.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                (value.statuses || []).includes(status.key)
                  ? 'bg-blue-600/30 text-blue-400 ring-1 ring-blue-500/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {/* Health Score Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Health Min</label>
          <input
            type="number" min={0} max={100} placeholder="0"
            value={value.health_min ?? ''}
            onChange={e => update({ health_min: e.target.value ? parseInt(e.target.value) : undefined })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Health Max</label>
          <input
            type="number" min={0} max={100} placeholder="100"
            value={value.health_max ?? ''}
            onChange={e => update({ health_max: e.target.value ? parseInt(e.target.value) : undefined })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
          />
        </div>
      </div>

      {/* Advanced Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300"
      >
        <Filter className="w-3 h-3" />
        {showAdvanced ? 'Hide' : 'Show'} Advanced Filters
        {activeFilterCount > 2 && <span className="text-blue-400">({activeFilterCount} active)</span>}
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-2 border-l-2 border-gray-800">
          {/* States */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">States (comma-separated)</label>
            <input
              type="text" placeholder="WA, NV, CA"
              value={(value.states || []).join(', ')}
              onChange={e => {
                const states = e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                update({ states: states.length ? states : undefined });
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
            />
          </div>

          {/* Avg Orders */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Min Avg Orders</label>
              <input
                type="number" placeholder="0"
                value={value.avg_orders_min ?? ''}
                onChange={e => update({ avg_orders_min: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Max Avg Orders</label>
              <input
                type="number" placeholder="999"
                value={value.avg_orders_max ?? ''}
                onChange={e => update({ avg_orders_max: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
              />
            </div>
          </div>

          {/* Avg Order Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Min Order Value ($)</label>
              <input
                type="number" placeholder="0"
                value={value.avg_order_value_min ?? ''}
                onChange={e => update({ avg_order_value_min: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Max Order Value ($)</label>
              <input
                type="number" placeholder="999"
                value={value.avg_order_value_max ?? ''}
                onChange={e => update({ avg_order_value_max: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
              />
            </div>
          </div>

          {/* Date Filters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Signed Up After</label>
              <input
                type="date"
                value={value.signup_after || ''}
                onChange={e => update({ signup_after: e.target.value || undefined })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Last Active Before</label>
              <input
                type="date"
                value={value.last_active_before || ''}
                onChange={e => update({ last_active_before: e.target.value || undefined })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
              />
            </div>
          </div>

          {/* Email History */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Email History</label>
            <select
              value={value.has_email_history == null ? '' : value.has_email_history ? 'yes' : 'no'}
              onChange={e => update({ has_email_history: e.target.value === '' ? undefined : e.target.value === 'yes' })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
            >
              <option value="">Any</option>
              <option value="yes">Has emails</option>
              <option value="no">No emails</option>
            </select>
          </div>
        </div>
      )}

      {/* Segment Preview */}
      {preview && (
        <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            {loading ? (
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
            ) : (
              <Users className="w-4 h-4 text-blue-400" />
            )}
            <span className="text-sm font-medium text-gray-200">{preview.count} customers match</span>
          </div>
          {preview.customers.slice(0, 5).map(c => (
            <div key={c.id} className="text-xs text-gray-400 py-0.5">
              {c.business_name} — {c.account_plan || 'No plan'} — {c.email}
            </div>
          ))}
          {preview.count > 5 && (
            <p className="text-xs text-gray-500 mt-1">+ {preview.count - 5} more</p>
          )}
        </div>
      )}
    </div>
  );
}

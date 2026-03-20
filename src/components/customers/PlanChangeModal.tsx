'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Customer } from '@/lib/types';
import { PlanBadge } from './PlanBadge';

const ALL_PLANS = [
  { key: 'branded_elite_lite', label: 'Branded Elite Lite' },
  { key: 'branded_elite_custom', label: 'Branded Elite Custom' },
  { key: 'branded_premium_plus', label: 'Branded Premium Plus' },
  { key: 'branded_premium', label: 'Branded Premium' },
  { key: 'business_advanced_lite', label: 'Business Advanced Lite' },
  { key: 'business_advanced', label: 'Business Advanced' },
  { key: 'pro', label: 'Pro' },
  { key: 'elite', label: 'Elite' },
];

interface PlanChangeModalProps {
  customer: Customer;
  onClose: () => void;
  onSave: () => void;
}

export function PlanChangeModal({ customer, onClose, onSave }: PlanChangeModalProps) {
  const [newPlan, setNewPlan] = useState('');
  const [changeType, setChangeType] = useState('upgrade');
  const [changeDate, setChangeDate] = useState(new Date().toISOString().split('T')[0]);
  const [commission, setCommission] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlan) { setError('Please select a new plan'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/customers/${customer.id}/plan-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_plan: newPlan,
          change_type: changeType,
          change_date: changeDate,
          commission: commission ? parseFloat(commission) : null,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Change Plan</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Current plan */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Current Plan</label>
            <PlanBadge plan={customer.account_plan} />
          </div>

          {/* New plan */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">New Plan *</label>
            <select
              value={newPlan}
              onChange={e => setNewPlan(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Select plan...</option>
              {ALL_PLANS.filter(p => p.key !== customer.account_plan).map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Change type */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Change Type</label>
            <select
              value={changeType}
              onChange={e => setChangeType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="upgrade">Upgrade</option>
              <option value="downgrade">Downgrade</option>
              <option value="lateral">Lateral Move</option>
            </select>
          </div>

          {/* Date + Commission */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Change Date</label>
              <input
                type="date"
                value={changeDate}
                onChange={e => setChangeDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Commission ($)</label>
              <input
                type="number"
                step="0.01"
                value={commission}
                onChange={e => setCommission(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save Change
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

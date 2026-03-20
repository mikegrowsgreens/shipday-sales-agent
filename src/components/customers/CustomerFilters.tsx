'use client';

import { Search, X, ChevronDown } from 'lucide-react';

interface FilterOptions {
  plans: string[];
  states: string[];
}

interface CustomerFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  plan: string;
  onPlanChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  state: string;
  onStateChange: (v: string) => void;
  options: FilterOptions;
  onClear: () => void;
}

const planLabels: Record<string, string> = {
  branded_elite_lite: 'Elite Lite',
  branded_elite_custom: 'Elite Custom',
  branded_premium_plus: 'Premium Plus',
  branded_premium: 'Premium',
  business_advanced_lite: 'Adv Lite',
  business_advanced: 'Advanced',
  pro: 'Pro',
  elite: 'Elite',
};

export function CustomerFilters({
  search, onSearchChange,
  plan, onPlanChange,
  status, onStatusChange,
  state, onStateChange,
  options,
  onClear,
}: CustomerFiltersProps) {
  const hasFilters = search || plan !== 'all' || status !== 'all' || state !== 'all';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Plan filter */}
      <div className="relative">
        <select
          value={plan}
          onChange={(e) => onPlanChange(e.target.value)}
          className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Plans</option>
          {options.plans.map(p => (
            <option key={p} value={p}>{planLabels[p] || p}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      </div>

      {/* Status filter */}
      <div className="relative">
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="churned">Churned</option>
          <option value="suspended">Suspended</option>
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      </div>

      {/* State filter */}
      <div className="relative">
        <select
          value={state}
          onChange={(e) => onStateChange(e.target.value)}
          className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All States</option>
          {options.states.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      </div>

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}

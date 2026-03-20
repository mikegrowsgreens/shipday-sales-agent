'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Crown, Upload, ArrowUpDown, ChevronLeft, ChevronRight,
  Loader2, Users, InboxIcon,
} from 'lucide-react';
import { Customer } from '@/lib/types';
import { CustomerKPIBar } from '@/components/customers/CustomerKPIBar';
import { CustomerFilters } from '@/components/customers/CustomerFilters';
import { PlanBadge } from '@/components/customers/PlanBadge';
import { HealthScore } from '@/components/customers/HealthScore';

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-green-600/20', text: 'text-green-400' },
  inactive: { bg: 'bg-gray-600/20', text: 'text-gray-400' },
  churned: { bg: 'bg-red-600/20', text: 'text-red-400' },
  suspended: { bg: 'bg-yellow-600/20', text: 'text-yellow-400' },
};

type SortField = 'business_name' | 'account_plan' | 'account_status' | 'signup_date' | 'last_active' | 'health_score' | 'avg_order_value' | 'avg_completed_orders';

const LIMIT = 25;

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('all');
  const [status, setStatus] = useState('all');
  const [state, setState] = useState('all');
  const [sort, setSort] = useState<SortField>('business_name');
  const [order, setOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [page, setPage] = useState(0);
  const [filterOptions, setFilterOptions] = useState<{ plans: string[]; states: string[] }>({ plans: [], states: [] });
  const searchTimeout = useRef<NodeJS.Timeout>(undefined);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort, order, limit: String(LIMIT), offset: String(page * LIMIT),
      });
      if (search) params.set('search', search);
      if (plan !== 'all') params.set('plan', plan);
      if (status !== 'all') params.set('status', status);
      if (state !== 'all') params.set('state', state);

      const res = await fetch(`/api/customers?${params}`);
      const data = await res.json();
      setCustomers(data.customers || []);
      setTotal(data.total || 0);
      if (data.plans) setFilterOptions(prev => ({ ...prev, plans: data.plans }));
      if (data.states) setFilterOptions(prev => ({ ...prev, states: data.states }));
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  }, [search, plan, status, state, sort, order, page]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleSearch = (val: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setSearch(val);
    searchTimeout.current = setTimeout(() => { setPage(0); }, 300);
  };

  const handleSort = (field: SortField) => {
    if (sort === field) {
      setOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSort(field);
      setOrder('ASC');
    }
    setPage(0);
  };

  const clearFilters = () => {
    setSearch('');
    setPlan('all');
    setStatus('all');
    setState('all');
    setPage(0);
  };

  const totalPages = Math.ceil(total / LIMIT);
  const isEmpty = !loading && customers.length === 0 && !search && plan === 'all' && status === 'all' && state === 'all';

  const SortHeader = ({ field, label, className }: { field: SortField; label: string; className?: string }) => (
    <th
      onClick={() => handleSort(field)}
      className={`px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 select-none ${className || ''}`}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sort === field ? 'text-blue-400' : 'text-gray-600'}`} />
      </div>
    </th>
  );

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="w-6 h-6 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Customer Hub</h1>
            <p className="text-sm text-gray-400">Manage and engage your customers</p>
          </div>
        </div>
        <Link
          href="/customers/import"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </Link>
      </div>

      {/* KPI Bar */}
      <CustomerKPIBar />

      {/* Filters */}
      <CustomerFilters
        search={search}
        onSearchChange={handleSearch}
        plan={plan}
        onPlanChange={(v) => { setPlan(v); setPage(0); }}
        status={status}
        onStatusChange={(v) => { setStatus(v); setPage(0); }}
        state={state}
        onStateChange={(v) => { setState(v); setPage(0); }}
        options={filterOptions}
        onClear={clearFilters}
      />

      {/* Empty State */}
      {isEmpty && (
        <div className="text-center py-16">
          <InboxIcon className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No customers yet</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Import your customer data from Google Sheets to get started with the Customer Hub.
          </p>
          <Link
            href="/customers/import"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Upload className="w-4 h-4" />
            Import from CSV
          </Link>
        </div>
      )}

      {/* Table */}
      {!isEmpty && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr>
                  <SortHeader field="business_name" label="Business" className="min-w-[180px]" />
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Contact</th>
                  <SortHeader field="account_plan" label="Plan" />
                  <SortHeader field="account_status" label="Status" />
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">State</th>
                  <SortHeader field="health_score" label="Health" />
                  <SortHeader field="avg_order_value" label="Avg Order" />
                  <SortHeader field="avg_completed_orders" label="Orders" />
                  <SortHeader field="signup_date" label="Signup" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-500 mx-auto" />
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-12 text-center text-gray-500 text-sm">
                      No customers match your filters
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => {
                    const sc = statusColors[c.account_status] || statusColors.inactive;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/customers/${c.id}`)}
                        className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-3">
                          <div>
                            <p className="text-sm font-medium text-white truncate max-w-[200px]">{c.business_name}</p>
                            {c.email && <p className="text-xs text-gray-500 truncate max-w-[200px]">{c.email}</p>}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-sm text-gray-300 truncate max-w-[140px]">{c.contact_name || '—'}</p>
                        </td>
                        <td className="px-3 py-3">
                          <PlanBadge plan={c.account_plan} />
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sc.bg} ${sc.text}`}>
                            {c.account_status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-400">
                          {c.state || '—'}
                        </td>
                        <td className="px-3 py-3">
                          <HealthScore score={c.health_score} />
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {c.avg_order_value != null ? `$${Number(c.avg_order_value).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-300">
                          {c.avg_completed_orders != null ? Number(c.avg_completed_orders).toFixed(0) : '—'}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {c.signup_date ? new Date(c.signup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
              <p className="text-xs text-gray-500">
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-400 px-2">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Users, DollarSign, AlertTriangle, MapPin, BarChart3, Loader2 } from 'lucide-react';
import { CustomerStats } from '@/lib/types';
import { PlanBadge } from './PlanBadge';

export function CustomerKPIBar() {
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/customers/stats')
      .then(res => res.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-gray-800 rounded w-20 mb-3" />
            <div className="h-7 bg-gray-800 rounded w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {/* Active Customers */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Active Customers</span>
          <Users className="w-4 h-4 text-gray-600" />
        </div>
        <div className="text-2xl font-bold text-white">{stats.total_active}</div>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
          <span>{stats.total_inactive} inactive</span>
          <span>&middot;</span>
          <span>{stats.total_churned} churned</span>
        </div>
      </div>

      {/* Plan Breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Plans</span>
          <BarChart3 className="w-4 h-4 text-gray-600" />
        </div>
        <div className="space-y-1">
          {Object.entries(stats.by_plan).slice(0, 3).map(([plan, count]) => (
            <div key={plan} className="flex items-center justify-between">
              <PlanBadge plan={plan} />
              <span className="text-xs text-gray-400 ml-2">{count}</span>
            </div>
          ))}
          {Object.keys(stats.by_plan).length > 3 && (
            <p className="text-xs text-gray-600">+{Object.keys(stats.by_plan).length - 3} more</p>
          )}
        </div>
      </div>

      {/* Avg Order Value */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Avg Order Value</span>
          <DollarSign className="w-4 h-4 text-gray-600" />
        </div>
        <div className="text-2xl font-bold text-white">
          ${stats.avg_order_value.toFixed(2)}
        </div>
      </div>

      {/* At Risk */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">At Risk</span>
          <AlertTriangle className="w-4 h-4 text-gray-600" />
        </div>
        <div className={`text-2xl font-bold ${stats.at_risk_count > 0 ? 'text-red-400' : 'text-white'}`}>
          {stats.at_risk_count}
        </div>
        <p className="text-xs text-gray-500 mt-1">Health &lt; 40</p>
      </div>

      {/* Total Locations */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Total Locations</span>
          <MapPin className="w-4 h-4 text-gray-600" />
        </div>
        <div className="text-2xl font-bold text-white">{stats.total_locations}</div>
        <p className="text-xs text-gray-500 mt-1">
          Health avg: {stats.avg_health_score}
        </p>
      </div>
    </div>
  );
}

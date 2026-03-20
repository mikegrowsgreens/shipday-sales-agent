'use client';

import { MapPin, Truck, ShoppingCart, DollarSign, Receipt, Clock } from 'lucide-react';
import { Customer } from '@/lib/types';

interface UsageTabProps {
  customer: Customer;
}

export function UsageTab({ customer }: UsageTabProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <MetricCard
          icon={MapPin}
          label="Locations"
          value={customer.num_locations != null ? String(customer.num_locations) : '—'}
          color="text-blue-400"
        />
        <MetricCard
          icon={Truck}
          label="Drivers"
          value={customer.num_drivers != null ? String(customer.num_drivers) : '—'}
          color="text-purple-400"
        />
        <MetricCard
          icon={ShoppingCart}
          label="Avg Completed Orders"
          value={customer.avg_completed_orders != null ? Number(customer.avg_completed_orders).toFixed(0) : '—'}
          color="text-green-400"
        />
        <MetricCard
          icon={DollarSign}
          label="Avg Order Value"
          value={customer.avg_order_value != null ? `$${Number(customer.avg_order_value).toFixed(2)}` : '—'}
          color="text-yellow-400"
        />
        <MetricCard
          icon={Receipt}
          label="Avg Cost / Order"
          value={customer.avg_cost_per_order != null ? `$${Number(customer.avg_cost_per_order).toFixed(2)}` : '—'}
          color="text-orange-400"
        />
        <MetricCard
          icon={Clock}
          label="Last Active"
          value={customer.last_active ? new Date(customer.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          color="text-cyan-400"
        />
      </div>

      {/* Margin estimate if both values present */}
      {customer.avg_order_value != null && customer.avg_cost_per_order != null && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Margin Estimate</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500">Revenue / Order</p>
              <p className="text-lg font-bold text-white">${Number(customer.avg_order_value).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Cost / Order</p>
              <p className="text-lg font-bold text-white">${Number(customer.avg_cost_per_order).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Margin / Order</p>
              <p className={`text-lg font-bold ${(Number(customer.avg_order_value) - Number(customer.avg_cost_per_order)) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${(Number(customer.avg_order_value) - Number(customer.avg_cost_per_order)).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-600">
        Last updated: {new Date(customer.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}

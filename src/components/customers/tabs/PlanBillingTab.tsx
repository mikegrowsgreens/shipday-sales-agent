'use client';

import { ArrowRight, DollarSign, Hash, Percent } from 'lucide-react';
import { Customer, CustomerPlanChange } from '@/lib/types';
import { PlanBadge } from '../PlanBadge';

interface PlanBillingTabProps {
  customer: Customer;
  planHistory: CustomerPlanChange[];
  onPlanChange: () => void;
}

export function PlanBillingTab({ customer, planHistory, onPlanChange }: PlanBillingTabProps) {
  return (
    <div className="space-y-5">
      {/* Current Plan Card */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-300">Current Plan</h3>
          <button
            onClick={onPlanChange}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Change Plan
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-3xl">
            <PlanBadge plan={customer.account_plan} />
          </div>
          {customer.plan_display_name && customer.plan_display_name !== customer.account_plan && (
            <span className="text-sm text-gray-500">{customer.plan_display_name}</span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          {customer.discount_pct != null && customer.discount_pct > 0 && (
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-gray-600" />
              <div>
                <p className="text-xs text-gray-500">Discount</p>
                <p className="text-sm text-white">{customer.discount_pct}%</p>
              </div>
            </div>
          )}
          {customer.shipday_account_id && (
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-gray-600" />
              <div>
                <p className="text-xs text-gray-500">Account ID</p>
                <p className="text-sm text-white">{customer.shipday_account_id}</p>
              </div>
            </div>
          )}
          {customer.shipday_company_id && (
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-gray-600" />
              <div>
                <p className="text-xs text-gray-500">Company ID</p>
                <p className="text-sm text-white">{customer.shipday_company_id}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plan Change Timeline */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-4">Plan History</h3>

        {planHistory.length === 0 ? (
          <p className="text-sm text-gray-600">No plan changes recorded</p>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-800" />

            <div className="space-y-4">
              {planHistory.map((change) => (
                <div key={change.id} className="flex items-start gap-4 relative">
                  {/* Dot */}
                  <div className={`w-[23px] h-[23px] rounded-full border-2 flex items-center justify-center shrink-0 z-10 ${
                    change.change_type === 'upgrade' ? 'border-green-500 bg-green-500/20' :
                    change.change_type === 'downgrade' ? 'border-red-500 bg-red-500/20' :
                    'border-blue-500 bg-blue-500/20'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      change.change_type === 'upgrade' ? 'bg-green-500' :
                      change.change_type === 'downgrade' ? 'bg-red-500' :
                      'bg-blue-500'
                    }`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PlanBadge plan={change.previous_plan} />
                      <ArrowRight className="w-3 h-3 text-gray-600" />
                      <PlanBadge plan={change.new_plan} />
                      <span className={`text-xs font-medium capitalize ${
                        change.change_type === 'upgrade' ? 'text-green-400' :
                        change.change_type === 'downgrade' ? 'text-red-400' :
                        'text-blue-400'
                      }`}>
                        {change.change_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-500">
                        {change.change_date ? new Date(change.change_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date'}
                      </span>
                      {change.commission != null && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <DollarSign className="w-3 h-3" />
                          {Number(change.commission).toFixed(2)} commission
                        </span>
                      )}
                    </div>
                    {change.notes && (
                      <p className="text-xs text-gray-600 mt-1">{change.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

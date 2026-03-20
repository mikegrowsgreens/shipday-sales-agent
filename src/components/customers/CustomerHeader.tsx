'use client';

import { Mail, Phone, Pencil, ArrowRightLeft, StickyNote } from 'lucide-react';
import { Customer } from '@/lib/types';
import { PlanBadge } from './PlanBadge';
import { HealthScore } from './HealthScore';

const statusColors: Record<string, { dot: string; text: string }> = {
  active: { dot: 'bg-green-500', text: 'text-green-400' },
  inactive: { dot: 'bg-gray-500', text: 'text-gray-400' },
  churned: { dot: 'bg-red-500', text: 'text-red-400' },
  suspended: { dot: 'bg-yellow-500', text: 'text-yellow-400' },
};

interface CustomerHeaderProps {
  customer: Customer;
  onEdit: () => void;
  onPlanChange: () => void;
  onNotesClick: () => void;
}

export function CustomerHeader({ customer, onEdit, onPlanChange, onNotesClick }: CustomerHeaderProps) {
  const sc = statusColors[customer.account_status] || statusColors.inactive;
  const initials = customer.business_name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-start gap-5">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400 text-lg font-bold shrink-0">
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white">{customer.business_name}</h1>
            <PlanBadge plan={customer.account_plan} />
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
              <span className={`text-xs font-medium capitalize ${sc.text}`}>{customer.account_status}</span>
            </div>
            <HealthScore score={customer.health_score} />
          </div>

          {/* Contact info line */}
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-400 flex-wrap">
            {customer.contact_name && <span>{customer.contact_name}</span>}
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="flex items-center gap-1 hover:text-blue-400 transition-colors">
                <Mail className="w-3.5 h-3.5" />
                {customer.email}
              </a>
            )}
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-blue-400 transition-colors">
                <Phone className="w-3.5 h-3.5" />
                {customer.phone}
              </a>
            )}
            {customer.state && (
              <span>{customer.city ? `${customer.city}, ${customer.state}` : customer.state}</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              onClick={onPlanChange}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Change Plan
            </button>
            <button
              onClick={onNotesClick}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors"
            >
              <StickyNote className="w-3.5 h-3.5" />
              Notes
            </button>
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-600/30 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Send Email
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { Mail, Phone, MapPin, Calendar, Building2, Users, Truck, Hash, Tag, X } from 'lucide-react';
import { Customer, CustomerEmail } from '@/lib/types';

interface OverviewTabProps {
  customer: Customer;
  recentEmails: CustomerEmail[];
  emailCount: number;
  onTagsChange: (tags: string[]) => void;
}

export function OverviewTab({ customer, recentEmails, emailCount, onTagsChange }: OverviewTabProps) {
  const addTag = () => {
    const tag = prompt('Enter tag name:');
    if (tag && !customer.tags.includes(tag.trim())) {
      onTagsChange([...customer.tags, tag.trim()]);
    }
  };

  const removeTag = (tag: string) => {
    onTagsChange(customer.tags.filter(t => t !== tag));
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Contact Details */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Contact Details</h3>
          <div className="space-y-3">
            <InfoRow icon={Building2} label="Business" value={customer.business_name} />
            <InfoRow icon={Users} label="Contact" value={customer.contact_name} />
            <InfoRow icon={Mail} label="Email" value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
            <InfoRow icon={Phone} label="Phone" value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
            <InfoRow icon={MapPin} label="Address" value={[customer.address, customer.city, customer.state].filter(Boolean).join(', ') || null} />
            {customer.shipday_company_id && <InfoRow icon={Hash} label="Company ID" value={String(customer.shipday_company_id)} />}
            {customer.shipday_account_id && <InfoRow icon={Hash} label="Account ID" value={customer.shipday_account_id} />}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Quick Stats</h3>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Signup Date" value={customer.signup_date ? new Date(customer.signup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} />
            <StatCard label="Last Active" value={customer.last_active ? new Date(customer.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} />
            <StatCard label="Locations" value={customer.num_locations != null ? String(customer.num_locations) : '—'} />
            <StatCard label="Drivers" value={customer.num_drivers != null ? String(customer.num_drivers) : '—'} />
            <StatCard label="Total Emails" value={String(emailCount)} />
            <StatCard label="Imported From" value={customer.imported_from || '—'} />
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Tags</h3>
        <div className="flex flex-wrap items-center gap-2">
          {customer.tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800 rounded text-xs text-gray-300">
              <Tag className="w-3 h-3 text-gray-500" />
              {tag}
              <button onClick={() => removeTag(tag)} className="text-gray-600 hover:text-gray-300 ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button onClick={addTag} className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300">
            + Add Tag
          </button>
        </div>
      </div>

      {/* Recent Emails */}
      {recentEmails.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Recent Emails</h3>
          <div className="space-y-2">
            {recentEmails.map(email => (
              <div key={email.id} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-gray-800/50">
                <span className={`text-xs mt-1 ${email.direction === 'outbound' ? 'text-blue-400' : 'text-green-400'}`}>
                  {email.direction === 'outbound' ? '↗' : '↙'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{email.subject || '(no subject)'}</p>
                  <p className="text-xs text-gray-500 truncate">{email.snippet}</p>
                </div>
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  {email.date ? new Date(email.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | null; href?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-gray-600 shrink-0" />
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      {href ? (
        <a href={href} className="text-sm text-blue-400 hover:text-blue-300 truncate">{value}</a>
      ) : (
        <span className="text-sm text-gray-300 truncate">{value}</span>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}

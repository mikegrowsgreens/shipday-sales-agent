'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Customer, CustomerEmail, CustomerPlanChange } from '@/lib/types';
import { CustomerHeader } from '@/components/customers/CustomerHeader';
import { OverviewTab } from '@/components/customers/tabs/OverviewTab';
import { EmailsTab } from '@/components/customers/tabs/EmailsTab';
import { PlanBillingTab } from '@/components/customers/tabs/PlanBillingTab';
import { UsageTab } from '@/components/customers/tabs/UsageTab';
import { NotesTab } from '@/components/customers/tabs/NotesTab';
import { PlanChangeModal } from '@/components/customers/PlanChangeModal';
import { EditCustomerModal } from '@/components/customers/EditCustomerModal';

interface CustomerDetail extends Customer {
  plan_history: CustomerPlanChange[];
  recent_emails: CustomerEmail[];
  email_count: number;
}

type Tab = 'overview' | 'emails' | 'plan' | 'usage' | 'notes';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'emails', label: 'Emails' },
  { key: 'plan', label: 'Plan & Billing' },
  { key: 'usage', label: 'Usage' },
  { key: 'notes', label: 'Notes' },
];

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const fetchCustomer = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      const data = await res.json();
      if (data.error) { setNotFound(true); setLoading(false); return; }
      setCustomer(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  const handleSaveFields = async (fields: Record<string, unknown>) => {
    await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    await fetchCustomer();
  };

  const handleTagsChange = async (tags: string[]) => {
    await handleSaveFields({ tags });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
      </div>
    );
  }

  if (notFound || !customer) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-lg font-medium text-gray-300 mb-2">Customer not found</h2>
        <Link href="/customers" className="text-sm text-blue-400 hover:text-blue-300">
          Back to Customer Hub
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Back link */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Customers
      </Link>

      {/* Header */}
      <CustomerHeader
        customer={customer}
        onEdit={() => setShowEditModal(true)}
        onPlanChange={() => setShowPlanModal(true)}
        onNotesClick={() => setActiveTab('notes')}
      />

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <div className="flex items-center gap-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.key
                  ? 'text-blue-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
              {tab.key === 'emails' && customer.email_count > 0 && (
                <span className="ml-1.5 text-xs text-gray-600">({customer.email_count})</span>
              )}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab
            customer={customer}
            recentEmails={customer.recent_emails}
            emailCount={customer.email_count}
            onTagsChange={handleTagsChange}
          />
        )}
        {activeTab === 'emails' && (
          <EmailsTab
            customerId={customer.id}
            initialEmails={customer.recent_emails}
            initialEmailCount={customer.email_count}
          />
        )}
        {activeTab === 'plan' && (
          <PlanBillingTab
            customer={customer}
            planHistory={customer.plan_history}
            onPlanChange={() => setShowPlanModal(true)}
          />
        )}
        {activeTab === 'usage' && (
          <UsageTab customer={customer} />
        )}
        {activeTab === 'notes' && (
          <NotesTab
            customer={customer}
            onSave={handleSaveFields}
          />
        )}
      </div>

      {/* Modals */}
      {showEditModal && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setShowEditModal(false)}
          onSave={() => { setShowEditModal(false); fetchCustomer(); }}
        />
      )}
      {showPlanModal && (
        <PlanChangeModal
          customer={customer}
          onClose={() => setShowPlanModal(false)}
          onSave={() => { setShowPlanModal(false); fetchCustomer(); }}
        />
      )}
    </div>
  );
}

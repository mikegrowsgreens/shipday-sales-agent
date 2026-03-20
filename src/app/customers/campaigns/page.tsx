'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Megaphone, Plus, Loader2, ArrowLeft, Send, Users, BarChart3 } from 'lucide-react';
import { CustomerCampaign, CustomerCampaignType } from '@/lib/types';

const TYPE_LABELS: Record<string, string> = {
  upsell: 'Upsell',
  retention: 'Retention',
  winback: 'Win-back',
  feature_adoption: 'Feature Adoption',
  review_request: 'Review/Referral',
  announcement: 'Announcement',
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-600/20', text: 'text-gray-400' },
  active: { bg: 'bg-blue-600/20', text: 'text-blue-400' },
  paused: { bg: 'bg-yellow-600/20', text: 'text-yellow-400' },
  completed: { bg: 'bg-green-600/20', text: 'text-green-400' },
};

export default function CampaignsListPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CustomerCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/customers/campaigns')
      .then(r => r.json())
      .then(data => setCampaigns(data.campaigns || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Customer Campaigns</h1>
            <p className="text-sm text-gray-500">Upsell, retain, and engage your customers</p>
          </div>
        </div>
        <Link
          href="/customers/campaigns/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </Link>
      </div>

      {/* Quick-Create Buttons */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => router.push(`/customers/campaigns/new?type=${key}`)}
            className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs font-medium hover:bg-gray-700 hover:text-gray-200 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Campaign List */}
      {campaigns.length === 0 ? (
        <div className="text-center py-12">
          <Megaphone className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No campaigns yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Create your first campaign to start engaging customers with personalized emails.
          </p>
          <Link
            href="/customers/campaigns/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-600/30"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map(campaign => {
            const style = STATUS_STYLES[campaign.status] || STATUS_STYLES.draft;
            return (
              <div
                key={campaign.id}
                onClick={() => router.push(`/customers/campaigns/${campaign.id}`)}
                className="flex items-center gap-4 px-4 py-3 rounded-lg bg-gray-900/50 hover:bg-gray-800/50 transition-colors cursor-pointer border border-gray-800/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-gray-200 truncate">{campaign.name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {TYPE_LABELS[campaign.campaign_type || ''] || 'General'} — Created {formatDate(campaign.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {campaign.total_recipients}</span>
                  <span className="flex items-center gap-1"><Send className="w-3 h-3" /> {campaign.sent_count}</span>
                  <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {campaign.open_count} opened</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

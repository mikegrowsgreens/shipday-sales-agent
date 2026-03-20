'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Sparkles, Check, CheckCircle2, Send, RefreshCw,
  Users, BarChart3, Mail, AlertCircle, ChevronDown, ChevronRight, Edit3, Trash2,
} from 'lucide-react';
import { CustomerCampaign, CustomerCampaignSend, CampaignSendStatus } from '@/lib/types';

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
  approved: { bg: 'bg-blue-600/20', text: 'text-blue-400' },
  sent: { bg: 'bg-green-600/20', text: 'text-green-400' },
  opened: { bg: 'bg-emerald-600/20', text: 'text-emerald-400' },
  replied: { bg: 'bg-purple-600/20', text: 'text-purple-400' },
  bounced: { bg: 'bg-red-600/20', text: 'text-red-400' },
};

interface CampaignDetail extends CustomerCampaign {
  sends: (CustomerCampaignSend & { business_name: string; contact_name: string })[];
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedSend, setExpandedSend] = useState<number | null>(null);
  const [editingSend, setEditingSend] = useState<number | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/campaigns/${id}`);
      if (!res.ok) { router.push('/customers/campaigns'); return; }
      const data = await res.json();
      setCampaign(data);
    } catch {
      router.push('/customers/campaigns');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/customers/campaigns/${id}/generate`, { method: 'POST' });
      const data = await res.json();
      if (data.error) { showMessage('error', data.error); return; }
      showMessage('success', `Generated ${data.generated} emails`);
      await fetchCampaign();
    } catch {
      showMessage('error', 'Failed to generate emails');
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveAll = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/customers/campaigns/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve_all: true }),
      });
      const data = await res.json();
      showMessage('success', `Approved ${data.approved} emails`);
      await fetchCampaign();
    } catch {
      showMessage('error', 'Failed to approve');
    } finally {
      setApproving(false);
    }
  };

  const handleApproveSingle = async (sendId: number) => {
    try {
      await fetch(`/api/customers/campaigns/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_ids: [sendId] }),
      });
      await fetchCampaign();
    } catch {
      showMessage('error', 'Failed to approve');
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/customers/campaigns/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (data.error) { showMessage('error', data.error); return; }
      showMessage('success', `Sent ${data.sent} emails${data.failed ? `, ${data.failed} failed` : ''}`);
      await fetchCampaign();
    } catch {
      showMessage('error', 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await fetch(`/api/customers/campaigns/${id}`, { method: 'DELETE' });
      router.push('/customers/campaigns');
    } catch {
      showMessage('error', 'Failed to delete');
      setDeleting(false);
    }
  };

  const handleSaveEdit = async (sendId: number) => {
    try {
      // Update the send directly via a PATCH-like approach
      await fetch(`/api/customers/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _update_send: { id: sendId, subject: editSubject, body: editBody } }),
      });
      setEditingSend(null);
      await fetchCampaign();
    } catch {
      showMessage('error', 'Failed to save edit');
    }
  };

  if (loading || !campaign) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-gray-600 animate-spin" />
      </div>
    );
  }

  const draftCount = campaign.sends.filter(s => s.status === 'draft').length;
  const approvedCount = campaign.sends.filter(s => s.status === 'approved').length;
  const sentCount = campaign.sends.filter(s => s.status === 'sent').length;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <Link
        href="/customers/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaigns
      </Link>

      {/* Message Banner */}
      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
          message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-800/30' :
          'bg-red-900/30 text-red-400 border border-red-800/30'
        }`}>
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold text-gray-100">{campaign.name}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              (STATUS_STYLES[campaign.status] || STATUS_STYLES.draft).bg
            } ${(STATUS_STYLES[campaign.status] || STATUS_STYLES.draft).text}`}>
              {campaign.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {TYPE_LABELS[campaign.campaign_type || ''] || 'General'} — Created {formatDate(campaign.created_at)}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={Users} label="Recipients" value={campaign.total_recipients} />
        <StatCard icon={Mail} label="Draft" value={draftCount} />
        <StatCard icon={CheckCircle2} label="Approved" value={approvedCount} />
        <StatCard icon={Send} label="Sent" value={sentCount} />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {campaign.sends.length === 0 && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-500 disabled:opacity-50 transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating...' : 'Generate Emails'}
          </button>
        )}
        {draftCount > 0 && (
          <>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Regenerate All
            </button>
            <button
              onClick={handleApproveAll}
              disabled={approving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve All ({draftCount})
            </button>
          </>
        )}
        {approvedCount > 0 && (
          <button
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Campaign ({approvedCount})
          </button>
        )}
      </div>

      {/* Sends List */}
      {campaign.sends.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No emails generated yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Click "Generate Emails" to create personalized emails for {campaign.total_recipients || 'your'} recipients.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-xs text-gray-500 mb-2">{campaign.sends.length} emails</div>
          {campaign.sends.map(send => {
            const style = STATUS_STYLES[send.status] || STATUS_STYLES.draft;
            const isExpanded = expandedSend === send.id;
            const isEditing = editingSend === send.id;

            return (
              <div key={send.id} className="border border-gray-800/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => {
                    setExpandedSend(isExpanded ? null : send.id);
                    if (isEditing) setEditingSend(null);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/30 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-200 truncate">{send.business_name || send.to_email}</p>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                        {send.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{send.subject || '(no subject)'}</p>
                  </div>

                  {send.sent_at && (
                    <span className="text-xs text-gray-600 shrink-0">
                      Sent {formatDate(send.sent_at)}
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 border-t border-gray-800/50">
                    <div className="text-xs text-gray-500 py-2">
                      To: {send.to_email} — {send.contact_name || 'N/A'}
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editSubject}
                          onChange={e => setEditSubject(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
                        />
                        <textarea
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          rows={8}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(send.id)}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingSend(null)}
                            className="px-3 py-1.5 text-gray-400 rounded-lg text-xs font-medium hover:text-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="bg-gray-800/50 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap font-mono">
                          <p className="text-xs text-gray-500 mb-2">Subject: {send.subject}</p>
                          {send.body || 'No content'}
                        </div>
                        {send.status === 'draft' && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => {
                                setEditingSend(send.id);
                                setEditSubject(send.subject || '');
                                setEditBody(send.body || '');
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-800 rounded-lg"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={() => handleApproveSingle(send.id)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-600/10 rounded-lg"
                            >
                              <Check className="w-3 h-3" /> Approve
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800/50 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-gray-500" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-semibold text-gray-200">{value}</p>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

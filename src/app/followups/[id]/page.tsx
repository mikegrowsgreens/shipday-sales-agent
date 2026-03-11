'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Sparkles, Calendar, Phone, Mail, Video, FileText, ExternalLink, Archive, PhoneCall, Plus, Inbox, RefreshCw, Link2 } from 'lucide-react';
import CampaignTimeline from '@/components/followups/CampaignTimeline';

interface Deal {
  deal_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  business_name: string | null;
  cuisine_type: string | null;
  pipeline_stage: string | null;
  urgency_level: string | null;
  demo_date: string | null;
  pain_points: unknown;
  interests: unknown;
  objections: unknown;
  pricing_discussed: string | null;
  fathom_summary: string | null;
  action_items: string | null;
  agent_status: string | null;
  engagement_score: number;
  next_touch_due: string | null;
}

interface Draft {
  id: number;
  deal_id: string;
  touch_number: number;
  subject: string | null;
  body_plain: string | null;
  status: string;
  suggested_send_time: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  approved_at: string | null;
  mike_edited: boolean;
}

interface Activity {
  id: number;
  deal_id: string;
  action_type: string;
  touch_number: number | null;
  channel: string | null;
  notes: string | null;
  created_at: string;
}

interface CallNote {
  call_id: string;
  title: string | null;
  call_date: string | null;
  fathom_url: string | null;
  fathom_summary: string | null;
  meeting_summary: string | null;
  action_items: string | null;
  topics_discussed: unknown;
  duration_seconds: number | null;
}

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;

  const [deal, setDeal] = useState<Deal | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [callNotes, setCallNotes] = useState<CallNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [nextCallDate, setNextCallDate] = useState('');
  const [savingCallDate, setSavingCallDate] = useState(false);
  const [emailContext, setEmailContext] = useState<{ email_count: number; context_summary: string; emails: Array<{ from: string; subject: string; date: string; direction: string; body: string }> } | null>(null);
  const [fetchingEmail, setFetchingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [syncingCalls, setSyncingCalls] = useState(false);

  const fetchDeal = useCallback(async () => {
    try {
      const res = await fetch(`/api/followups/deals/${dealId}`);
      const data = await res.json();
      setDeal(data.deal || null);
      setDrafts(data.drafts || []);
      setActivity(data.activity || []);
      setCallNotes(data.callNotes || []);
      if (data.deal?.next_touch_due) {
        setNextCallDate(new Date(data.deal.next_touch_due).toISOString().slice(0, 16));
      }
    } catch (err) {
      console.error('[deal detail] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/followups/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: dealId,
          ...(nextCallDate && { next_call_date: new Date(nextCallDate).toISOString() }),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDrafts(data.drafts || []);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveCallDate = async () => {
    if (!nextCallDate) return;
    setSavingCallDate(true);
    try {
      await fetch(`/api/followups/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ next_touch_due: new Date(nextCallDate).toISOString() }),
      });
      setDeal(prev => prev ? { ...prev, next_touch_due: new Date(nextCallDate).toISOString() } : prev);
    } finally {
      setSavingCallDate(false);
    }
  };

  const handleFetchEmailContext = async () => {
    setFetchingEmail(true);
    setEmailError(null);
    try {
      const res = await fetch('/api/followups/email-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_id: dealId }),
      });
      if (res.ok) {
        const data = await res.json();
        setEmailContext(data);
      } else {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }));
        setEmailError(errData.error || `Error ${res.status}`);
      }
    } catch (err) {
      console.error('[email context] fetch error:', err);
      setEmailError('Network error fetching email context');
    } finally {
      setFetchingEmail(false);
    }
  };

  const handleSyncCalls = async () => {
    setSyncingCalls(true);
    try {
      const res = await fetch('/api/calls/sync', { method: 'POST' });
      if (res.ok) {
        // Refresh the deal to get updated call notes
        await fetchDeal();
      }
    } catch (err) {
      console.error('[sync calls] error:', err);
    } finally {
      setSyncingCalls(false);
    }
  };

  const handleAddTouch = async () => {
    const res = await fetch('/api/followups/add-touch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId }),
    });
    if (res.ok) {
      await fetchDeal();
    }
  };

  const handleSaveDraft = async (id: number, subject: string, body: string) => {
    await fetch(`/api/followups/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body_plain: body }),
    });
    setDrafts(prev => prev.map(d =>
      d.id === id ? { ...d, subject, body_plain: body, mike_edited: true } : d
    ));
  };

  const handleApproveDrafts = async (ids: number[], scheduleMap?: Record<number, string>) => {
    await fetch('/api/followups/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft_ids: ids,
        ...(scheduleMap && { schedule_map: scheduleMap }),
      }),
    });
    setDrafts(prev => prev.map(d =>
      ids.includes(d.id) ? { ...d, status: 'approved' } : d
    ));
  };

  const handleRegenerateDraft = async (id: number) => {
    const res = await fetch('/api/followups/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id: id }),
    });
    if (res.ok) {
      const data = await res.json();
      setDrafts(prev => prev.map(d =>
        d.id === id ? { ...d, subject: data.subject, body_plain: data.body, mike_edited: false } : d
      ));
    }
  };

  const handleRescheduleDraft = async (id: number, scheduledAt: string) => {
    await fetch(`/api/followups/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });
    setDrafts(prev => prev.map(d =>
      d.id === id ? { ...d, scheduled_at: scheduledAt } : d
    ));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="p-6">
        <p className="text-red-400">Deal not found</p>
      </div>
    );
  }

  const painPoints = Array.isArray(deal.pain_points) ? (deal.pain_points as string[]) : [];
  const interests = Array.isArray(deal.interests) ? (deal.interests as string[]) : [];
  const objections = Array.isArray(deal.objections) ? (deal.objections as string[]) : [];

  const formatDuration = (secs: number | null) => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    return `${m}m`;
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              await fetch(`/api/followups/deals/${dealId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_status: 'archived' }),
              });
              router.push('/followups');
            }}
            className="flex items-center gap-1.5 text-gray-400 hover:text-red-400 text-sm px-3 py-2 rounded-lg border border-gray-700 hover:border-red-800 transition-colors"
          >
            <Archive className="w-4 h-4" /> Archive
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {drafts.length > 0 ? 'Regenerate Campaign' : 'Generate Campaign'}
          </button>
        </div>
      </div>

      {/* Deal context */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">{deal.business_name || 'Unknown Business'}</h1>
            <div className="flex items-center gap-4 mt-1">
              {deal.contact_name && (
                <span className="text-sm text-gray-400">{deal.contact_name}</span>
              )}
              {deal.contact_email && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Mail className="w-3 h-3" /> {deal.contact_email}
                </span>
              )}
              {deal.contact_phone && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Phone className="w-3 h-3" /> {deal.contact_phone}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            {deal.pipeline_stage && (
              <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full">
                {deal.pipeline_stage.replace(/_/g, ' ')}
              </span>
            )}
            {deal.demo_date && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                <Calendar className="w-3 h-3" />
                Demo: {new Date(deal.demo_date).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-4">
          {painPoints.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase">Pain Points</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {painPoints.map((pp, i) => (
                  <span key={i} className="text-[10px] bg-red-600/10 text-red-400 px-2 py-0.5 rounded">{pp}</span>
                ))}
              </div>
            </div>
          )}
          {interests.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase">Interests</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {interests.map((int, i) => (
                  <span key={i} className="text-[10px] bg-green-600/10 text-green-400 px-2 py-0.5 rounded">{int}</span>
                ))}
              </div>
            </div>
          )}
          {objections.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase">Objections</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {objections.map((obj, i) => (
                  <span key={i} className="text-[10px] bg-yellow-600/10 text-yellow-400 px-2 py-0.5 rounded">{obj}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Demo summary */}
        {deal.fathom_summary && (
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Demo Summary</span>
            <p className="text-xs text-gray-400 mt-1">{deal.fathom_summary}</p>
          </div>
        )}

        {deal.action_items && (
          <div>
            <span className="text-[10px] text-gray-500 uppercase">Action Items</span>
            <p className="text-xs text-gray-400 mt-1 whitespace-pre-line">{deal.action_items}</p>
          </div>
        )}
      </div>

      {/* Email Thread View */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-blue-400" />
            Email Thread
            {emailContext && (
              <span className="text-[10px] text-gray-500 font-normal">
                {emailContext.email_count} email{emailContext.email_count !== 1 ? 's' : ''} found
              </span>
            )}
          </h2>
          <button
            onClick={handleFetchEmailContext}
            disabled={fetchingEmail}
            className="flex items-center gap-1.5 text-xs bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 disabled:opacity-50 text-blue-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            {fetchingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
            {emailContext ? 'Refresh' : 'Pull from Gmail'}
          </button>
        </div>

        {!emailContext && !fetchingEmail && !emailError && (
          <p className="text-[10px] text-gray-600">
            Pull your email history with this contact to give the AI better context when generating campaigns.
          </p>
        )}

        {emailError && (
          <p className="text-xs text-red-400 py-1">{emailError}</p>
        )}

        {fetchingEmail && (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-xs text-gray-400">Searching Gmail for {deal.contact_email}...</span>
          </div>
        )}

        {emailContext && emailContext.emails.length > 0 && (
          <div className="space-y-0 max-h-[500px] overflow-y-auto">
            {emailContext.emails.map((email, i) => {
              const isSent = email.direction === 'sent';
              return (
                <div key={i} className="relative">
                  {/* Connector line */}
                  {i > 0 && <div className="absolute left-5 -top-1 w-px h-2 bg-gray-800" />}

                  <div className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-gray-800/30' : ''}`}>
                    {/* Avatar/direction indicator */}
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium ${
                      isSent
                        ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                        : 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                    }`}>
                      {isSent ? 'MP' : (deal.contact_name?.charAt(0)?.toUpperCase() || '?')}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-gray-200">
                          {isSent ? 'Mike Paulus' : (deal.contact_name || email.from || 'Contact')}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          isSent ? 'bg-green-600/10 text-green-400' : 'bg-blue-600/10 text-blue-400'
                        }`}>
                          {isSent ? 'SENT' : 'RECEIVED'}
                        </span>
                        <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">
                          {email.date ? new Date(email.date).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                          }) : ''}
                        </span>
                      </div>

                      {/* Subject */}
                      <p className="text-xs text-gray-300 font-medium mb-1">{email.subject || '(no subject)'}</p>

                      {/* Body preview */}
                      <p className="text-[11px] text-gray-500 whitespace-pre-line leading-relaxed line-clamp-6">
                        {email.body?.substring(0, 500) || ''}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {emailContext && emailContext.emails.length === 0 && (
          <p className="text-xs text-gray-500 py-2">No emails found with {deal.contact_email}</p>
        )}

        {emailContext && emailContext.context_summary && (
          <div className="bg-blue-600/5 border border-blue-600/20 rounded-lg p-3 mt-2">
            <span className="text-[10px] text-blue-400 uppercase font-medium">AI Summary</span>
            <p className="text-xs text-gray-400 mt-1">{emailContext.context_summary}</p>
          </div>
        )}
      </div>

      {/* Call Notes / Demo Recording */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Video className="w-4 h-4 text-purple-400" />
            Call Notes
            {callNotes.length > 0 && (
              <span className="text-[10px] text-gray-500 font-normal">{callNotes.length} call{callNotes.length !== 1 ? 's' : ''}</span>
            )}
          </h2>
          <button
            onClick={handleSyncCalls}
            disabled={syncingCalls}
            className="flex items-center gap-1.5 text-xs bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 disabled:opacity-50 text-purple-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            {syncingCalls ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {syncingCalls ? 'Syncing Fathom...' : 'Sync from Fathom'}
          </button>
          </div>
      {callNotes.length > 0 ? (
        <>
          {callNotes.map(call => (
            <div key={call.call_id} className="border-t border-gray-800/50 first:border-0 pt-3 first:pt-0 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-200">{call.title || 'Untitled Call'}</span>
                  {call.duration_seconds && (
                    <span className="text-[10px] text-gray-500">{formatDuration(call.duration_seconds)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {call.call_date && (
                    <span className="text-[10px] text-gray-500">
                      {new Date(call.call_date).toLocaleDateString()}
                    </span>
                  )}
                  {call.fathom_url && (
                    <a
                      href={call.fathom_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300"
                    >
                      <ExternalLink className="w-3 h-3" /> Fathom
                    </a>
                  )}
                </div>
              </div>
              {call.meeting_summary && (
                <div>
                  <span className="text-[10px] text-gray-500 uppercase">Meeting Summary</span>
                  <p className="text-xs text-gray-400 mt-0.5">{call.meeting_summary}</p>
                </div>
              )}
              {call.fathom_summary && (
                <div>
                  <span className="text-[10px] text-gray-500 uppercase">Fathom Summary</span>
                  <p className="text-xs text-gray-400 mt-0.5">{call.fathom_summary}</p>
                </div>
              )}
              {call.action_items && (
                <div>
                  <span className="text-[10px] text-gray-500 uppercase">Action Items</span>
                  <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{call.action_items}</p>
                </div>
              )}
              {Array.isArray(call.topics_discussed) && (call.topics_discussed as string[]).length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {(call.topics_discussed as string[]).map((topic: string, i: number) => (
                    <span key={i} className="text-[10px] bg-purple-600/10 text-purple-400 px-2 py-0.5 rounded">{topic}</span>
                  ))}
                </div>
              ) : null}
              {!call.meeting_summary && !call.fathom_summary && !call.action_items && (
                <p className="text-[10px] text-gray-600 italic">
                  <FileText className="w-3 h-3 inline mr-1" />
                  Call recorded — summary not yet available.
                  {call.fathom_url && ' View recording in Fathom for details.'}
                </p>
              )}
            </div>
          ))}
        </>
      ) : (
          <p className="text-xs text-gray-500 py-2">No call notes found. Click &quot;Sync from Fathom&quot; to pull recent calls.</p>
      )}
        </div>

      {/* Next Follow-Up Call */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-green-400" />
            <span className="text-xs font-semibold text-gray-300">Next Follow-Up Call</span>
            {nextCallDate && (
              <span className="text-[10px] text-gray-500">
                — Campaign will adapt to this date
              </span>
            )}
          </div>
          <a
            href={`${process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/mike-paulus-shipday/30min'}?name=${encodeURIComponent(deal.contact_name || '')}&email=${encodeURIComponent(deal.contact_email || '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 text-blue-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            <Link2 className="w-3 h-3" />
            Book via Calendly
          </a>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <input
            type="datetime-local"
            value={nextCallDate}
            onChange={(e) => setNextCallDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
          />
          <button
            onClick={handleSaveCallDate}
            disabled={savingCallDate || !nextCallDate}
            className="flex items-center gap-1.5 bg-green-600/20 hover:bg-green-600/30 border border-green-600/30 disabled:opacity-30 text-green-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            {savingCallDate ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calendar className="w-3 h-3" />}
            Save
          </button>
          {nextCallDate && (
            <span className="text-xs text-gray-500">
              {(() => {
                const days = Math.ceil((new Date(nextCallDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return days > 0 ? `${days} day${days === 1 ? '' : 's'} from now` : days === 0 ? 'Today' : 'Past';
              })()}
            </span>
          )}
        </div>
        {nextCallDate && !drafts.length && (
          <p className="text-[10px] text-gray-600 mt-2">
            Set the call date, then Generate Campaign — touches will be intelligently spaced around this call.
          </p>
        )}
      </div>

      {/* Campaign Timeline */}
      {drafts.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">Follow-Up Campaign ({drafts.length} touches)</h2>
            <button
              onClick={handleAddTouch}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Touch
            </button>
          </div>
          <CampaignTimeline
            drafts={drafts}
            onSaveDraft={handleSaveDraft}
            onApproveDraft={handleApproveDrafts}
            onRescheduleDraft={handleRescheduleDraft}
            onRegenerateDraft={handleRegenerateDraft}
          />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500 mb-3">No campaign generated yet</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Campaign
          </button>
        </div>
      )}

      {/* Activity Log */}
      {activity.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Activity</h2>
          <div className="space-y-2">
            {activity.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-xs">
                <span className="text-gray-500 w-28 flex-shrink-0">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
                <span className="text-gray-300">{a.action_type?.replace(/_/g, ' ') || 'activity'}</span>
                {a.touch_number && (
                  <span className="text-blue-400">Touch {a.touch_number}</span>
                )}
                {a.notes && (
                  <span className="text-gray-600 truncate">{a.notes}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

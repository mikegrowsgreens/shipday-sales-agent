'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bot, Mail, BarChart3, Loader2, Users, Search, Building2, MapPin, Star, Activity, Eye, MousePointerClick, MessageSquare, Send, ShieldAlert, Globe, Layers, Zap, Rocket, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Pencil, Check, X, AlertTriangle, Copy, Calendar, BookTemplate } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import CampaignCard from '@/components/outbound/CampaignCard';
import CampaignFilters from '@/components/outbound/CampaignFilters';
import BdrOverview from '@/components/outbound/BdrOverview';
import AiChatPanel from '@/components/ui/AiChatPanel';
import DateRangeSelector from '@/components/ui/DateRangeSelector';
import SendTimePreferences, { getDefaultTiming, computeSendAt } from '@/components/ui/SendTimePreferences';
import type { SendTiming } from '@/components/ui/SendTimePreferences';
import ScraperPanel from '@/components/outbound/ScraperPanel';
import TierCampaignEditor from '@/components/outbound/TierCampaignEditor';
import SendTimeInsights from '@/components/outbound/SendTimeInsights';
import LeadDetailDrawer from '@/components/outbound/LeadDetailDrawer';
import CampaignDashboard from '@/components/outbound/CampaignDashboard';
import SendCalendar from '@/components/outbound/SendCalendar';
import TemplateLibrary from '@/components/outbound/TemplateLibrary';
import type { BdrLead } from '@/lib/types';

type Tab = 'queue' | 'tiers' | 'leads' | 'tracker' | 'activity' | 'overview' | 'calendar' | 'templates' | 'scraper';

interface ActivitySend {
  id: string;
  lead_id: number;
  subject: string;
  angle: string;
  sent_at: string;
  open_count: number;
  replied: boolean;
  reply_at: string | null;
  business_name: string;
  contact_email: string;
}

interface LeadSend {
  id: string;
  subject: string;
  angle: string;
  variant_id?: string | null;
  sent_at: string;
  open_count: number;
  first_open_at?: string | null;
  click_count?: number;
  replied: boolean;
  reply_at: string | null;
  reply_sentiment?: string | null;
}

interface LeadRow {
  lead_id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  city: string | null;
  state: string | null;
  cuisine_type: string | null;
  status: string;
  tier: string | null;
  total_score: number | null;
  google_rating: number | null;
  google_review_count: number | null;
  created_at: string;
  send_count: number;
  last_sent_at: string | null;
  total_opens: number;
  has_reply: boolean;
  last_reply_at: string | null;
  email_angle: string | null;
}

interface StatusCount {
  status: string;
  count: number;
}

interface TierCount {
  tier: string;
  count: number;
}

const statusColors: Record<string, string> = {
  pending_enrichment: 'bg-gray-600',
  new: 'bg-blue-600',
  scored: 'bg-cyan-600',
  email_ready: 'bg-yellow-600',
  sent: 'bg-purple-600',
  replied: 'bg-green-600',
  demo_booked: 'bg-emerald-600',
  sequence_complete: 'bg-blue-500',
  bounced: 'bg-red-400',
  dedup_skipped: 'bg-gray-500',
  opted_out: 'bg-red-500',
  wrong_contact: 'bg-red-600',
};

export default function OutboundPage() {
  const [tab, setTab] = useState<Tab>('queue');
  const [chatOpen, setChatOpen] = useState(false);
  const { addToast, updateToast, removeToast } = useToast();

  // Queue state
  const [leads, setLeads] = useState<BdrLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [status, setStatus] = useState('email_ready');
  const [angle, setAngle] = useState('');
  const [tier, setTier] = useState('');
  const [search, setSearch] = useState('');

  // Send timing
  const [sendTiming, setSendTiming] = useState<SendTiming>(getDefaultTiming());

  // Activity state
  const [sends, setSends] = useState<ActivitySend[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityRange, setActivityRange] = useState('30d');

  // Leads tab state
  const [leadRows, setLeadRows] = useState<LeadRow[]>([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsFiltered, setLeadsFiltered] = useState(0);
  const [statusDist, setStatusDist] = useState<StatusCount[]>([]);
  const [tierDist, setTierDist] = useState<TierCount[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsFilter, setLeadsFilter] = useState('');
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsSortBy, setLeadsSortBy] = useState('created_at');
  const [leadsSortOrder, setLeadsSortOrder] = useState<'asc' | 'desc'>('desc');
  const [leadsPage, setLeadsPage] = useState(0);
  const leadsPerPage = 50;

  // Lead detail drawer
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  // Inline editing
  const [editingLead, setEditingLead] = useState<string | null>(null);
  const [editField, setEditField] = useState<string>('');
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Tracker tab state
  const [trackerData, setTrackerData] = useState<Record<string, unknown> | null>(null);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [trackerRange, setTrackerRange] = useState('30d');
  const [trackerFrom, setTrackerFrom] = useState('');
  const [trackerTo, setTrackerTo] = useState('');

  // Send history per lead
  const [leadSends, setLeadSends] = useState<Record<string, LeadSend[]>>({});

  // Bulk operation states
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkRegenerating, setBulkRegenerating] = useState(false);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [bulkEnrolling, setBulkEnrolling] = useState(false);
  const [enrollTier, setEnrollTier] = useState<string>('all');
  const [enrichBatch, setEnrichBatch] = useState<number>(25);

  // Enrichment progress tracking
  interface EnrichProgressLead { lead_id: string; business_name: string | null; status: string; tier: string | null; total_score: number | null; }
  const [enrichProgress, setEnrichProgress] = useState<{
    active: boolean;
    total: number;
    counts: Record<string, number>;
    leads: EnrichProgressLead[];
    startedAt: number;
  } | null>(null);
  const [enrichPollRef] = useState<{ current: ReturnType<typeof setInterval> | null }>({ current: null });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      if (angle) params.set('angle', angle);
      if (tier) params.set('tier', tier);
      if (search) params.set('search', search);

      const res = await fetch(`/api/bdr/campaigns?${params}`);
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.total || 0);
      setSelectedIds(new Set());

      // Fetch send history for these leads
      const leadIds = (data.leads || []).map((l: BdrLead) => l.lead_id);
      if (leadIds.length > 0) {
        try {
          const sendsRes = await fetch('/api/bdr/campaigns/sends', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_ids: leadIds }),
          });
          if (sendsRes.ok) {
            const sendsData = await sendsRes.json();
            setLeadSends(sendsData.sends || {});
          }
        } catch { /* non-critical */ }
      }
    } catch (err) {
      console.error('[outbound] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [status, angle, tier, search]);


  const fetchLeadRows = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const params = new URLSearchParams();
      if (leadsFilter) params.set('status', leadsFilter);
      if (leadsSearch) params.set('search', leadsSearch);
      params.set('limit', String(leadsPerPage));
      params.set('offset', String(leadsPage * leadsPerPage));
      params.set('sort_by', leadsSortBy);
      params.set('sort_order', leadsSortOrder);

      const res = await fetch(`/api/bdr/leads?${params}`);
      const data = await res.json();
      setLeadRows(data.leads || []);
      setLeadsTotal(data.total || 0);
      setLeadsFiltered(data.filteredTotal || data.total || 0);
      setStatusDist(data.statusDist || []);
      setTierDist(data.tierDist || []);
    } catch (err) {
      console.error('[outbound leads] fetch error:', err);
    } finally {
      setLeadsLoading(false);
    }
  }, [leadsFilter, leadsSearch, leadsSortBy, leadsSortOrder, leadsPage]);

  // Reset page on filter/search change
  useEffect(() => { setLeadsPage(0); }, [leadsFilter, leadsSearch]);

  // Inline edit save handler
  const handleInlineEdit = async (leadId: string, field: string, value: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/bdr/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, [field]: value }),
      });
      if (res.ok) {
        setLeadRows(prev => prev.map(l =>
          l.lead_id === leadId ? { ...l, [field]: value } : l
        ));
      }
    } catch (err) {
      console.error('[leads] inline edit error:', err);
    } finally {
      setSaving(false);
      setEditingLead(null);
      setEditField('');
    }
  };

  // Sort toggle handler
  const toggleSort = (col: string) => {
    if (leadsSortBy === col) {
      setLeadsSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setLeadsSortBy(col);
      setLeadsSortOrder('desc');
    }
  };

  const fetchTracker = useCallback(async () => {
    setTrackerLoading(true);
    try {
      const params = new URLSearchParams({ range: trackerRange });
      if (trackerFrom) params.set('from', trackerFrom);
      if (trackerTo) params.set('to', trackerTo);
      const res = await fetch(`/api/bdr/tracker?${params}`);
      const data = await res.json();
      setTrackerData(data);
    } catch (err) {
      console.error('[tracker] fetch error:', err);
    } finally {
      setTrackerLoading(false);
    }
  }, [trackerRange, trackerFrom, trackerTo]);

  useEffect(() => {
    if (tab === 'queue') fetchLeads();
  }, [tab, fetchLeads]);


  useEffect(() => {
    if (tab === 'leads') fetchLeadRows();
  }, [tab, fetchLeadRows]);

  useEffect(() => {
    if (tab === 'tracker') fetchTracker();
  }, [tab, fetchTracker]);

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/bdr/activity?range=${activityRange}`);
      const data = await res.json();
      setSends(data.sends || []);
    } catch (err) { console.error(err); }
    finally { setActivityLoading(false); }
  }, [activityRange]);

  useEffect(() => {
    if (tab === 'activity') fetchActivity();
  }, [tab, fetchActivity]);

  const handleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map(l => l.lead_id)));
    }
  };

  const handleAction = async (ids: string[], action: 'approve' | 'reject') => {
    const payload: Record<string, unknown> = { lead_ids: ids, action };

    // Include send timing when approving
    if (action === 'approve') {
      const sendAt = computeSendAt(sendTiming);
      payload.send_at = sendAt;
      payload.deviation_minutes = sendTiming.deviation_minutes;
    }

    await fetch('/api/bdr/campaigns/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    fetchLeads();
  };

  const handleRegenerate = async (leadId: string, regenAngle: string, tone?: string, instructions?: string) => {
    const res = await fetch('/api/bdr/campaigns/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, angle: regenAngle, tone, instructions }),
    });
    if (res.ok) {
      const data = await res.json();
      setLeads(prev => prev.map(l =>
        l.lead_id === leadId
          ? { ...l, email_subject: data.subject, email_body: data.body, email_angle: data.angle }
          : l
      ));
    }
  };

  const handleEdit = async (leadId: string, subject: string, body: string) => {
    const res = await fetch('/api/bdr/campaigns/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, subject, body }),
    });
    if (res.ok) {
      setLeads(prev => prev.map(l =>
        l.lead_id === leadId
          ? { ...l, email_subject: subject, email_body: body }
          : l
      ));
    }
  };


  // Bulk generate campaigns for all enriched/scored leads
  const handleBulkGenerate = async () => {
    const leadIds = leads.map(l => l.lead_id);
    if (leadIds.length === 0) return;
    setBulkGenerating(true);
    try {
      const res = await fetch('/api/bdr/campaigns/generate-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: leadIds }),
      });
      if (res.ok) {
        // Switch to email_ready view to see generated emails
        setStatus('email_ready');
      }
    } catch (err) {
      console.error('[outbound] bulk generate error:', err);
    } finally {
      setBulkGenerating(false);
    }
  };

  // Bulk regenerate emails for all visible leads
  const handleBulkRegenerate = async () => {
    const leadIds = leads.map(l => l.lead_id);
    if (leadIds.length === 0) return;
    setBulkRegenerating(true);
    try {
      const res = await fetch('/api/bdr/campaigns/bulk-regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: leadIds }),
      });
      if (res.ok) {
        fetchLeads(); // Refresh to show new emails
      }
    } catch (err) {
      console.error('[outbound] bulk regenerate error:', err);
    } finally {
      setBulkRegenerating(false);
    }
  };

  // Bulk enrich new/pending leads in batches
  const handleBulkEnrich = async () => {
    setBulkEnriching(true);
    addToast(`Starting enrichment for ${enrichBatch} leads...`, 'info');
    try {
      const res = await fetch('/api/bdr/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: enrichBatch }),
      });
      if (!res.ok) {
        addToast('Enrichment failed — check logs', 'error');
        setBulkEnriching(false);
        return;
      }
      const data = await res.json();
      const trackedIds: number[] = data.lead_ids || [];
      const total = data.enriched || trackedIds.length;

      if (!trackedIds.length) {
        addToast('No leads to enrich', 'info');
        setBulkEnriching(false);
        return;
      }

      // Initialize progress panel
      setEnrichProgress({ active: true, total, counts: { enriching: total }, leads: [], startedAt: Date.now() });

      // Immediate first poll
      const pollOnce = async () => {
        try {
          const pRes = await fetch('/api/bdr/enrich/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_ids: trackedIds }),
          });
          if (!pRes.ok) return false;
          const progress = await pRes.json();
          const counts = progress.counts || {};
          const leads = progress.leads || [];
          const enriching = counts.enriching || 0;
          const done = (counts.scored || 0) + (counts.enriched || 0);

          setEnrichProgress(prev => prev ? { ...prev, counts, leads } : null);

          if (enriching === 0 && (counts.new || 0) === 0 && (counts.pending_enrichment || 0) === 0) {
            // All done
            setEnrichProgress(prev => prev ? { ...prev, active: false, counts, leads } : null);
            setBulkEnriching(false);
            addToast(`Enriched ${total} leads — ${counts.scored || 0} scored, ${counts.enriched || 0} enriched`, 'success');
            fetchLeadRows();
            return true; // signal done
          }
          return false;
        } catch { return false; }
      };

      // First poll immediately
      const isDone = await pollOnce();
      if (!isDone) {
        // Continue polling every 8s
        if (enrichPollRef.current) clearInterval(enrichPollRef.current);
        enrichPollRef.current = setInterval(async () => {
          const finished = await pollOnce();
          if (finished && enrichPollRef.current) {
            clearInterval(enrichPollRef.current);
            enrichPollRef.current = null;
          }
        }, 8000);

        // Safety timeout: stop after 15 min
        setTimeout(() => {
          if (enrichPollRef.current) {
            clearInterval(enrichPollRef.current);
            enrichPollRef.current = null;
          }
          setEnrichProgress(prev => prev ? { ...prev, active: false } : null);
          setBulkEnriching(false);
          fetchLeadRows();
        }, 900000);
      }
    } catch (err) {
      console.error('[outbound] bulk enrich error:', err);
      addToast('Enrichment failed — network error', 'error');
      setBulkEnriching(false);
    }
  };

  // Enroll enriched/scored leads into outreach campaigns (optionally filtered by tier)
  const handleEnrollAllEnriched = async () => {
    setBulkEnrolling(true);
    const tierLabel = enrollTier === 'all' ? '' : ` ${enrollTier.replace('_', ' ')}`;
    const toastId = addToast(`Enrolling${tierLabel} leads into campaigns...`, 'loading');
    try {
      // Fetch enriched + scored lead IDs, with optional tier filter
      const tierParam = enrollTier !== 'all' ? `&tier=${enrollTier}` : '';
      const [enrichedRes, scoredRes] = await Promise.all([
        fetch(`/api/bdr/leads?status=enriched&limit=500${tierParam}`),
        fetch(`/api/bdr/leads?status=scored&limit=500${tierParam}`),
      ]);
      const enrichedData = await enrichedRes.json();
      const scoredData = await scoredRes.json();
      const allLeads = [...(enrichedData.leads || []), ...(scoredData.leads || [])];
      const leadIds = allLeads.map((l: { lead_id: number }) => l.lead_id);

      if (leadIds.length === 0) {
        updateToast(toastId, `No${tierLabel} enriched/scored leads to enroll`, 'info');
        return;
      }

      updateToast(toastId, `Generating campaigns for ${leadIds.length}${tierLabel} leads...`, 'loading');

      const res = await fetch('/api/bdr/campaigns/generate-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: leadIds }),
      });
      if (res.ok) {
        const data = await res.json();
        const skipped = data.skipped_contacted || 0;
        const enrolled = data.generated || leadIds.length - skipped;
        let msg = `Enrolled ${enrolled}${tierLabel} leads into campaigns`;
        if (skipped > 0) msg += ` (${skipped} previously contacted skipped)`;
        updateToast(toastId, msg, 'success');
        setStatus('email_ready');
        setTab('queue');
        setTimeout(() => fetchLeadRows(), 2000);
      } else {
        updateToast(toastId, 'Enrollment failed — check logs', 'error');
      }
    } catch (err) {
      console.error('[outbound] enroll all error:', err);
      updateToast(toastId, 'Enrollment failed — network error', 'error');
    } finally {
      setBulkEnrolling(false);
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof Mail }[] = [
    { key: 'queue', label: 'Queue', icon: Mail },
    { key: 'tiers', label: 'By Tier', icon: Layers },
    { key: 'leads', label: 'Leads', icon: Users },
    { key: 'tracker', label: 'Tracker', icon: Activity },
    { key: 'activity', label: 'Activity', icon: Mail },
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'calendar', label: 'Calendar', icon: Calendar },
    { key: 'templates', label: 'Templates', icon: BookTemplate },
    { key: 'scraper', label: 'Scraper', icon: Globe },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Outbound</h1>
          <p className="text-sm text-gray-400 mt-1">BDR cold outreach engine</p>
        </div>
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
            chatOpen ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Bot className="w-4 h-4" />
          AI Assistant
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 pb-px">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              tab === t.key
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Queue Tab */}
      {tab === 'queue' && (
        <div className="space-y-4">
          <CampaignFilters
            status={status}
            angle={angle}
            tier={tier}
            search={search}
            selectedCount={selectedIds.size}
            totalCount={leads.length}
            onStatusChange={setStatus}
            onAngleChange={setAngle}
            onTierChange={setTier}
            onSearchChange={setSearch}
            onSelectAll={handleSelectAll}
            onClearSelection={() => setSelectedIds(new Set())}
            onBulkApprove={() => handleAction(Array.from(selectedIds), 'approve')}
            onBulkReject={() => handleAction(Array.from(selectedIds), 'reject')}
            onBulkGenerate={handleBulkGenerate}
            onBulkRegenerate={handleBulkRegenerate}
            bulkGenerating={bulkGenerating}
            bulkRegenerating={bulkRegenerating}
          />

          {/* Send Timing Preferences */}
          <SendTimePreferences
            value={sendTiming}
            onChange={setSendTiming}
            showDeviation={true}
          />

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-500">No leads found with current filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">{total} leads total</p>
              {leads.map(lead => (
                <CampaignCard
                  key={lead.lead_id}
                  lead={lead}
                  selected={selectedIds.has(lead.lead_id)}
                  onSelect={handleSelect}
                  onAction={handleAction}
                  onRegenerate={handleRegenerate}
                  onEdit={handleEdit}
                  sends={leadSends[lead.lead_id] || []}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* By Tier Tab — Campaign Templates Editor */}
      {tab === 'tiers' && <TierCampaignEditor />}

      {/* Leads Tab */}
      {tab === 'leads' && (
        <div className="space-y-4">
          {/* Status distribution bar */}
          {statusDist.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Lead Pipeline</h3>
                <span className="text-xs text-gray-500">{leadsTotal.toLocaleString()} total leads</span>
              </div>
              <div className="flex gap-0.5 h-6 rounded-lg overflow-hidden">
                {statusDist.map(s => {
                  const pct = leadsTotal > 0 ? (s.count / leadsTotal) * 100 : 0;
                  if (pct < 0.5) return null;
                  return (
                    <div
                      key={s.status}
                      className={`${statusColors[s.status] || 'bg-gray-600'} relative group cursor-pointer hover:opacity-80 transition-opacity`}
                      style={{ width: `${pct}%` }}
                      onClick={() => setLeadsFilter(leadsFilter === s.status ? '' : s.status)}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[9px] font-bold text-white drop-shadow">{s.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {statusDist.map(s => (
                  <button
                    key={s.status}
                    onClick={() => setLeadsFilter(leadsFilter === s.status ? '' : s.status)}
                    className={`flex items-center gap-1.5 text-[10px] transition-colors ${
                      leadsFilter === s.status ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${statusColors[s.status] || 'bg-gray-600'}`} />
                    <span>{s.status.replace(/_/g, ' ')}</span>
                    <span className="text-gray-600">{s.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tier breakdown — donut + cards */}
          {tierDist.length > 0 && (() => {
            const tierTotal = tierDist.reduce((s, t) => s + t.count, 0);
            const tierColorMap: Record<string, { fill: string; text: string }> = {
              tier_1: { fill: '#facc15', text: 'text-yellow-400' },
              tier_2: { fill: '#60a5fa', text: 'text-blue-400' },
              tier_3: { fill: '#9ca3af', text: 'text-gray-400' },
              unscored: { fill: '#4b5563', text: 'text-gray-500' },
            };

            // Build donut segments
            let cumPct = 0;
            const segments = tierDist.map(t => {
              const pct = tierTotal > 0 ? (t.count / tierTotal) * 100 : 0;
              const offset = cumPct;
              cumPct += pct;
              return { tier: t.tier, count: t.count, pct, offset, color: tierColorMap[t.tier]?.fill || '#4b5563' };
            });

            return (
              <div className="flex gap-4 items-center">
                {/* Donut chart */}
                <div className="shrink-0">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    {segments.map(seg => {
                      const r = 48;
                      const circ = 2 * Math.PI * r;
                      const dashLen = (seg.pct / 100) * circ;
                      const dashOff = -(seg.offset / 100) * circ;
                      return (
                        <circle
                          key={seg.tier}
                          cx="60" cy="60" r={r}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="18"
                          strokeDasharray={`${dashLen} ${circ - dashLen}`}
                          strokeDashoffset={dashOff}
                          transform="rotate(-90 60 60)"
                          className="transition-all duration-300"
                        />
                      );
                    })}
                    <text x="60" y="56" textAnchor="middle" className="fill-white text-xl font-bold">{tierTotal}</text>
                    <text x="60" y="72" textAnchor="middle" className="fill-gray-500 text-[10px]">leads</text>
                  </svg>
                </div>
                {/* Tier cards */}
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                  {tierDist.map(t => (
                    <button
                      key={t.tier}
                      onClick={() => setLeadsFilter(leadsFilter === t.tier ? '' : '')}
                      className={`bg-gray-900 border rounded-xl p-3 text-center transition-colors ${
                        leadsFilter === t.tier ? 'border-blue-500' : 'border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className={`text-lg font-bold ${tierColorMap[t.tier]?.text || 'text-white'}`}>
                        {t.count.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase">{t.tier.replace(/_/g, ' ')}</div>
                      <div className="text-[10px] text-gray-600">
                        {tierTotal > 0 ? Math.round((t.count / tierTotal) * 100) : 0}%
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Bulk action bars */}
          {(() => {
            const newCount = statusDist.find(s => s.status === 'new')?.count || 0;
            const pendingCount = statusDist.find(s => s.status === 'pending_enrichment')?.count || 0;
            const enrichableCount = newCount + pendingCount;
            const enrichedCount = statusDist.find(s => s.status === 'enriched')?.count || 0;
            const scoredCount = statusDist.find(s => s.status === 'scored')?.count || 0;
            const enrollableCount = enrichedCount + scoredCount;

            return (
              <div className="space-y-2">
                {/* Enrich bar */}
                {enrichableCount > 0 && (
                  <div className="flex items-center justify-between bg-blue-950/30 border border-blue-800/40 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-400" />
                      <span className="text-xs text-blue-300">
                        <strong>{enrichableCount}</strong> lead{enrichableCount !== 1 ? 's' : ''} ready for enrichment & scoring
                        <span className="text-blue-500/60 ml-1">
                          ({newCount > 0 ? `${newCount} new` : ''}{newCount > 0 && pendingCount > 0 ? ', ' : ''}{pendingCount > 0 ? `${pendingCount} pending` : ''})
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={enrichBatch}
                        onChange={(e) => setEnrichBatch(Number(e.target.value))}
                        className="bg-gray-800 border border-blue-800/40 text-blue-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
                      >
                        <option value={10}>10 leads</option>
                        <option value={25}>25 leads</option>
                        <option value={50}>50 leads</option>
                        <option value={100}>100 leads</option>
                        <option value={250}>250 leads</option>
                        <option value={enrichableCount}>All ({enrichableCount})</option>
                      </select>
                      <button
                        onClick={handleBulkEnrich}
                        disabled={bulkEnriching}
                        className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {bulkEnriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Enrich & Score
                      </button>
                    </div>
                  </div>
                )}

                {/* Enroll bar */}
                {enrollableCount > 0 && (
                  <div className="flex items-center justify-between bg-purple-950/30 border border-purple-800/40 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-4 h-4 text-purple-400" />
                      <span className="text-xs text-purple-300">
                        <strong>{enrollableCount}</strong> lead{enrollableCount !== 1 ? 's' : ''} ready to enroll in campaigns
                        <span className="text-purple-500/60 ml-1">
                          ({enrichedCount > 0 ? `${enrichedCount} enriched` : ''}{enrichedCount > 0 && scoredCount > 0 ? ', ' : ''}{scoredCount > 0 ? `${scoredCount} scored` : ''})
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={enrollTier}
                        onChange={(e) => setEnrollTier(e.target.value)}
                        className="bg-gray-800 border border-purple-800/40 text-purple-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-purple-500"
                      >
                        <option value="all">All Tiers</option>
                        {tierDist.filter(t => t.tier !== 'unscored').map(t => (
                          <option key={t.tier} value={t.tier}>
                            {t.tier.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} ({t.count})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleEnrollAllEnriched}
                        disabled={bulkEnrolling}
                        className="flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {bulkEnrolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                        {enrollTier === 'all' ? 'Enroll All' : `Enroll ${enrollTier.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Enrichment Progress Panel */}
          {enrichProgress && (
            <div className="bg-gray-900 border border-blue-800/30 rounded-xl overflow-hidden">
              {/* Header with progress bar */}
              <div className="px-4 py-3 border-b border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {enrichProgress.active ? (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4 text-green-400" />
                    )}
                    <span className="text-sm font-medium text-white">
                      {enrichProgress.active ? 'Enrichment In Progress' : 'Enrichment Complete'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Status counts */}
                    <div className="flex items-center gap-2 text-[10px]">
                      {(enrichProgress.counts.enriching || 0) > 0 && (
                        <span className="text-blue-400">{enrichProgress.counts.enriching} processing</span>
                      )}
                      {(enrichProgress.counts.enriched || 0) > 0 && (
                        <span className="text-cyan-400">{enrichProgress.counts.enriched} enriched</span>
                      )}
                      {(enrichProgress.counts.scored || 0) > 0 && (
                        <span className="text-green-400">{enrichProgress.counts.scored} scored</span>
                      )}
                    </div>
                    {!enrichProgress.active && (
                      <button
                        onClick={() => setEnrichProgress(null)}
                        className="text-gray-500 hover:text-gray-300 text-xs"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
                {/* Progress bar */}
                {(() => {
                  const done = (enrichProgress.counts.scored || 0) + (enrichProgress.counts.enriched || 0);
                  const pct = enrichProgress.total > 0 ? (done / enrichProgress.total) * 100 : 0;
                  return (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${enrichProgress.active ? 'bg-blue-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.max(pct, enrichProgress.active ? 3 : 0)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums shrink-0">
                        {done}/{enrichProgress.total}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Lead list */}
              {enrichProgress.leads.length > 0 && (
                <div className="max-h-[280px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-900">
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left py-2 px-4 font-medium">Business</th>
                        <th className="text-center py-2 px-3 font-medium">Status</th>
                        <th className="text-center py-2 px-3 font-medium">Tier</th>
                        <th className="text-center py-2 px-3 font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrichProgress.leads.map(lead => (
                        <tr key={lead.lead_id} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                          <td className="py-1.5 px-4">
                            <div className="flex items-center gap-2">
                              {lead.status === 'enriching' && <Loader2 className="w-3 h-3 text-blue-400 animate-spin shrink-0" />}
                              {lead.status === 'enriched' && <Zap className="w-3 h-3 text-cyan-400 shrink-0" />}
                              {lead.status === 'scored' && <Star className="w-3 h-3 text-green-400 shrink-0" />}
                              {!['enriching', 'enriched', 'scored'].includes(lead.status) && <Activity className="w-3 h-3 text-gray-500 shrink-0" />}
                              <span className="text-gray-200 truncate max-w-[200px]">{lead.business_name || `Lead #${lead.lead_id}`}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[lead.status] || 'bg-gray-600'} text-white`}>
                              {lead.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            {lead.tier ? (
                              <span className={`text-[10px] font-medium ${
                                lead.tier === 'tier_1' ? 'text-yellow-400' :
                                lead.tier === 'tier_2' ? 'text-blue-400' : 'text-gray-400'
                              }`}>
                                {lead.tier.replace('_', ' ').toUpperCase()}
                              </span>
                            ) : <span className="text-gray-600">--</span>}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            {lead.total_score ? (
                              <span className="text-yellow-400">{lead.total_score}</span>
                            ) : <span className="text-gray-600">--</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Elapsed time */}
              {enrichProgress.active && (
                <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">
                  Polling every 8s — enrichment runs in background via n8n
                </div>
              )}
            </div>
          )}

          {/* Search + tier filter row */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                value={leadsSearch}
                onChange={(e) => setLeadsSearch(e.target.value)}
                placeholder="Search leads by name, email, or city..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            {/* Quick tier filters */}
            <div className="flex items-center gap-1">
              {['tier_1', 'tier_2', 'tier_3'].map(t => (
                <button
                  key={t}
                  onClick={() => setLeadsFilter(leadsFilter === t ? '' : t)}
                  className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors ${
                    leadsFilter === t
                      ? t === 'tier_1' ? 'border-yellow-400/50 bg-yellow-400/10 text-yellow-400'
                        : t === 'tier_2' ? 'border-blue-400/50 bg-blue-400/10 text-blue-400'
                        : 'border-gray-400/50 bg-gray-400/10 text-gray-400'
                      : 'border-gray-700 text-gray-500 hover:border-gray-600'
                  }`}
                >
                  {t.replace('_', ' ').toUpperCase()}
                </button>
              ))}
              {leadsFilter && (
                <button
                  onClick={() => setLeadsFilter('')}
                  className="text-[10px] text-gray-500 hover:text-gray-300 px-1"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Lead table */}
          {leadsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : leadRows.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-500">No leads found</p>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    {[
                      { key: 'business_name', label: 'Business', align: 'text-left' },
                      { key: 'contact_name', label: 'Contact', align: 'text-left' },
                      { key: 'city', label: 'Location', align: 'text-left' },
                      { key: 'status', label: 'Status', align: 'text-left' },
                      { key: 'tier', label: 'Tier', align: 'text-center' },
                      { key: 'total_score', label: 'Score', align: 'text-center' },
                      { key: 'send_count', label: 'Emails', align: 'text-center' },
                      { key: 'total_opens', label: 'Engagement', align: 'text-center' },
                    ].map(col => (
                      <th
                        key={col.key}
                        className={`${col.align} py-2.5 px-3 font-medium cursor-pointer hover:text-gray-300 transition-colors select-none`}
                        onClick={() => toggleSort(col.key)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {leadsSortBy === col.key && (
                            leadsSortOrder === 'asc'
                              ? <ChevronUp className="w-3 h-3 text-blue-400" />
                              : <ChevronDown className="w-3 h-3 text-blue-400" />
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="py-2.5 px-2 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {leadRows.map(lead => {
                    const contacted = lead.send_count > 0;
                    const isEditing = editingLead === lead.lead_id;
                    return (
                    <tr
                      key={lead.lead_id}
                      className={`border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer ${contacted ? 'opacity-80' : ''}`}
                      onClick={() => setDetailLeadId(lead.lead_id)}
                    >
                      <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                        {isEditing && editField === 'business_name' ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleInlineEdit(lead.lead_id, 'business_name', editValue);
                                if (e.key === 'Escape') { setEditingLead(null); setEditField(''); }
                              }}
                              className="bg-gray-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white w-32 focus:outline-none"
                            />
                            <button onClick={() => handleInlineEdit(lead.lead_id, 'business_name', editValue)} className="text-green-400 hover:text-green-300">
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </button>
                            <button onClick={() => { setEditingLead(null); setEditField(''); }} className="text-gray-500 hover:text-gray-300">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/cell">
                            {contacted ? (
                              <span title="Previously contacted">
                                <ShieldAlert className="w-3 h-3 text-orange-400 shrink-0" />
                              </span>
                            ) : (
                              <Building2 className="w-3 h-3 text-gray-600 shrink-0" />
                            )}
                            <span className={`truncate max-w-[160px] ${contacted ? 'text-gray-400' : 'text-gray-200'}`}>
                              {lead.business_name || '--'}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingLead(lead.lead_id); setEditField('business_name'); setEditValue(lead.business_name || ''); }}
                              className="opacity-0 group-hover/cell:opacity-100 text-gray-600 hover:text-gray-400 transition-opacity"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                        {lead.cuisine_type && (
                          <span className="text-[10px] text-gray-600 ml-4">{lead.cuisine_type}</span>
                        )}
                      </td>
                      <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                        {isEditing && editField === 'contact_name' ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleInlineEdit(lead.lead_id, 'contact_name', editValue);
                                if (e.key === 'Escape') { setEditingLead(null); setEditField(''); }
                              }}
                              className="bg-gray-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white w-28 focus:outline-none"
                            />
                            <button onClick={() => handleInlineEdit(lead.lead_id, 'contact_name', editValue)} className="text-green-400">
                              <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => { setEditingLead(null); setEditField(''); }} className="text-gray-500">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="group/cell">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-300">{lead.contact_name || '--'}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingLead(lead.lead_id); setEditField('contact_name'); setEditValue(lead.contact_name || ''); }}
                                className="opacity-0 group-hover/cell:opacity-100 text-gray-600 hover:text-gray-400 transition-opacity"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                            </div>
                            {lead.contact_email && (
                              <div className="text-[10px] text-gray-600 truncate max-w-[160px]">{lead.contact_email}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {lead.city ? (
                          <span className="flex items-center gap-1 text-gray-400">
                            <MapPin className="w-3 h-3" />
                            {lead.city}, {lead.state}
                          </span>
                        ) : (
                          <span className="text-gray-600">--</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[lead.status] || 'bg-gray-600'} text-white`}>
                          {lead.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {lead.tier ? (
                          <span className={`text-[10px] font-medium ${
                            lead.tier === 'tier_1' ? 'text-yellow-400' :
                            lead.tier === 'tier_2' ? 'text-blue-400' : 'text-gray-400'
                          }`}>
                            {lead.tier.replace('_', ' ').toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-gray-600">--</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {lead.total_score ? (
                          <span className="flex items-center justify-center gap-0.5 text-yellow-400">
                            <Star className="w-3 h-3" />
                            {lead.total_score}
                          </span>
                        ) : (
                          <span className="text-gray-600">--</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {lead.send_count > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <Send className="w-3 h-3 text-blue-400" />
                            <span className="text-white font-medium">{lead.send_count}</span>
                          </div>
                        ) : (
                          <span className="text-gray-600">0</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {lead.send_count > 0 ? (
                          <div className="flex items-center justify-center gap-2">
                            {lead.total_opens > 0 && (
                              <span className="flex items-center gap-0.5 text-yellow-400">
                                <Eye className="w-3 h-3" />
                                <span className="text-[10px]">{lead.total_opens}</span>
                              </span>
                            )}
                            {lead.has_reply && (
                              <span className="flex items-center gap-0.5 text-green-400">
                                <MessageSquare className="w-3 h-3" />
                              </span>
                            )}
                            {lead.total_opens === 0 && !lead.has_reply && (
                              <span className="text-gray-600 text-[10px]">none</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-600 text-center block">--</span>
                        )}
                      </td>
                      <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setDetailLeadId(lead.lead_id)}
                          className="text-gray-600 hover:text-blue-400 transition-colors"
                          title="View details"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {leadsFiltered > leadsPerPage && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
                  <span className="text-xs text-gray-500">
                    Showing {leadsPage * leadsPerPage + 1}–{Math.min((leadsPage + 1) * leadsPerPage, leadsFiltered)} of {leadsFiltered.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLeadsPage(p => Math.max(0, p - 1))}
                      disabled={leadsPage === 0}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-3 h-3" /> Prev
                    </button>
                    <span className="text-xs text-gray-500 px-2">
                      {leadsPage + 1} / {Math.ceil(leadsFiltered / leadsPerPage)}
                    </span>
                    <button
                      onClick={() => setLeadsPage(p => p + 1)}
                      disabled={(leadsPage + 1) * leadsPerPage >= leadsFiltered}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Next <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lead Detail Drawer */}
          <LeadDetailDrawer leadId={detailLeadId} onClose={() => setDetailLeadId(null)} />
        </div>
      )}

      {/* Tracker Tab */}
      {tab === 'tracker' && (
        <div className="space-y-4">
          {/* Date range selector */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Email Tracking</h2>
            <DateRangeSelector
              value={trackerRange}
              onChange={(range, from, to) => {
                setTrackerRange(range);
                setTrackerFrom(from || '');
                setTrackerTo(to || '');
              }}
            />
          </div>

          {trackerLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : trackerData ? (
            <>
              {/* Summary KPIs */}
              {(() => {
                const s = (trackerData.summary || {}) as Record<string, string>;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                      <Send className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                      <div className="text-xl font-bold text-white">{s.total_sent || '0'}</div>
                      <div className="text-[10px] text-gray-500 uppercase">Sent</div>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                      <Eye className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                      <div className="text-xl font-bold text-white">{s.total_opened || '0'}</div>
                      <div className="text-[10px] text-gray-500 uppercase">Opened ({s.open_rate || '0'}%)</div>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                      <MousePointerClick className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                      <div className="text-xl font-bold text-white">{s.total_clicked || '0'}</div>
                      <div className="text-[10px] text-gray-500 uppercase">Clicked ({s.click_rate || '0'}%)</div>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                      <MessageSquare className="w-4 h-4 text-green-400 mx-auto mb-1" />
                      <div className="text-xl font-bold text-white">{s.total_replied || '0'}</div>
                      <div className="text-[10px] text-gray-500 uppercase">Replied ({s.reply_rate || '0'}%)</div>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                      <Activity className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                      <div className="text-xl font-bold text-white">{s.total_opens || '0'}</div>
                      <div className="text-[10px] text-gray-500 uppercase">Total Opens</div>
                    </div>
                  </div>
                );
              })()}

              {/* Daily trend */}
              {(() => {
                const trend = (trackerData.trend || []) as Array<{ day: string; sent: number; opened: number; replied: number }>;
                if (trend.length === 0) return null;
                const maxSent = Math.max(...trend.map(t => t.sent), 1);
                return (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-gray-400 mb-3">Daily Volume</h3>
                    <div className="flex items-end gap-1 h-32">
                      {trend.map(t => (
                        <div key={t.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                          <div className="w-full flex flex-col justify-end h-24 gap-px">
                            <div
                              className="w-full bg-blue-600 rounded-t"
                              style={{ height: `${(t.sent / maxSent) * 100}%`, minHeight: t.sent > 0 ? '2px' : '0' }}
                            />
                          </div>
                          <span className="text-[8px] text-gray-600 -rotate-45 origin-top-left whitespace-nowrap">
                            {new Date(t.day).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                          </span>
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-gray-300 text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                            {t.sent} sent, {t.opened} opened, {t.replied} replied
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1 text-[10px] text-gray-500">
                        <div className="w-2 h-2 bg-blue-600 rounded" /> Sent
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Angle performance */}
              {(() => {
                const anglePerf = (trackerData.anglePerf || []) as Array<Record<string, string>>;
                const angleLabels: Record<string, string> = {
                  missed_calls: 'Missed Calls', commission_savings: 'Commission',
                  delivery_ops: 'Delivery Ops', tech_consolidation: 'Tech Stack',
                  customer_experience: 'CX',
                };
                if (anglePerf.length === 0) return null;
                return (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-gray-400 mb-3">Angle Performance</h3>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left py-1.5">Angle</th>
                          <th className="text-right py-1.5">Sent</th>
                          <th className="text-right py-1.5">Opens</th>
                          <th className="text-right py-1.5">Clicks</th>
                          <th className="text-right py-1.5">Replies</th>
                          <th className="text-right py-1.5">Open %</th>
                          <th className="text-right py-1.5">Reply %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anglePerf.map(a => (
                          <tr key={a.angle} className="border-t border-gray-800">
                            <td className="py-1.5 text-gray-300">{angleLabels[a.angle] || a.angle}</td>
                            <td className="py-1.5 text-right text-white">{a.sent}</td>
                            <td className="py-1.5 text-right text-yellow-400">{a.opens}</td>
                            <td className="py-1.5 text-right text-cyan-400">{a.clicks}</td>
                            <td className="py-1.5 text-right text-green-400">{a.replies}</td>
                            <td className="py-1.5 text-right text-white">{a.open_rate || '0'}%</td>
                            <td className="py-1.5 text-right text-white">{a.reply_rate || '0'}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* Email activity feed */}
              {(() => {
                const emails = (trackerData.emails || []) as Array<Record<string, unknown>>;
                return (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-gray-400 mb-3">Email Activity ({emails.length})</h3>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {emails.map((email) => (
                        <div key={String(email.id)} className="flex items-center gap-3 p-2 bg-gray-800/30 rounded-lg hover:bg-gray-800/50">
                          {/* Status indicators */}
                          <div className="flex items-center gap-1 shrink-0">
                            <Send className="w-3 h-3 text-blue-400" />
                            {(email.open_count as number) > 0 && (
                              <Eye className="w-3 h-3 text-yellow-400" />
                            )}
                            {(email.click_count as number) > 0 && (
                              <MousePointerClick className="w-3 h-3 text-cyan-400" />
                            )}
                            {Boolean(email.replied) && (
                              <MessageSquare className="w-3 h-3 text-green-400" />
                            )}
                          </div>

                          {/* Email info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white truncate">
                                {String(email.business_name || email.to_email || '--')}
                              </span>
                              {String(email.angle || '') && (
                                <span className="text-[10px] text-gray-600">{String(email.angle || '').replace(/_/g, ' ')}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 truncate">{String(email.subject || '')}</p>
                          </div>

                          {/* Tracking details */}
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-gray-500">
                              {email.sent_at ? new Date(String(email.sent_at)).toLocaleDateString() : '--'}
                            </div>
                            {(email.open_count as number) > 0 && (
                              <div className="text-[10px] text-yellow-400">
                                {String(email.open_count)} open{(email.open_count as number) !== 1 ? 's' : ''}
                              </div>
                            )}
                            {String(email.reply_sentiment || '') && (
                              <div className={`text-[10px] ${
                                String(email.reply_sentiment) === 'positive' ? 'text-green-400' :
                                String(email.reply_sentiment) === 'negative' ? 'text-red-400' : 'text-gray-400'
                              }`}>
                                {String(email.reply_sentiment)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {emails.length === 0 && (
                        <p className="text-gray-500 text-center py-4">No emails sent in this period</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Live events feed */}
              {(() => {
                const events = (trackerData.events || []) as Array<Record<string, unknown>>;
                if (events.length === 0) return null;
                const eventIcons: Record<string, { icon: typeof Eye; color: string }> = {
                  open: { icon: Eye, color: 'text-yellow-400' },
                  click: { icon: MousePointerClick, color: 'text-cyan-400' },
                  reply: { icon: MessageSquare, color: 'text-green-400' },
                  bounce: { icon: Mail, color: 'text-red-400' },
                  unsubscribe: { icon: Mail, color: 'text-red-500' },
                };
                return (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-gray-400 mb-3">Live Events</h3>
                    <div className="space-y-1.5">
                      {events.map(ev => {
                        const config = eventIcons[String(ev.event_type)] || { icon: Activity, color: 'text-gray-400' };
                        const Icon = config.icon;
                        return (
                          <div key={String(ev.event_id)} className="flex items-center gap-2 text-xs">
                            <Icon className={`w-3 h-3 ${config.color} shrink-0`} />
                            <span className="text-gray-300">{String(ev.business_name || ev.to_email || '--')}</span>
                            <span className={`${config.color} font-medium`}>{String(ev.event_type)}</span>
                            <span className="text-gray-600 ml-auto">
                              {ev.event_at ? new Date(String(ev.event_at)).toLocaleString() : '--'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-500">No tracking data available</p>
            </div>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Email Activity</h2>
            <DateRangeSelector
              value={activityRange}
              onChange={(range) => setActivityRange(range)}
            />
          </div>
          {activityLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : sends.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-500">No email activity yet</p>
            </div>
          ) : (
            sends.map(send => (
              <div key={send.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white">{send.business_name}</span>
                  <span className="text-xs text-gray-500">
                    {send.sent_at ? new Date(send.sent_at).toLocaleDateString() : '--'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-2">{send.subject}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500">{send.contact_email}</span>
                  {send.open_count > 0 && (
                    <span className="text-yellow-400">Opened {send.open_count}x</span>
                  )}
                  {send.replied && (
                    <span className="text-green-400">Replied</span>
                  )}
                  {send.angle && (
                    <span className="text-gray-600">{send.angle.replace(/_/g, ' ')}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'overview' && (
        <div className="space-y-6">
          <BdrOverview />
          <CampaignDashboard />
          <SendTimeInsights />
        </div>
      )}

      {tab === 'calendar' && <SendCalendar />}

      {tab === 'templates' && <TemplateLibrary />}

      {tab === 'scraper' && <ScraperPanel />}

      {/* AI Chat Panel */}
      <AiChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        apiEndpoint="/api/bdr/chat"
        title="BDR Assistant"
      />
    </div>
  );
}

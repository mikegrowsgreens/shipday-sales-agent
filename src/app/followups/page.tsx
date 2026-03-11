'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, Archive, CheckSquare, Square, X, SlidersHorizontal, ArrowUpDown, BarChart3, List } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useRouter } from 'next/navigation';
import DealCard from '@/components/followups/DealCard';
import FollowUpAnalytics from '@/components/followups/FollowUpAnalytics';

interface Deal {
  deal_id: string;
  contact_name: string | null;
  contact_email: string | null;
  business_name: string | null;
  cuisine_type: string | null;
  pipeline_stage: string | null;
  urgency_level: string | null;
  demo_date: string | null;
  pain_points: unknown;
  sequence_step: number | null;
  agent_status: string | null;
  draft_count?: number;
  sent_count?: number;
  pending_count?: number;
  approved_count?: number;
  fathom_summary: string | null;
  last_activity_at?: string | null;
  last_activity_type?: string | null;
  touch_summary?: Array<{ touch_number: number; status: string; sent_at: string | null; scheduled_at: string | null }> | null;
  engagement_score?: number;
  next_touch_due?: string | null;
}

export default function FollowUpsPage() {
  const router = useRouter();
  const { addToast, updateToast } = useToast();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [urgency, setUrgency] = useState('');
  const [touchProgress, setTouchProgress] = useState('');
  const [sortBy, setSortBy] = useState('next_touch');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const [tab, setTab] = useState<'deals' | 'analytics'>('deals');

  const activeFilterCount = [stage, status, urgency, touchProgress].filter(Boolean).length;

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stage) params.set('stage', stage);
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (urgency) params.set('urgency', urgency);
      if (touchProgress) params.set('touch_progress', touchProgress);
      if (sortBy) params.set('sort', sortBy);

      const res = await fetch(`/api/followups/deals?${params}`);
      const data = await res.json();
      setDeals(data.deals || []);
    } catch (err) {
      console.error('[followups] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [stage, search, status, urgency, touchProgress, sortBy]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const handleGenerate = async (dealId: string) => {
    const toastId = addToast('Generating campaign...', 'loading');
    const res = await fetch('/api/followups/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId }),
    });
    if (res.ok) {
      updateToast(toastId, 'Campaign generated', 'success');
      fetchDeals();
    } else {
      updateToast(toastId, 'Generation failed', 'error');
    }
  };

  const handleView = (dealId: string) => {
    router.push(`/followups/${dealId}`);
  };

  const handleArchive = async (dealId: string) => {
    await fetch(`/api/followups/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_status: 'archived' }),
    });
    setDeals(prev => prev.filter(d => d.deal_id !== dealId));
    setSelectedIds(prev => { const next = new Set(prev); next.delete(dealId); return next; });
  };

  const handleSelect = (dealId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === deals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(deals.map(d => d.deal_id)));
    }
  };

  const handleBulkArchive = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBulkArchiving(true);
    const toastId = addToast(`Archiving ${ids.length} deal${ids.length !== 1 ? 's' : ''}...`, 'loading');
    try {
      const res = await fetch('/api/followups/deals/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_ids: ids }),
      });
      if (res.ok) {
        const data = await res.json();
        setDeals(prev => prev.filter(d => !ids.includes(d.deal_id)));
        setSelectedIds(new Set());
        updateToast(toastId, `Archived ${data.archived || ids.length} deals`, 'success');
      } else {
        updateToast(toastId, 'Archive failed — check logs', 'error');
      }
    } catch (err) {
      console.error('[followups] bulk archive error:', err);
      updateToast(toastId, 'Archive failed — network error', 'error');
    } finally {
      setBulkArchiving(false);
    }
  };

  const clearFilters = () => {
    setStage('');
    setStatus('');
    setUrgency('');
    setTouchProgress('');
    setSortBy('next_touch');
  };

  // Summary stats
  const noCampaign = deals.filter(d => !Number(d.draft_count)).length;
  const activeCampaigns = deals.filter(d => Number(d.draft_count) > 0 && Number(d.sent_count) < Number(d.draft_count)).length;
  const completedCampaigns = deals.filter(d => Number(d.draft_count) > 0 && Number(d.sent_count) === Number(d.draft_count)).length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Follow-Ups</h1>
          <p className="text-sm text-gray-400 mt-1">Post-demo pipeline and AI-generated follow-up campaigns</p>
        </div>
        <div className="flex items-center gap-3">
          {tab === 'deals' && !loading && deals.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-gray-500 mr-3">
              <span>{noCampaign} no campaign</span>
              <span className="text-blue-400">{activeCampaigns} active</span>
              <span className="text-green-400">{completedCampaigns} complete</span>
            </div>
          )}
          <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setTab('deals')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                tab === 'deals' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Deals
            </button>
            <button
              onClick={() => setTab('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                tab === 'analytics' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Analytics
            </button>
          </div>
        </div>
      </div>

      {tab === 'analytics' && <FollowUpAnalytics />}

      {tab === 'deals' && <>
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deals..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Stages</option>
          <option value="demo_completed">Demo Completed</option>
          <option value="negotiation">Negotiation</option>
          <option value="following_up">Following Up</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>

        {/* Advanced filters toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
            showFilters || activeFilterCount > 0
              ? 'bg-blue-600/20 border-blue-600/40 text-blue-400'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sort */}
        <div className="flex items-center gap-1">
          <ArrowUpDown className="w-3 h-3 text-gray-500" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="next_touch">Next Touch Due</option>
            <option value="last_activity">Last Activity</option>
            <option value="business_name">Business Name</option>
            <option value="engagement">Engagement Score</option>
          </select>
        </div>
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-wrap items-center gap-3">
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Urgency</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={touchProgress}
            onChange={(e) => setTouchProgress(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Progress</option>
            <option value="none">No Campaign</option>
            <option value="started">Started (&lt;50% sent)</option>
            <option value="halfway">Halfway (50%+ sent)</option>
            <option value="complete">All Sent</option>
          </select>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {deals.length > 0 && !loading && (
        <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            {selectedIds.size === deals.length ? (
              <CheckSquare className="w-4 h-4 text-blue-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {selectedIds.size === deals.length ? 'Deselect All' : 'Select All'}
          </button>

          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-gray-500">
                {selectedIds.size} of {deals.length} selected
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleBulkArchive(Array.from(selectedIds))}
                disabled={bulkArchiving}
                className="flex items-center gap-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs px-3 py-1.5 rounded-lg transition-colors ml-auto"
              >
                {bulkArchiving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                Archive Selected ({selectedIds.size})
              </button>
            </>
          )}

          {selectedIds.size === 0 && (
            <button
              onClick={() => handleBulkArchive(deals.map(d => d.deal_id))}
              disabled={bulkArchiving}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-red-600/20 text-gray-400 hover:text-red-400 text-xs px-3 py-1.5 rounded-lg transition-colors ml-auto"
            >
              {bulkArchiving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
              Archive All ({deals.length})
            </button>
          )}
        </div>
      )}

      {/* Deal list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : deals.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500">No deals found</p>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-blue-400 hover:text-blue-300 mt-2">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{deals.length} deals</p>
          {deals.map(deal => (
            <DealCard
              key={deal.deal_id}
              deal={deal}
              onGenerate={handleGenerate}
              onView={handleView}
              onArchive={handleArchive}
              selected={selectedIds.has(deal.deal_id)}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
      </>}
    </div>
  );
}

'use client';

import { Search, CheckSquare, X, Zap, RefreshCw } from 'lucide-react';

interface CampaignFiltersProps {
  status: string;
  angle: string;
  tier: string;
  search: string;
  selectedCount: number;
  totalCount: number;
  onStatusChange: (status: string) => void;
  onAngleChange: (angle: string) => void;
  onTierChange: (tier: string) => void;
  onSearchChange: (search: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onBulkGenerate?: () => void;
  onBulkRegenerate?: () => void;
  bulkGenerating?: boolean;
  bulkRegenerating?: boolean;
}

export default function CampaignFilters({
  status, angle, tier, search,
  selectedCount, totalCount,
  onStatusChange, onAngleChange, onTierChange, onSearchChange,
  onSelectAll, onClearSelection, onBulkApprove, onBulkReject,
  onBulkGenerate, onBulkRegenerate,
  bulkGenerating, bulkRegenerating,
}: CampaignFiltersProps) {
  // Show "Generate Campaigns" when viewing enriched/scored leads
  const showGenerateAll = ['enriched', 'scored'].includes(status) && totalCount > 0;
  // Show "Regenerate All" on any status with leads (not just email_ready)
  const showRegenAll = totalCount > 0 && !['enriched', 'scored'].includes(status);

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="email_ready">Email Ready</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="replied">Replied</option>
          <option value="rejected">Rejected</option>
          <option value="hold">On Hold</option>
          <option value="scored">Scored</option>
          <option value="enriched">Enriched</option>
        </select>

        <select
          value={angle}
          onChange={(e) => onAngleChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Angles</option>
          <option value="missed_calls">Missed Calls</option>
          <option value="commission_savings">Commission Savings</option>
          <option value="delivery_ops">Delivery Ops</option>
          <option value="tech_consolidation">Tech Stack</option>
          <option value="customer_experience">Customer Experience</option>
        </select>

        <select
          value={tier}
          onChange={(e) => onTierChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Tiers</option>
          <option value="tier_1">Tier 1</option>
          <option value="tier_2">Tier 2</option>
          <option value="tier_3">Tier 3</option>
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search leads..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Bulk actions row */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onSelectAll}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <CheckSquare className="w-3.5 h-3.5" />
          Select all
        </button>

        {selectedCount > 0 && (
          <>
            <span className="text-xs text-gray-500">{selectedCount} of {totalCount} selected</span>
            <button
              onClick={onClearSelection}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
            >
              <X className="w-3 h-3" /> Clear
            </button>
            <div className="h-4 w-px bg-gray-700" />
            <button
              onClick={onBulkApprove}
              className="bg-green-600/20 hover:bg-green-600/40 text-green-400 text-xs px-3 py-1 rounded-lg transition-colors"
            >
              Approve Selected
            </button>
            <button
              onClick={onBulkReject}
              className="bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs px-3 py-1 rounded-lg transition-colors"
            >
              Reject Selected
            </button>
          </>
        )}

        {/* Bulk generate campaigns for enriched/scored leads */}
        {showGenerateAll && onBulkGenerate && (
          <>
            <div className="h-4 w-px bg-gray-700" />
            <button
              onClick={onBulkGenerate}
              disabled={bulkGenerating}
              className="flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 text-xs px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              <Zap className="w-3 h-3" />
              {bulkGenerating ? `Generating ${totalCount}...` : `Generate All Campaigns (${totalCount})`}
            </button>
          </>
        )}

        {/* Bulk regenerate emails for email_ready leads */}
        {showRegenAll && onBulkRegenerate && (
          <>
            <div className="h-4 w-px bg-gray-700" />
            <button
              onClick={onBulkRegenerate}
              disabled={bulkRegenerating}
              className="flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              {bulkRegenerating ? `Regenerating...` : `Regenerate All (${totalCount})`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

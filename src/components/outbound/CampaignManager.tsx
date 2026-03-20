'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Archive, Copy, Pencil, ChevronDown, ChevronUp,
  Search, Filter, MoreHorizontal, CheckCircle2, AlertCircle,
  Users, Zap, Eye, Trash2, RotateCcw,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface CampaignTemplate {
  id: number;
  tier: string;
  name: string;
  description: string | null;
  steps: unknown[];
  is_active: boolean;
  is_library_template: boolean;
  variant: string | null;
  auto_assignable: boolean;
  created_at: string;
  updated_at: string;
  lead_count?: number;
}

const tierColors: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  tier_1: { bg: 'bg-yellow-500/5', border: 'border-yellow-500/20', text: 'text-yellow-400', accent: 'bg-yellow-500/20' },
  tier_2: { bg: 'bg-blue-500/5', border: 'border-blue-500/20', text: 'text-blue-400', accent: 'bg-blue-500/20' },
  tier_3: { bg: 'bg-gray-500/5', border: 'border-gray-500/20', text: 'text-gray-400', accent: 'bg-gray-500/20' },
};

export default function CampaignManager() {
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'active' | 'archived' | 'all'>('active');
  const [filterVariant, setFilterVariant] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);

  const { addToast } = useToast();

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/bdr/campaign-templates?include_inactive=true');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('[campaign-manager] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const archiveTemplate = async (id: number) => {
    setActionLoading(id);
    setMenuOpen(null);
    try {
      const res = await fetch(`/api/bdr/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      });
      if (res.ok) {
        setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: false } : t));
        addToast('Campaign archived', 'success');
      } else {
        const err = await res.json();
        addToast(`Archive failed: ${err.error}`, 'error');
      }
    } catch {
      addToast('Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const restoreTemplate = async (id: number) => {
    setActionLoading(id);
    setMenuOpen(null);
    try {
      const res = await fetch(`/api/bdr/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      if (res.ok) {
        setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: true } : t));
        addToast('Campaign restored', 'success');
      } else {
        const err = await res.json();
        addToast(`Restore failed: ${err.error}`, 'error');
      }
    } catch {
      addToast('Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const cloneTemplate = async (id: number) => {
    setActionLoading(id);
    setMenuOpen(null);
    try {
      const res = await fetch(`/api/bdr/campaigns/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clone' }),
      });
      if (res.ok) {
        const data = await res.json();
        addToast(`Campaign cloned: ${data.template?.name}`, 'success');
        fetchTemplates();
      } else {
        const err = await res.json();
        addToast(`Clone failed: ${err.error}`, 'error');
      }
    } catch {
      addToast('Network error', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Filter templates
  const filtered = templates.filter(t => {
    if (filterTier !== 'all' && t.tier !== filterTier) return false;
    if (filterStatus === 'active' && !t.is_active) return false;
    if (filterStatus === 'archived' && t.is_active) return false;
    if (filterVariant !== 'all' && t.variant !== filterVariant) return false;
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder:text-gray-600"
          />
        </div>

        {/* Tier filter */}
        <select
          value={filterTier}
          onChange={(e) => setFilterTier(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
        >
          <option value="all">All Tiers</option>
          <option value="tier_1">Tier 1</option>
          <option value="tier_2">Tier 2</option>
          <option value="tier_3">Tier 3</option>
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'active' | 'archived' | 'all')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>

        {/* Variant filter */}
        <select
          value={filterVariant}
          onChange={(e) => setFilterVariant(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
        >
          <option value="all">All Variants</option>
          <option value="A">Variant A</option>
          <option value="B">Variant B</option>
        </select>

        <span className="text-xs text-gray-600">
          {filtered.length} campaign{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Campaign table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-900/40 border border-gray-800 rounded-xl">
          <Filter className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No campaigns match your filters</p>
        </div>
      ) : (
        <div className="bg-gray-900/40 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium uppercase tracking-wider">Campaign</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium uppercase tracking-wider">Tier</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium uppercase tracking-wider">Variant</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium uppercase tracking-wider">Steps</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium uppercase tracking-wider">Source</th>
                <th className="text-left px-4 py-3 text-[10px] text-gray-500 font-medium uppercase tracking-wider">Updated</th>
                <th className="text-right px-4 py-3 text-[10px] text-gray-500 font-medium uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(template => {
                const colors = tierColors[template.tier] || tierColors.tier_3;
                const isLoading = actionLoading === template.id;
                const isMenuOpen = menuOpen === template.id;
                const steps = Array.isArray(template.steps) ? template.steps : [];

                return (
                  <tr key={template.id} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${!template.is_active ? 'opacity-50' : ''}`}>
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-xs font-medium text-white">{template.name}</span>
                        {template.description && (
                          <p className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[250px]">{template.description}</p>
                        )}
                      </div>
                    </td>

                    {/* Tier */}
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors.accent} ${colors.text}`}>
                        {template.tier.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>

                    {/* Variant */}
                    <td className="px-4 py-3">
                      {template.variant ? (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          template.variant === 'A' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
                        }`}>
                          {template.variant}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-600">-</span>
                      )}
                    </td>

                    {/* Steps */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-400">{steps.length}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        template.is_active
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-600/20 text-gray-500'
                      }`}>
                        {template.is_active ? 'Active' : 'Archived'}
                      </span>
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        template.is_library_template
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-gray-600/20 text-gray-400'
                      }`}>
                        {template.is_library_template ? 'Library' : 'Custom'}
                      </span>
                    </td>

                    {/* Updated */}
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-gray-500">
                        {new Date(template.updated_at).toLocaleDateString()}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                        ) : (
                          <button
                            onClick={() => setMenuOpen(isMenuOpen ? null : template.id)}
                            className="p-1 text-gray-500 hover:text-white rounded"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        )}

                        {isMenuOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                            <div className="absolute right-0 top-8 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[140px]">
                              <button
                                onClick={() => cloneTemplate(template.id)}
                                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 text-left"
                              >
                                <Copy className="w-3 h-3" />
                                Clone
                              </button>

                              {template.is_active ? (
                                <button
                                  onClick={() => archiveTemplate(template.id)}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 text-left"
                                >
                                  <Archive className="w-3 h-3" />
                                  Archive
                                </button>
                              ) : (
                                <button
                                  onClick={() => restoreTemplate(template.id)}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 text-left"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  Restore
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

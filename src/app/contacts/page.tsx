'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search, Filter, ChevronDown, ChevronUp, Users, Mail, Phone,
  Star, Zap, Building2, ArrowUpDown, MoreHorizontal, Tag,
  Download, Upload, Trash2, GitMerge, UserPlus, Loader2,
  CheckSquare, Square, X, ArrowRight, Sparkles,
} from 'lucide-react';
import { Contact, LifecycleStage } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

const stageColors: Record<string, { bg: string; text: string; dot: string }> = {
  raw: { bg: 'bg-gray-600/20', text: 'text-gray-400', dot: 'bg-gray-500' },
  enriched: { bg: 'bg-blue-600/20', text: 'text-blue-400', dot: 'bg-blue-500' },
  outreach: { bg: 'bg-cyan-600/20', text: 'text-cyan-400', dot: 'bg-cyan-500' },
  engaged: { bg: 'bg-yellow-600/20', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  demo_completed: { bg: 'bg-orange-600/20', text: 'text-orange-400', dot: 'bg-orange-500' },
  negotiation: { bg: 'bg-purple-600/20', text: 'text-purple-400', dot: 'bg-purple-500' },
  won: { bg: 'bg-green-600/20', text: 'text-green-400', dot: 'bg-green-500' },
  lost: { bg: 'bg-red-600/20', text: 'text-red-400', dot: 'bg-red-500' },
  nurture: { bg: 'bg-pink-600/20', text: 'text-pink-400', dot: 'bg-pink-500' },
};

const ALL_STAGES: LifecycleStage[] = [
  'raw', 'enriched', 'outreach', 'engaged', 'demo_completed',
  'negotiation', 'won', 'lost', 'nurture',
];

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<string>('all');
  const [sort, setSort] = useState('updated_at');
  const [order, setOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [bulkTag, setBulkTag] = useState('');
  const [bulkStage, setBulkStage] = useState('');
  const searchTimeout = useRef<NodeJS.Timeout>(undefined);
  const { addToast } = useToast();

  const LIMIT = 50;

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort, order, limit: String(LIMIT), offset: String(page * LIMIT),
      });
      if (stage !== 'all') params.set('stage', stage);
      if (search) params.set('search', search);
      if (tagFilter) params.set('tag', tagFilter);

      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch {
      addToast('Failed to load contacts', 'error');
    } finally {
      setLoading(false);
    }
  }, [stage, search, sort, order, page, tagFilter, addToast]);

  // Fetch stage counts
  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts?limit=0');
      const allRes = await res.json();
      const total = allRes.total || 0;

      const counts: Record<string, number> = { all: total };
      for (const s of ALL_STAGES) {
        const r = await fetch(`/api/contacts?stage=${s}&limit=0`);
        const d = await r.json();
        counts[s] = d.total || 0;
      }
      setStageCounts(counts);

      // Collect all unique tags
      const tagsRes = await fetch('/api/contacts?limit=500');
      const tagsData = await tagsRes.json();
      const tags = new Set<string>();
      for (const c of tagsData.contacts || []) {
        for (const t of c.tags || []) tags.add(t);
      }
      setAllTags(Array.from(tags).sort());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const handleSearch = (val: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(val);
      setPage(0);
    }, 300);
  };

  const toggleSort = (col: string) => {
    if (sort === col) {
      setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSort(col);
      setOrder('DESC');
    }
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map(c => c.contact_id)));
    }
  };

  const handleBulkAction = async (action: string, value?: string) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    try {
      const res = await fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: ids, action, value }),
      });
      if (res.ok) {
        addToast(`${action.replace('_', ' ')} applied to ${ids.length} contacts`, 'success');
        setSelected(new Set());
        setShowBulkMenu(false);
        fetchContacts();
        fetchCounts();
      }
    } catch {
      addToast('Bulk action failed', 'error');
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (selected.size > 0) {
      params.set('ids', Array.from(selected).join(','));
    } else if (stage !== 'all') {
      params.set('stage', stage);
    }
    window.open(`/api/contacts/export?${params}`, '_blank');
    addToast('Export started', 'success');
  };

  const handleEnrich = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    let enriched = 0;

    for (const id of ids) {
      try {
        const res = await fetch('/api/contacts/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_id: id }),
        });
        if (res.ok) enriched++;
      } catch { /* continue */ }
    }

    addToast(`Enriched ${enriched} of ${ids.length} contacts`, 'success');
    setSelected(new Set());
    fetchContacts();
  };

  const totalPages = Math.ceil(total / LIMIT);
  const getName = (c: Contact) =>
    [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown';

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {total.toLocaleString()} contacts · {stageCounts['outreach'] || 0} in outreach
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <Link
            href="/contacts/duplicates"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            <GitMerge className="w-3.5 h-3.5" /> Dedup
          </Link>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search contacts..."
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
            showFilters ? 'bg-blue-600/20 text-blue-400 border-blue-600/50' : 'text-gray-400 bg-gray-800 border-gray-700 hover:text-white'
          }`}
        >
          <Filter className="w-3.5 h-3.5" /> Filters
          {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Stage pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => { setStage('all'); setPage(0); }}
          className={`text-xs px-3 py-1 rounded-full transition-colors ${
            stage === 'all' ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          All {stageCounts['all'] ? `(${stageCounts['all']})` : ''}
        </button>
        {ALL_STAGES.map(s => (
          <button
            key={s}
            onClick={() => { setStage(s); setPage(0); }}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full transition-colors ${
              stage === s
                ? `${stageColors[s].bg} ${stageColors[s].text}`
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${stageColors[s].dot}`} />
            {s.replace('_', ' ')} {stageCounts[s] ? `(${stageCounts[s]})` : ''}
          </button>
        ))}
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Tag</label>
              <select
                value={tagFilter}
                onChange={(e) => { setTagFilter(e.target.value); setPage(0); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
              >
                <option value="">All tags</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Sort By</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
              >
                <option value="updated_at">Last Updated</option>
                <option value="created_at">Created Date</option>
                <option value="lead_score">Lead Score</option>
                <option value="engagement_score">Engagement</option>
                <option value="business_name">Business Name</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Order</label>
              <select
                value={order}
                onChange={(e) => setOrder(e.target.value as 'ASC' | 'DESC')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
              >
                <option value="DESC">Descending</option>
                <option value="ASC">Ascending</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="bg-blue-600/10 border border-blue-600/30 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-400 font-medium">{selected.size} selected</span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300"
              >
                <option value="">Move to stage...</option>
                {ALL_STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              {bulkStage && (
                <button
                  onClick={() => { handleBulkAction('change_stage', bulkStage); setBulkStage(''); }}
                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-500"
                >
                  Apply
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
                placeholder="Add tag..."
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 w-24"
              />
              {bulkTag && (
                <button
                  onClick={() => { handleBulkAction('add_tag', bulkTag); setBulkTag(''); }}
                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-500"
                >
                  <Tag className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              onClick={handleEnrich}
              className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1"
            >
              <Sparkles className="w-3 h-3" /> Enrich
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-2 py-1"
            >
              <Download className="w-3 h-3" /> Export
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete ${selected.size} contacts? This cannot be undone.`)) {
                  handleBulkAction('delete');
                }
              }}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Contact Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No contacts found</p>
          <p className="text-xs text-gray-600 mt-1">Try adjusting your filters or import contacts</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="p-3 w-10">
                  <button onClick={selectAll}>
                    {selected.size === contacts.length && contacts.length > 0
                      ? <CheckSquare className="w-4 h-4 text-blue-400" />
                      : <Square className="w-4 h-4 text-gray-600" />
                    }
                  </button>
                </th>
                <th className="p-3 text-left">
                  <button onClick={() => toggleSort('business_name')} className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-300">
                    Contact <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                <th className="p-3 text-left">
                  <button onClick={() => toggleSort('lead_score')} className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-300">
                    Score <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Contact Info</th>
                <th className="p-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tags</th>
                <th className="p-3 text-left">
                  <button onClick={() => toggleSort('updated_at')} className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-300">
                    Updated <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => {
                const name = getName(c);
                const sc = stageColors[c.lifecycle_stage] || stageColors.raw;
                const isSelected = selected.has(c.contact_id);

                return (
                  <tr
                    key={c.contact_id}
                    className={`border-b border-gray-800/50 transition-colors ${
                      isSelected ? 'bg-blue-600/5' : 'hover:bg-gray-800/50'
                    }`}
                  >
                    <td className="p-3">
                      <button onClick={() => toggleSelect(c.contact_id)}>
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-blue-400" />
                          : <Square className="w-4 h-4 text-gray-600 hover:text-gray-400" />
                        }
                      </button>
                    </td>
                    <td className="p-3">
                      <Link href={`/contacts/${c.contact_id}`} className="group">
                        <div className="flex items-center gap-2">
                          {c.business_name && (
                            <Building2 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm text-gray-200 font-medium truncate group-hover:text-white">
                              {c.business_name || name}
                            </p>
                            {c.business_name && (
                              <p className="text-xs text-gray-500 truncate">{name}</p>
                            )}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {c.lifecycle_stage.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-yellow-500" />
                          <span className="text-xs text-yellow-500 font-medium">{c.lead_score}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Zap className="w-3 h-3 text-cyan-500" />
                          <span className="text-xs text-cyan-500 font-medium">{c.engagement_score}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {c.email && <span title={c.email}><Mail className="w-3.5 h-3.5 text-gray-500" /></span>}
                        {c.phone && <span title={c.phone}><Phone className="w-3.5 h-3.5 text-gray-500" /></span>}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {(c.tags || []).slice(0, 3).map(t => (
                          <span key={t} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">{t}</span>
                        ))}
                        {(c.tags || []).length > 3 && (
                          <span className="text-[10px] text-gray-600">+{c.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="text-xs text-gray-500">
                        {new Date(c.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    <td className="p-3">
                      <Link href={`/contacts/${c.contact_id}`}>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-600 hover:text-gray-400" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
              <span className="text-xs text-gray-500">
                Showing {page * LIMIT + 1}-{Math.min((page + 1) * LIMIT, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 rounded-lg disabled:opacity-30"
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = page < 3 ? i : page - 2 + i;
                  if (p >= totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-3 py-1 text-xs rounded-lg ${
                        p === page ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white bg-gray-800'
                      }`}
                    >
                      {p + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 text-xs text-gray-400 hover:text-white bg-gray-800 rounded-lg disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Modal */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onComplete={() => { setShowImport(false); fetchContacts(); fetchCounts(); }} />}
    </div>
  );
}

// ─── Import Modal ────────────────────────────────────────────────────────────

function ImportModal({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [csvText, setCsvText] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number } | null>(null);
  const { addToast } = useToast();

  const dbFields = [
    { value: '', label: 'Skip' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'first_name', label: 'First Name' },
    { value: 'last_name', label: 'Last Name' },
    { value: 'business_name', label: 'Business Name' },
    { value: 'title', label: 'Title' },
    { value: 'linkedin_url', label: 'LinkedIn URL' },
    { value: 'website', label: 'Website' },
  ];

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;

    const hdrs = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    setHeaders(hdrs);

    const parsed = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      hdrs.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });
    setRows(parsed);

    // Auto-map fields
    const autoMap: Record<string, string> = {};
    const guesses: Record<string, string[]> = {
      email: ['email', 'e-mail', 'email_address'],
      phone: ['phone', 'telephone', 'phone_number', 'mobile'],
      first_name: ['first_name', 'first', 'firstname', 'given_name'],
      last_name: ['last_name', 'last', 'lastname', 'surname', 'family_name'],
      business_name: ['business_name', 'company', 'business', 'organization', 'company_name'],
      title: ['title', 'job_title', 'position', 'role'],
      linkedin_url: ['linkedin', 'linkedin_url', 'linkedin_profile'],
      website: ['website', 'url', 'web', 'domain'],
    };

    for (const h of hdrs) {
      const lower = h.toLowerCase().replace(/\s+/g, '_');
      for (const [field, aliases] of Object.entries(guesses)) {
        if (aliases.includes(lower)) {
          autoMap[h] = field;
          break;
        }
      }
    }
    setMapping(autoMap);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);

    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          field_mapping: mapping,
          default_stage: 'raw',
          default_tags: ['imported'],
        }),
      });
      const data = await res.json();
      setResult(data);
      addToast(`Imported ${data.imported} new, updated ${data.updated}`, 'success');
    } catch {
      addToast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Import Contacts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="bg-green-600/10 border border-green-600/30 rounded-lg p-4">
              <p className="text-sm text-green-400 font-medium">Import Complete</p>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{result.imported}</p>
                  <p className="text-[10px] text-gray-500">New</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{result.updated}</p>
                  <p className="text-[10px] text-gray-500">Updated</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{result.skipped}</p>
                  <p className="text-[10px] text-gray-500">Skipped</p>
                </div>
              </div>
            </div>
            <button onClick={onComplete} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm hover:bg-blue-500">
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* File Upload */}
            <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center">
              <Upload className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 mb-2">Upload a CSV file</p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="text-xs text-gray-400 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-800 file:text-gray-300 hover:file:bg-gray-700"
              />
            </div>

            {/* Field Mapping */}
            {headers.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">{rows.length} rows detected. Map CSV columns to contact fields:</p>
                <div className="space-y-2">
                  {headers.map(h => (
                    <div key={h} className="flex items-center gap-3">
                      <span className="text-xs text-gray-300 w-36 truncate">{h}</span>
                      <ArrowRight className="w-3 h-3 text-gray-600" />
                      <select
                        value={mapping[h] || ''}
                        onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300"
                      >
                        {dbFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Preview */}
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 mb-2">Preview (first 3 rows)</p>
                  <div className="space-y-1.5">
                    {rows.slice(0, 3).map((row, i) => (
                      <div key={i} className="text-xs text-gray-400 flex items-center gap-2">
                        <span className="text-gray-600 w-4">{i + 1}</span>
                        {Object.entries(mapping).filter(([, v]) => v).map(([csvCol, dbField]) => (
                          <span key={csvCol} className="bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">
                            {dbField}: {row[csvCol] || '--'}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleImport}
                  disabled={importing || Object.values(mapping).filter(Boolean).length === 0}
                  className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Import {rows.length} Contacts
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

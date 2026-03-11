'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Plus,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Edit3,
  Trash2,
  Tag,
  Sparkles,
  BookOpen,
  Shield,
  Target,
  TrendingUp,
  Briefcase,
  MessageSquare,
  Zap,
  Check,
  X,
  Loader2,
  BarChart3,
  Award,
  Globe,
  Upload,
  FileText,
  Mail,
  Mic,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BrainEntry {
  id: string;
  content_type: string;
  title: string;
  raw_text: string | null;
  key_claims: string[];
  value_props: string[];
  pain_points_addressed: string[];
  source_type: string;
  is_active: boolean;
  effectiveness_score?: number;
  usage_in_emails?: number;
  usage_in_replies?: number;
  category?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

interface IndustrySnippet {
  id: string;
  industry: string;
  category: string;
  title: string;
  content: string;
  usage_count: number;
  effectiveness_score: number;
  is_active: boolean;
  created_at: string;
}

interface AutoLearned {
  id: string;
  source_type: string;
  pattern_type: string;
  content: string;
  context: Record<string, unknown>;
  confidence: number;
  times_used: number;
  times_successful: number;
  is_active: boolean;
  created_at: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'all', label: 'All Content', icon: Brain, color: 'blue' },
  { key: 'product_knowledge', label: 'Product Knowledge', icon: BookOpen, color: 'emerald' },
  { key: 'objections', label: 'Objections', icon: Shield, color: 'orange' },
  { key: 'winning_phrases', label: 'Winning Phrases', icon: Award, color: 'yellow' },
  { key: 'competitor_intel', label: 'Competitor Intel', icon: Target, color: 'red' },
  { key: 'pricing', label: 'Pricing', icon: TrendingUp, color: 'violet' },
  { key: 'case_studies', label: 'Case Studies', icon: Briefcase, color: 'cyan' },
  { key: 'call_intelligence', label: 'Call Intelligence', icon: MessageSquare, color: 'pink' },
  { key: 'industry_research', label: 'Industry Research', icon: Globe, color: 'teal' },
];

const CONTENT_TYPES = [
  'product_knowledge', 'objections', 'winning_phrases', 'competitor_intel',
  'pricing', 'case_studies', 'call_intelligence', 'deal_intelligence',
  'pipeline_intelligence', 'value_prop_intelligence', 'mrr_tier_analysis',
  'industry_research',
];

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function BrainPage() {
  const [activeTab, setActiveTab] = useState<'content' | 'industry' | 'learned' | 'effectiveness'>('content');
  const [entries, setEntries] = useState<BrainEntry[]>([]);
  const [snippets, setSnippets] = useState<IndustrySnippet[]>([]);
  const [learned, setLearned] = useState<AutoLearned[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState<BrainEntry | null>(null);
  const [showSnippetEditor, setShowSnippetEditor] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<IndustrySnippet | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [tags, setTags] = useState<{ id: string; name: string; color: string; content_count: number }[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  // ─── Data Loading ───────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [brainRes, snippetsRes, learnedRes, tagsRes] = await Promise.all([
        fetch('/api/brain?section=all'),
        fetch('/api/brain/industry'),
        fetch('/api/brain/learned'),
        fetch('/api/brain/tags'),
      ]);

      const brainData = await brainRes.json();
      setEntries(brainData.content || []);

      if (snippetsRes.ok) {
        const snippetsData = await snippetsRes.json();
        setSnippets(snippetsData.snippets || []);
      }

      if (learnedRes.ok) {
        const learnedData = await learnedRes.json();
        setLearned(learnedData.patterns || []);
      }

      if (tagsRes.ok) {
        const tagsData = await tagsRes.json();
        setTags(tagsData.tags || []);
      }
    } catch (err) {
      console.error('Failed to load brain data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch('/api/brain/sync', { method: 'POST' });
      await loadData();
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveEntry = async (entry: Partial<BrainEntry>) => {
    const isNew = !entry.id;
    const method = isNew ? 'POST' : 'PATCH';
    const res = await fetch('/api/brain', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      setShowEditor(false);
      setEditingEntry(null);
      await loadData();
    }
  };

  const handleDeleteEntry = async (id: string) => {
    await fetch('/api/brain', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadData();
  };

  const handleSaveSnippet = async (snippet: Partial<IndustrySnippet>) => {
    const isNew = !snippet.id;
    const res = await fetch('/api/brain/industry', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snippet),
    });
    if (res.ok) {
      setShowSnippetEditor(false);
      setEditingSnippet(null);
      await loadData();
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    await fetch('/api/brain/industry', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await loadData();
  };

  // ─── Filtering ──────────────────────────────────────────────────────────

  const filteredEntries = entries.filter(e => {
    const matchesSearch = !searchQuery ||
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.raw_text || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || e.content_type === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const manualEntries = filteredEntries.filter(e => e.source_type !== 'automated');
  const automatedEntries = filteredEntries.filter(e => e.source_type === 'automated');

  // ─── Stats ──────────────────────────────────────────────────────────────

  const stats = {
    total: entries.length,
    manual: entries.filter(e => e.source_type !== 'automated').length,
    automated: entries.filter(e => e.source_type === 'automated').length,
    active: entries.filter(e => e.is_active).length,
    snippets: snippets.length,
    learned: learned.length,
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-7 h-7 text-violet-400" />
            Knowledge Brain
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Sales intelligence that feeds all AI functions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Brain'}
          </button>
          <button
            onClick={() => setShowImporter(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={() => { setEditingEntry(null); setShowEditor(true); }}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-violet-600 hover:bg-violet-700 rounded-lg text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Content
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Total Entries', value: stats.total, icon: Brain, color: 'violet' },
          { label: 'Manual', value: stats.manual, icon: Edit3, color: 'blue' },
          { label: 'Auto-Synced', value: stats.automated, icon: Zap, color: 'emerald' },
          { label: 'Active', value: stats.active, icon: Check, color: 'green' },
          { label: 'Industry Snippets', value: stats.snippets, icon: Globe, color: 'cyan' },
          { label: 'Auto-Learned', value: stats.learned, icon: Sparkles, color: 'yellow' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 text-${color}-400`} />
              <span className="text-xs text-gray-400">{label}</span>
            </div>
            <div className="text-xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
        {[
          { key: 'content', label: 'Brain Content', icon: Brain },
          { key: 'industry', label: 'Industry Snippets', icon: Globe },
          { key: 'learned', label: 'Auto-Learned', icon: Sparkles },
          { key: 'effectiveness', label: 'Effectiveness', icon: BarChart3 },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors flex-1 justify-center ${
              activeTab === key
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="flex gap-6">
          {/* Category Sidebar */}
          <div className="w-56 shrink-0 space-y-1">
            {CATEGORIES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                  activeCategory === key
                    ? 'bg-violet-600/20 text-violet-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                <span className="ml-auto text-xs text-gray-500">
                  {key === 'all'
                    ? entries.length
                    : entries.filter(e => e.content_type === key).length}
                </span>
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search brain content..."
                className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500"
              />
            </div>

            {/* Tag Filter */}
            {tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="w-3.5 h-3.5 text-gray-500" />
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => setActiveTagFilter(activeTagFilter === tag.id ? null : tag.id)}
                    className={`text-xs px-2 py-1 rounded-full transition-colors ${
                      activeTagFilter === tag.id
                        ? 'bg-violet-600/30 text-violet-300 border border-violet-500/50'
                        : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {tag.name}
                    <span className="ml-1 opacity-60">{tag.content_count}</span>
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : (
              <>
                {/* Manual Entries */}
                {manualEntries.length > 0 && (
                  <ContentSection
                    title="Manual Content"
                    entries={manualEntries}
                    onEdit={(e) => { setEditingEntry(e); setShowEditor(true); }}
                    onDelete={handleDeleteEntry}
                  />
                )}

                {/* Auto-Synced Entries */}
                {automatedEntries.length > 0 && (
                  <ContentSection
                    title="Auto-Synced Intelligence"
                    entries={automatedEntries}
                    onEdit={(e) => { setEditingEntry(e); setShowEditor(true); }}
                    onDelete={handleDeleteEntry}
                    isAutomated
                  />
                )}

                {filteredEntries.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No brain content found</p>
                    <button
                      onClick={() => { setEditingEntry(null); setShowEditor(true); }}
                      className="mt-3 text-sm text-violet-400 hover:text-violet-300"
                    >
                      Add your first entry
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Industry Snippets Tab */}
      {activeTab === 'industry' && (
        <IndustrySnippetsTab
          snippets={snippets}
          onAdd={() => { setEditingSnippet(null); setShowSnippetEditor(true); }}
          onEdit={(s) => { setEditingSnippet(s); setShowSnippetEditor(true); }}
          onDelete={handleDeleteSnippet}
          loading={loading}
        />
      )}

      {/* Auto-Learned Tab */}
      {activeTab === 'learned' && (
        <AutoLearnedTab learned={learned} loading={loading} onRefresh={loadData} />
      )}

      {/* Effectiveness Tab */}
      {activeTab === 'effectiveness' && (
        <EffectivenessTab entries={entries} learned={learned} />
      )}

      {/* Content Editor Modal */}
      {showEditor && (
        <ContentEditor
          entry={editingEntry}
          onSave={handleSaveEntry}
          onClose={() => { setShowEditor(false); setEditingEntry(null); }}
        />
      )}

      {/* Snippet Editor Modal */}
      {showSnippetEditor && (
        <SnippetEditor
          snippet={editingSnippet}
          onSave={handleSaveSnippet}
          onClose={() => { setShowSnippetEditor(false); setEditingSnippet(null); }}
        />
      )}

      {/* Import Modal */}
      {showImporter && (
        <ImportModal
          onClose={() => setShowImporter(false)}
          onImported={loadData}
        />
      )}
    </div>
  );
}

// ─── Content Section Component ──────────────────────────────────────────────

function ContentSection({
  title,
  entries,
  onEdit,
  onDelete,
  isAutomated,
}: {
  title: string;
  entries: BrainEntry[];
  onEdit: (entry: BrainEntry) => void;
  onDelete: (id: string) => void;
  isAutomated?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const toggleEntry = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white"
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title}
        <span className="text-xs text-gray-500 font-normal">({entries.length})</span>
        {isAutomated && <Zap className="w-3 h-3 text-emerald-400" />}
      </button>

      {expanded && (
        <div className="space-y-2">
          {entries.map(entry => (
            <div
              key={entry.id}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
            >
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/50"
                onClick={() => toggleEntry(entry.id)}
              >
                {expandedEntries.has(entry.id)
                  ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">{entry.title}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                      {entry.content_type}
                    </span>
                    {!entry.is_active && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">inactive</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Updated {new Date(entry.updated_at).toLocaleDateString()}
                    {entry.effectiveness_score ? ` · Score: ${entry.effectiveness_score}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
                    className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {!isAutomated && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                      className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {expandedEntries.has(entry.id) && (
                <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-3">
                  {entry.raw_text && (
                    <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                      {entry.raw_text}
                    </div>
                  )}
                  {entry.key_claims && entry.key_claims.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Key Claims</div>
                      <div className="flex flex-wrap gap-1">
                        {entry.key_claims.map((c, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-blue-900/30 text-blue-300">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {entry.value_props && entry.value_props.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Value Props</div>
                      <div className="flex flex-wrap gap-1">
                        {entry.value_props.map((v, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-emerald-900/30 text-emerald-300">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {entry.pain_points_addressed && entry.pain_points_addressed.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">Pain Points Addressed</div>
                      <div className="flex flex-wrap gap-1">
                        {entry.pain_points_addressed.map((p, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-orange-900/30 text-orange-300">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Content Editor Modal ───────────────────────────────────────────────────

function ContentEditor({
  entry,
  onSave,
  onClose,
}: {
  entry: BrainEntry | null;
  onSave: (entry: Partial<BrainEntry>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    id: entry?.id || '',
    content_type: entry?.content_type || 'product_knowledge',
    title: entry?.title || '',
    raw_text: entry?.raw_text || '',
    key_claims: (entry?.key_claims || []).join('\n'),
    value_props: (entry?.value_props || []).join('\n'),
    pain_points_addressed: (entry?.pain_points_addressed || []).join('\n'),
    source_type: entry?.source_type || 'manual',
    is_active: entry?.is_active ?? true,
    tags: (entry?.tags || []).join(', '),
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    await onSave({
      ...(form.id ? { id: form.id } : {}),
      content_type: form.content_type,
      title: form.title,
      raw_text: form.raw_text,
      key_claims: form.key_claims.split('\n').filter(Boolean),
      value_props: form.value_props.split('\n').filter(Boolean),
      pain_points_addressed: form.pain_points_addressed.split('\n').filter(Boolean),
      source_type: form.source_type,
      is_active: form.is_active,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {entry ? 'Edit Content' : 'Add Brain Content'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Content Type</label>
              <select
                value={form.content_type}
                onChange={(e) => setForm({ ...form, content_type: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                {CONTENT_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-gray-700"
                />
                Active
              </label>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">Tags (comma-separated)</label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="e.g., pizza, commission, high-value"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Entry title..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">Content</label>
            <textarea
              value={form.raw_text}
              onChange={(e) => setForm({ ...form, raw_text: e.target.value })}
              placeholder="Full content text..."
              rows={8}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-y"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">Key Claims (one per line)</label>
            <textarea
              value={form.key_claims}
              onChange={(e) => setForm({ ...form, key_claims: e.target.value })}
              placeholder="Claim 1&#10;Claim 2..."
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-y"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">Value Props (one per line)</label>
            <textarea
              value={form.value_props}
              onChange={(e) => setForm({ ...form, value_props: e.target.value })}
              placeholder="Value prop 1&#10;Value prop 2..."
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-y"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">Pain Points Addressed (one per line)</label>
            <textarea
              value={form.pain_points_addressed}
              onChange={(e) => setForm({ ...form, pain_points_addressed: e.target.value })}
              placeholder="Pain point 1&#10;Pain point 2..."
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-y"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.title || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 rounded-lg text-white transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {entry ? 'Save Changes' : 'Add Content'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Industry Snippets Tab ──────────────────────────────────────────────────

function IndustrySnippetsTab({
  snippets,
  onAdd,
  onEdit,
  onDelete,
  loading,
}: {
  snippets: IndustrySnippet[];
  onAdd: () => void;
  onEdit: (s: IndustrySnippet) => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  const industries = [...new Set(snippets.map(s => s.industry))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Industry-Specific Personalization</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Research snippets injected into AI email generation based on lead&apos;s industry
          </p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Snippet
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : industries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No industry snippets yet</p>
          <button onClick={onAdd} className="mt-3 text-sm text-cyan-400 hover:text-cyan-300">
            Add your first snippet
          </button>
        </div>
      ) : (
        industries.map(industry => (
          <div key={industry} className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-cyan-400" />
              {industry}
              <span className="text-xs text-gray-500 font-normal">
                ({snippets.filter(s => s.industry === industry).length} snippets)
              </span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {snippets
                .filter(s => s.industry === industry)
                .map(snippet => (
                  <div
                    key={snippet.id}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{snippet.title}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onEdit(snippet)}
                          className="p-1 text-gray-500 hover:text-blue-400"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(snippet.id)}
                          className="p-1 text-gray-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-900/30 text-cyan-300">
                      {snippet.category}
                    </span>
                    <p className="text-xs text-gray-400 line-clamp-3">{snippet.content}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>Used {snippet.usage_count}x</span>
                      {snippet.effectiveness_score > 0 && (
                        <span className="text-emerald-400">Score: {snippet.effectiveness_score}</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Snippet Editor Modal ───────────────────────────────────────────────────

function SnippetEditor({
  snippet,
  onSave,
  onClose,
}: {
  snippet: IndustrySnippet | null;
  onSave: (s: Partial<IndustrySnippet>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    id: snippet?.id || '',
    industry: snippet?.industry || '',
    category: snippet?.category || 'general',
    title: snippet?.title || '',
    content: snippet?.content || '',
  });
  const [saving, setSaving] = useState(false);

  const INDUSTRIES = [
    'Restaurant - Pizza', 'Restaurant - Mexican', 'Restaurant - Asian',
    'Restaurant - Indian', 'Restaurant - Italian', 'Restaurant - American',
    'Restaurant - Fast Food', 'Restaurant - Fine Dining', 'Restaurant - Catering',
    'Grocery', 'Pharmacy', 'Florist', 'Bakery', 'Liquor Store', 'Other',
  ];

  const SNIPPET_CATEGORIES = [
    'general', 'pain_points', 'commission_data', 'tech_stack',
    'delivery_patterns', 'customer_behavior', 'market_trends', 'competitor_intel',
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {snippet ? 'Edit Snippet' : 'Add Industry Snippet'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Industry</label>
              <select
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">Select industry...</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                {SNIPPET_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Pizza delivery commission rates..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">Content</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Industry-specific research, data points, or talking points..."
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan-500 resize-y"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }}
            disabled={!form.title || !form.industry || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {snippet ? 'Save' : 'Add Snippet'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Auto-Learned Tab ───────────────────────────────────────────────────────

function AutoLearnedTab({
  learned,
  loading,
  onRefresh,
}: {
  learned: AutoLearned[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const patternTypes = [...new Set(learned.map(l => l.pattern_type))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Auto-Learned Patterns</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Winning patterns automatically extracted from emails that get replies
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : learned.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No auto-learned patterns yet</p>
          <p className="text-xs mt-1">Patterns are extracted when emails receive positive replies</p>
        </div>
      ) : (
        patternTypes.map(type => (
          <div key={type} className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 capitalize">
              {type.replace(/_/g, ' ')}
              <span className="text-xs text-gray-500 font-normal ml-2">
                ({learned.filter(l => l.pattern_type === type).length})
              </span>
            </h4>
            <div className="space-y-2">
              {learned
                .filter(l => l.pattern_type === type)
                .map(pattern => (
                  <div
                    key={pattern.id}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-start gap-3"
                  >
                    <Sparkles className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300">{pattern.content}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        <span>Confidence: {(pattern.confidence * 100).toFixed(0)}%</span>
                        <span>Used {pattern.times_used}x</span>
                        {pattern.times_successful > 0 && (
                          <span className="text-emerald-400">
                            {pattern.times_successful} successful
                          </span>
                        )}
                        <span>Source: {pattern.source_type}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Import Modal ──────────────────────────────────────────────────────────

function ImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [sourceType, setSourceType] = useState<'fathom_transcript' | 'email_reply' | 'bulk_text'>('fathom_transcript');
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState({ business_name: '', call_outcome: '', angle: '', reply_sentiment: 'positive', category: '' });
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<string[] | null>(null);

  const SOURCE_OPTIONS = [
    { key: 'fathom_transcript' as const, label: 'Fathom Call Transcript', icon: Mic, desc: 'Paste a Fathom call transcript. AI extracts winning phrases, objections, and competitor intel.' },
    { key: 'email_reply' as const, label: 'Email + Reply', icon: Mail, desc: 'Paste a cold email and its reply. AI extracts winning subject lines, CTAs, and patterns.' },
    { key: 'bulk_text' as const, label: 'Bulk Text / Notes', icon: FileText, desc: 'Paste competitor research, product notes, or any text. AI structures it into brain entries.' },
  ];

  const handleImport = async () => {
    if (!content.trim()) return;
    setImporting(true);
    setResults(null);
    try {
      const res = await fetch('/api/brain/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: sourceType, content, metadata }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
        onImported();
      } else {
        setResults([`Error: ${data.error}`]);
      }
    } catch (err) {
      setResults([`Error: ${err instanceof Error ? err.message : 'Import failed'}`]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-violet-400" />
            Import to Knowledge Brain
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Source Type Selection */}
          <div className="grid grid-cols-3 gap-3">
            {SOURCE_OPTIONS.map(({ key, label, icon: Icon, desc }) => (
              <button
                key={key}
                onClick={() => setSourceType(key)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  sourceType === key
                    ? 'bg-violet-600/20 border-violet-500/50 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <Icon className={`w-5 h-5 mb-2 ${sourceType === key ? 'text-violet-400' : 'text-gray-500'}`} />
                <div className="text-xs font-medium">{label}</div>
                <div className="text-[10px] text-gray-500 mt-1 leading-tight">{desc}</div>
              </button>
            ))}
          </div>

          {/* Content Input */}
          <div>
            <label className="text-xs font-medium text-gray-400 mb-1 block">
              {sourceType === 'fathom_transcript' ? 'Paste Fathom Transcript' :
               sourceType === 'email_reply' ? 'Paste Email + Reply' : 'Paste Content'}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                sourceType === 'fathom_transcript'
                  ? 'Paste the full Fathom call transcript here...'
                  : sourceType === 'email_reply'
                  ? 'Paste the original email and the reply below...'
                  : 'Paste competitor research, product notes, or any text...'
              }
              rows={10}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500 resize-y font-mono"
            />
            <div className="text-xs text-gray-500 mt-1 text-right">
              {content.length.toLocaleString()} characters
            </div>
          </div>

          {/* Metadata Fields */}
          <div className="grid grid-cols-2 gap-3">
            {sourceType === 'fathom_transcript' && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">Business Name (optional)</label>
                  <input
                    type="text"
                    value={metadata.business_name}
                    onChange={(e) => setMetadata({ ...metadata, business_name: e.target.value })}
                    placeholder="e.g., Mario's Pizza"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">Call Outcome (optional)</label>
                  <select
                    value={metadata.call_outcome}
                    onChange={(e) => setMetadata({ ...metadata, call_outcome: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="">Select...</option>
                    <option value="won">Won / Closed</option>
                    <option value="demo_scheduled">Demo Scheduled</option>
                    <option value="interested">Interested / Follow Up</option>
                    <option value="not_interested">Not Interested</option>
                    <option value="no_show">No Show</option>
                  </select>
                </div>
              </>
            )}
            {sourceType === 'email_reply' && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">Angle Used (optional)</label>
                  <input
                    type="text"
                    value={metadata.angle}
                    onChange={(e) => setMetadata({ ...metadata, angle: e.target.value })}
                    placeholder="e.g., commission_savings"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-1 block">Reply Sentiment</label>
                  <select
                    value={metadata.reply_sentiment}
                    onChange={(e) => setMetadata({ ...metadata, reply_sentiment: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="positive">Positive</option>
                    <option value="interested">Interested</option>
                    <option value="neutral">Neutral</option>
                    <option value="negative">Negative</option>
                  </select>
                </div>
              </>
            )}
            {sourceType === 'bulk_text' && (
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-400 mb-1 block">Intended Category (optional)</label>
                <select
                  value={metadata.category}
                  onChange={(e) => setMetadata({ ...metadata, category: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="">Auto-detect</option>
                  {CONTENT_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Results */}
          {results && (
            <div className={`rounded-lg p-4 space-y-1 ${
              results[0]?.startsWith('Error') ? 'bg-red-900/20 border border-red-800' : 'bg-emerald-900/20 border border-emerald-800'
            }`}>
              <div className={`text-xs font-semibold ${results[0]?.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                {results[0]?.startsWith('Error') ? 'Import Failed' : `Imported ${results.length} entries`}
              </div>
              {results.map((r, i) => (
                <div key={i} className="text-xs text-gray-300">{r}</div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
            {results ? 'Done' : 'Cancel'}
          </button>
          {!results && (
            <button
              onClick={handleImport}
              disabled={!content.trim() || importing}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 rounded-lg text-white transition-colors disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing with AI...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Effectiveness Tab ──────────────────────────────────────────────────────

function EffectivenessTab({
  entries,
  learned,
}: {
  entries: BrainEntry[];
  learned: AutoLearned[];
}) {
  const topEntries = [...entries]
    .filter(e => (e.usage_in_emails || 0) > 0 || (e.usage_in_replies || 0) > 0)
    .sort((a, b) => (b.effectiveness_score || 0) - (a.effectiveness_score || 0))
    .slice(0, 10);

  const topLearned = [...learned]
    .filter(l => l.times_used > 0)
    .sort((a, b) => {
      const aRate = a.times_used > 0 ? a.times_successful / a.times_used : 0;
      const bRate = b.times_used > 0 ? b.times_successful / b.times_used : 0;
      return bRate - aRate;
    })
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Effectiveness Dashboard</h3>
        <p className="text-xs text-gray-500">
          Track which brain content appears in emails that get replies
        </p>
      </div>

      {/* Top Performing Content */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-300">Top Performing Brain Content</h4>
        {topEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-900 border border-gray-800 rounded-lg">
            <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No effectiveness data yet</p>
            <p className="text-xs mt-1">Send more emails to start tracking</p>
          </div>
        ) : (
          topEntries.map((entry, i) => (
            <div
              key={entry.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center gap-4"
            >
              <div className="text-lg font-bold text-gray-600 w-6 text-center">#{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{entry.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {entry.content_type.replace(/_/g, ' ')}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="font-semibold text-blue-400">{entry.usage_in_emails || 0}</div>
                  <div className="text-xs text-gray-500">Emails</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-emerald-400">{entry.usage_in_replies || 0}</div>
                  <div className="text-xs text-gray-500">Replies</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-yellow-400">{entry.effectiveness_score || 0}</div>
                  <div className="text-xs text-gray-500">Score</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Top Learned Patterns */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-300">Top Learned Patterns</h4>
        {topLearned.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-900 border border-gray-800 rounded-lg">
            <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No learned patterns with usage data yet</p>
          </div>
        ) : (
          topLearned.map((pattern, i) => {
            const successRate = pattern.times_used > 0
              ? ((pattern.times_successful / pattern.times_used) * 100).toFixed(0)
              : '0';
            return (
              <div
                key={pattern.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center gap-4"
              >
                <div className="text-lg font-bold text-gray-600 w-6 text-center">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-300">{pattern.content}</div>
                  <div className="text-xs text-gray-500 mt-0.5 capitalize">
                    {pattern.pattern_type.replace(/_/g, ' ')} · {pattern.source_type}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-semibold text-blue-400">{pattern.times_used}</div>
                    <div className="text-xs text-gray-500">Used</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-emerald-400">{successRate}%</div>
                    <div className="text-xs text-gray-500">Success</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

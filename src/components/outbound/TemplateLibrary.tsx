'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookTemplate, Plus, Loader2, Save, Trash2, Star,
  Copy, Check, Search, Filter, ChevronDown, ChevronUp,
  TrendingUp, Send, Eye, MessageSquare,
} from 'lucide-react';

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  angle: string;
  tone: string;
  tier: string | null;
  is_starred: boolean;
  usage_count: number;
  avg_open_rate: number | null;
  avg_reply_rate: number | null;
  created_at: string;
  updated_at: string;
}

const angleLabels: Record<string, string> = {
  missed_calls: 'Missed Calls',
  commission_savings: 'Commission',
  delivery_ops: 'Delivery Ops',
  tech_consolidation: 'Tech Stack',
  customer_experience: 'CX',
};

const angleColors: Record<string, string> = {
  missed_calls: 'text-red-400',
  commission_savings: 'text-green-400',
  delivery_ops: 'text-blue-400',
  tech_consolidation: 'text-purple-400',
  customer_experience: 'text-yellow-400',
};

export default function TemplateLibrary() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [angleFilter, setAngleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Create form
  const [newName, setNewName] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newAngle, setNewAngle] = useState('missed_calls');
  const [newTone, setNewTone] = useState('professional');
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/bdr/email-templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('[TemplateLibrary] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const createTemplate = async () => {
    if (!newName || !newSubject || !newBody) return;
    setSaving(true);
    try {
      const res = await fetch('/api/bdr/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          subject: newSubject,
          body: newBody,
          angle: newAngle,
          tone: newTone,
        }),
      });
      if (res.ok) {
        await fetchTemplates();
        setShowCreate(false);
        setNewName('');
        setNewSubject('');
        setNewBody('');
      }
    } catch (err) {
      console.error('[TemplateLibrary] create error:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: number) => {
    try {
      await fetch(`/api/bdr/email-templates?id=${id}`, { method: 'DELETE' });
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('[TemplateLibrary] delete error:', err);
    }
  };

  const toggleStar = async (id: number) => {
    const template = templates.find(t => t.id === id);
    if (!template) return;
    try {
      await fetch('/api/bdr/email-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_starred: !template.is_starred }),
      });
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_starred: !t.is_starred } : t));
    } catch (err) {
      console.error('[TemplateLibrary] star error:', err);
    }
  };

  const copyToClipboard = (template: EmailTemplate) => {
    navigator.clipboard.writeText(`Subject: ${template.subject}\n\n${template.body}`);
    setCopiedId(template.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter templates
  const filtered = templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !t.subject.toLowerCase().includes(search.toLowerCase())) return false;
    if (angleFilter && t.angle !== angleFilter) return false;
    return true;
  }).sort((a, b) => {
    // Starred first, then by performance
    if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
    return (b.avg_reply_rate || 0) - (a.avg_reply_rate || 0);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookTemplate className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Email Template Library</h3>
          <span className="text-xs text-gray-500">{templates.length} templates</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Template
        </button>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-gray-600"
          />
        </div>
        <select
          value={angleFilter}
          onChange={(e) => setAngleFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300"
        >
          <option value="">All Angles</option>
          {Object.entries(angleLabels).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-gray-900 border border-blue-500/30 rounded-xl p-4 space-y-3">
          <div className="text-xs font-medium text-blue-400">Create New Template</div>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Template name..."
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600"
            />
            <select
              value={newAngle}
              onChange={(e) => setNewAngle(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
            >
              {Object.entries(angleLabels).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select
              value={newTone}
              onChange={(e) => setNewTone(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="direct">Direct</option>
              <option value="casual">Casual</option>
            </select>
          </div>
          <input
            type="text"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="Subject line..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Email body..."
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={createTemplate}
              disabled={saving || !newName || !newSubject || !newBody}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save Template
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 bg-gray-800 text-gray-400 text-xs rounded-lg hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Template list */}
      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <BookTemplate className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">No templates found</p>
          <p className="text-[10px] text-gray-600 mt-1">Create one from a winning email or save from the editor</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(template => {
            const isExpanded = expandedId === template.id;

            return (
              <div key={template.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Star */}
                  <button
                    onClick={() => toggleStar(template.id)}
                    className={`shrink-0 ${template.is_starred ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}
                  >
                    <Star className="w-3.5 h-3.5" fill={template.is_starred ? 'currentColor' : 'none'} />
                  </button>

                  {/* Info */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : template.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white truncate">{template.name}</span>
                      <span className={`text-[9px] ${angleColors[template.angle] || 'text-gray-500'}`}>
                        {angleLabels[template.angle] || template.angle}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">{template.subject}</p>
                  </button>

                  {/* Performance metrics */}
                  <div className="flex items-center gap-3 shrink-0">
                    {template.avg_open_rate !== null && (
                      <div className="flex items-center gap-1">
                        <Eye className="w-3 h-3 text-cyan-400" />
                        <span className="text-[10px] text-gray-400">{template.avg_open_rate}%</span>
                      </div>
                    )}
                    {template.avg_reply_rate !== null && (
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3 text-green-400" />
                        <span className="text-[10px] text-gray-400">{template.avg_reply_rate}%</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Send className="w-3 h-3 text-gray-600" />
                      <span className="text-[10px] text-gray-600">{template.usage_count}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copyToClipboard(template)}
                      className="p-1.5 text-gray-600 hover:text-blue-400 transition-colors"
                      title="Copy to clipboard"
                    >
                      {copiedId === template.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => deleteTemplate(template.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
                      title="Delete template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setExpandedId(isExpanded ? null : template.id)}>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                    </button>
                  </div>
                </div>

                {/* Expanded preview */}
                {isExpanded && (
                  <div className="border-t border-gray-800 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-4 text-[10px] text-gray-500">
                      <span>Tone: {template.tone}</span>
                      {template.tier && <span>Tier: {template.tier}</span>}
                      <span>Created: {new Date(template.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <p className="text-xs text-white font-medium mb-2">{template.subject}</p>
                      <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{template.body}</p>
                    </div>
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

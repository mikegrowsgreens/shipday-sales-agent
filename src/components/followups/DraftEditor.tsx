'use client';

import { useState, useMemo } from 'react';
import { Save, X, Loader2, Eye, Edit3, RefreshCw, Columns, Maximize2 } from 'lucide-react';

interface DraftEditorProps {
  draftId: number;
  subject: string;
  body: string;
  onSave: (id: number, subject: string, body: string) => Promise<void>;
  onRegenerate?: (id: number) => Promise<void>;
  onClose: () => void;
}

export default function DraftEditor({ draftId, subject, body, onSave, onRegenerate, onClose }: DraftEditorProps) {
  const [editSubject, setEditSubject] = useState(subject);
  const [editBody, setEditBody] = useState(body);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [dirty, setDirty] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draftId, editSubject, editBody);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) return;
    setRegenerating(true);
    try {
      await onRegenerate(draftId);
    } finally {
      setRegenerating(false);
    }
  };

  const handleChange = (field: 'subject' | 'body', value: string) => {
    if (field === 'subject') setEditSubject(value);
    else setEditBody(value);
    setDirty(true);
  };

  const insertVariable = (variable: string) => {
    setEditBody(prev => prev + `{{${variable}}}`);
    setDirty(true);
  };

  const variables = ['contact_name', 'business_name', 'city', 'pain_points', 'demo_date'];

  // Render preview: replace variables with styled placeholders
  const renderedBody = useMemo(() => {
    return editBody.replace(/\{\{(\w+)\}\}/g, (_, v) => `[${v.replace(/_/g, ' ')}]`);
  }, [editBody]);

  const renderedSubject = useMemo(() => {
    return editSubject.replace(/\{\{(\w+)\}\}/g, (_, v) => `[${v.replace(/_/g, ' ')}]`);
  }, [editSubject]);

  const showEdit = viewMode === 'edit' || viewMode === 'split';
  const showPreview = viewMode === 'preview' || viewMode === 'split';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/50 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-300">Draft Editor</span>
          {dirty && <span className="text-[10px] text-yellow-400">unsaved</span>}
        </div>
        <div className="flex items-center gap-1">
          {/* View mode toggles */}
          <div className="flex items-center bg-gray-800 rounded p-0.5 mr-1">
            <button
              onClick={() => setViewMode('edit')}
              className={`p-1 rounded text-xs ${viewMode === 'edit' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title="Edit only"
            >
              <Edit3 className="w-3 h-3" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`p-1 rounded text-xs ${viewMode === 'split' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title="Side by side"
            >
              <Columns className="w-3 h-3" />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`p-1 rounded text-xs ${viewMode === 'preview' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title="Preview only"
            >
              <Eye className="w-3 h-3" />
            </button>
          </div>

          {onRegenerate && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="p-1.5 text-gray-400 hover:text-purple-400"
              title="Regenerate this touch"
            >
              {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1 rounded"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Variables bar */}
      {showEdit && (
        <div className="px-4 py-1.5 bg-gray-800/30 border-b border-gray-800 flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">Insert:</span>
          {variables.map(v => (
            <button
              key={v}
              onClick={() => insertVariable(v)}
              className="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white px-2 py-0.5 rounded transition-colors"
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}

      {/* Subject */}
      <div className="px-4 pt-3 pb-2">
        {showEdit && !showPreview ? (
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-1">Subject</label>
            <input
              type="text"
              value={editSubject}
              onChange={e => handleChange('subject', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        ) : showPreview && !showEdit ? (
          <div className="text-sm font-medium text-white">{renderedSubject || 'No subject'}</div>
        ) : (
          /* Split mode subject */
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-1">Subject</label>
              <input
                type="text"
                value={editSubject}
                onChange={e => handleChange('subject', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-1">Preview</label>
              <div className="px-3 py-2 text-sm font-medium text-white bg-gray-800/40 rounded border border-gray-800 min-h-[38px]">
                {renderedSubject || 'No subject'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 pb-4">
        {showEdit && !showPreview ? (
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-1">Body</label>
            <textarea
              value={editBody}
              onChange={e => handleChange('body', e.target.value)}
              rows={14}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none font-mono leading-relaxed"
            />
          </div>
        ) : showPreview && !showEdit ? (
          <div className="text-xs text-gray-300 whitespace-pre-line leading-relaxed border-t border-gray-800 pt-3">
            {renderedBody || 'No content'}
          </div>
        ) : (
          /* Split mode body */
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-1">Body</label>
              <textarea
                value={editBody}
                onChange={e => handleChange('body', e.target.value)}
                rows={14}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none font-mono leading-relaxed"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-1">Preview</label>
              <div className="bg-white rounded p-4 text-sm text-gray-800 whitespace-pre-line leading-relaxed h-[338px] overflow-y-auto">
                <div className="border-b border-gray-200 pb-2 mb-3">
                  <span className="text-xs text-gray-500">Subject: </span>
                  <span className="text-sm font-medium text-gray-900">{renderedSubject || 'No subject'}</span>
                </div>
                {renderedBody || 'No content'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

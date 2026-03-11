'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Save, X } from 'lucide-react';

interface EmailPreviewProps {
  subject: string;
  body: string;
  status?: 'draft' | 'approved' | 'sent' | 'opened' | 'replied' | 'rejected';
  editable?: boolean;
  defaultExpanded?: boolean;
  onSave?: (subject: string, body: string) => void | Promise<void>;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-600 text-gray-200',
  approved: 'bg-blue-600 text-blue-100',
  sent: 'bg-cyan-600 text-cyan-100',
  opened: 'bg-yellow-600 text-yellow-100',
  replied: 'bg-green-600 text-green-100',
  rejected: 'bg-red-600 text-red-100',
};

export default function EmailPreview({
  subject,
  body,
  status,
  editable = false,
  defaultExpanded = false,
  onSave,
}: EmailPreviewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState(subject);
  const [editBody, setEditBody] = useState(body);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(editSubject, editBody);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditSubject(subject);
    setEditBody(body);
    setEditing(false);
  };

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/80 transition-colors text-left"
      >
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
        )}
        <span className="text-sm text-white truncate flex-1">
          {subject || '(No subject)'}
        </span>
        {status && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColors[status] || statusColors.draft}`}>
            {status}
          </span>
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-700 px-4 py-3 space-y-3">
          {editing ? (
            <>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Subject</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Body</label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
                >
                  <Save className="w-3 h-3" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {body || '(No body)'}
              </div>
              {editable && onSave && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

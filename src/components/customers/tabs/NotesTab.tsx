'use client';

import { useState, useRef } from 'react';
import { Save, Loader2, Tag, X, Braces } from 'lucide-react';
import { Customer } from '@/lib/types';

interface NotesTabProps {
  customer: Customer;
  onSave: (fields: { notes?: string; tags?: string[]; custom_fields?: Record<string, unknown> }) => Promise<void>;
}

export function NotesTab({ customer, onSave }: NotesTabProps) {
  const [notes, setNotes] = useState(customer.notes || '');
  const [tags, setTags] = useState<string[]>(customer.tags || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimeout = useRef<NodeJS.Timeout>(undefined);

  const handleNotesBlur = async () => {
    if (notes === (customer.notes || '')) return;
    setSaving(true);
    try {
      await onSave({ notes });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = prompt('Enter tag name:');
    if (tag && !tags.includes(tag.trim())) {
      const updated = [...tags, tag.trim()];
      setTags(updated);
      onSave({ tags: updated });
    }
  };

  const removeTag = async (tag: string) => {
    const updated = tags.filter(t => t !== tag);
    setTags(updated);
    await onSave({ tags: updated });
  };

  const customFields = customer.custom_fields || {};
  const hasCustomFields = Object.keys(customFields).length > 0;

  return (
    <div className="space-y-5">
      {/* Notes */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">Notes</h3>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
            {saved && <span className="text-xs text-green-400">Saved</span>}
          </div>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={handleNotesBlur}
          placeholder="Add notes about this customer..."
          rows={6}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-y"
        />
      </div>

      {/* Tags */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Tags</h3>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-800 rounded-md text-xs text-gray-300">
              <Tag className="w-3 h-3 text-gray-500" />
              {tag}
              <button onClick={() => removeTag(tag)} className="text-gray-600 hover:text-gray-300 ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button onClick={addTag} className="px-2.5 py-1 text-xs text-blue-400 hover:text-blue-300 border border-dashed border-gray-700 rounded-md hover:border-blue-500/50">
            + Add Tag
          </button>
        </div>
      </div>

      {/* Custom Fields */}
      {hasCustomFields && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Braces className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-300">Custom Fields</h3>
          </div>
          <div className="space-y-2">
            {Object.entries(customFields).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-32 shrink-0">{key}</span>
                <span className="text-sm text-gray-300">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

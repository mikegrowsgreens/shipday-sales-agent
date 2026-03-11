'use client';

import { useState, useCallback } from 'react';
import {
  Pencil, Save, Loader2, RefreshCw, Eye, Code, X,
  Wand2, SlidersHorizontal, ChevronDown, ChevronUp,
} from 'lucide-react';

const angleOptions = [
  { value: 'missed_calls', label: 'Missed Calls' },
  { value: 'commission_savings', label: 'Commission Savings' },
  { value: 'delivery_ops', label: 'Delivery Ops' },
  { value: 'tech_consolidation', label: 'Tech Stack' },
  { value: 'customer_experience', label: 'Customer Experience' },
];

const toneOptions = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'direct', label: 'Direct' },
  { value: 'casual', label: 'Casual' },
  { value: 'witty', label: 'Witty' },
];

const lengthOptions = [
  { value: 'short', label: 'Short (2-3 sentences)' },
  { value: 'medium', label: 'Medium (4-6 sentences)' },
  { value: 'long', label: 'Long (7+ sentences)' },
];

interface CampaignEditorProps {
  leadId: number;
  businessName: string;
  contactName: string;
  initialSubject: string;
  initialBody: string;
  initialAngle?: string;
  onSave?: (subject: string, body: string) => void;
  onClose?: () => void;
}

export default function CampaignEditor({
  leadId,
  businessName,
  contactName,
  initialSubject,
  initialBody,
  initialAngle,
  onSave,
  onClose,
}: CampaignEditorProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [angle, setAngle] = useState(initialAngle || 'missed_calls');
  const [tone, setTone] = useState('professional');
  const [length, setLength] = useState('medium');
  const [customInstructions, setCustomInstructions] = useState('');
  const [showControls, setShowControls] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const regenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      const res = await fetch('/api/bdr/campaigns/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          angle,
          tone,
          length_preference: length,
          instructions: customInstructions || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.subject) setSubject(data.subject);
        if (data.body) setBody(data.body);
      }
    } catch (err) {
      console.error('[CampaignEditor] regenerate error:', err);
    } finally {
      setRegenerating(false);
    }
  }, [leadId, angle, tone, length, customInstructions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to backend
      await fetch('/api/bdr/campaigns/action', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          email_subject: subject,
          email_body: body,
        }),
      });
      onSave?.(subject, body);
    } catch (err) {
      console.error('[CampaignEditor] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Render body as HTML-safe email preview
  const renderPreview = () => {
    // Simple paragraph/line-break rendering
    const paragraphs = body.split(/\n\n+/);
    return paragraphs.map((p, i) => {
      const lines = p.split('\n');
      return (
        <p key={i} className="mb-3 last:mb-0">
          {lines.map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      );
    });
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800">
        <Pencil className="w-4 h-4 text-blue-400" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-white">Email Editor</span>
          <span className="text-xs text-gray-500 ml-2">{businessName}</span>
        </div>

        {/* View toggle */}
        <div className="flex gap-0.5 bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('edit')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'edit' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Code className="w-3 h-3" />
            Edit
          </button>
          <button
            onClick={() => setViewMode('preview')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'preview' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
        </div>

        {onClose && (
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* AI Controls toggle */}
        <button
          onClick={() => setShowControls(!showControls)}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          AI Generation Controls
          {showControls ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* AI Controls panel */}
        {showControls && (
          <div className="grid grid-cols-3 gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-800">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Angle</label>
              <select
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300"
              >
                {angleOptions.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Tone</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300"
              >
                {toneOptions.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Length</label>
              <select
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300"
              >
                {lengthOptions.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              <label className="block text-[10px] text-gray-500 mb-1">Custom instructions (optional)</label>
              <input
                type="text"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g., Mention their Google reviews, reference their delivery volume..."
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder:text-gray-600"
              />
            </div>
            <div className="col-span-3">
              <button
                onClick={regenerate}
                disabled={regenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
              >
                {regenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                {regenerating ? 'Regenerating...' : 'Regenerate with AI'}
              </button>
            </div>
          </div>
        )}

        {viewMode === 'edit' ? (
          /* Edit mode */
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
              />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-600">
              <span>{body.split(/\s+/).filter(Boolean).length} words</span>
              <span>·</span>
              <span>{body.length} chars</span>
              <span>·</span>
              <span>{body.split(/\n/).length} lines</span>
            </div>
          </div>
        ) : (
          /* Preview mode - rendered email */
          <div className="bg-white rounded-lg overflow-hidden border border-gray-300">
            {/* Email header */}
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-12">From:</span>
                <span className="text-xs text-gray-700">Mike Paulus &lt;mike@saleshub.com&gt;</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-12">To:</span>
                <span className="text-xs text-gray-700">{contactName} &lt;{businessName.toLowerCase().replace(/\s+/g, '')}@email.com&gt;</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-12">Subject:</span>
                <span className="text-xs text-gray-900 font-semibold">{subject}</span>
              </div>
            </div>
            {/* Email body */}
            <div className="px-6 py-5 text-sm text-gray-800 leading-relaxed">
              {renderPreview()}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs rounded-lg transition-colors"
          >
            {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Regenerate
          </button>
          <div className="flex-1" />
          <span className="text-[10px] text-gray-600">
            {angleOptions.find(a => a.value === angle)?.label} · {tone}
          </span>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Loader2, Clock, MapPin, Shield, Brain,
  Plus, Trash2, GripVertical, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import type { SchedulingEventType } from '@/lib/types';

interface CustomQuestion {
  type: 'text' | 'textarea' | 'select' | 'radio';
  label: string;
  required: boolean;
  options?: string[];
}

const COLORS = [
  { value: '#3b82f6', class: 'bg-blue-500' },
  { value: '#22c55e', class: 'bg-green-500' },
  { value: '#a855f7', class: 'bg-purple-500' },
  { value: '#ef4444', class: 'bg-red-500' },
  { value: '#f97316', class: 'bg-orange-500' },
  { value: '#06b6d4', class: 'bg-cyan-500' },
  { value: '#ec4899', class: 'bg-pink-500' },
  { value: '#eab308', class: 'bg-yellow-500' },
];

const DURATIONS = [15, 20, 30, 45, 60, 90, 120];

export default function EditEventTypePage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    duration_minutes: 30,
    color: 'blue',
    location_type: 'google_meet',
    location_value: '',
    buffer_before: 0,
    buffer_after: 0,
    min_notice: 60,
    max_days_ahead: 60,
    max_per_day: 0,
    ai_agenda_enabled: false,
    is_active: true,
  });

  const [questions, setQuestions] = useState<CustomQuestion[]>([]);

  const fetchEventType = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheduling/event-types/${params.id}`);
      if (!res.ok) {
        addToast('Event type not found', 'error');
        router.push('/calendar/event-types');
        return;
      }
      const et: SchedulingEventType = await res.json();
      setForm({
        name: et.name,
        slug: et.slug,
        description: et.description || '',
        duration_minutes: et.duration_minutes,
        color: et.color,
        location_type: et.location_type,
        location_value: et.location_value || '',
        buffer_before: et.buffer_before,
        buffer_after: et.buffer_after,
        min_notice: et.min_notice,
        max_days_ahead: et.max_days_ahead,
        max_per_day: et.max_per_day || 0,
        ai_agenda_enabled: et.ai_agenda_enabled,
        is_active: et.is_active,
      });
      setQuestions(et.custom_questions || []);
    } catch {
      addToast('Failed to load event type', 'error');
    } finally {
      setLoading(false);
    }
  }, [params.id, router, addToast]);

  useEffect(() => { fetchEventType(); }, [fetchEventType]);

  function updateField(field: string, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function addQuestion() {
    setQuestions(prev => [...prev, { type: 'text', label: '', required: false }]);
  }

  function updateQuestion(idx: number, updates: Partial<CustomQuestion>) {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, ...updates } : q));
  }

  function removeQuestion(idx: number) {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.slug) {
      addToast('Name and slug are required', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/scheduling/event-types/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          max_per_day: form.max_per_day || null,
          custom_questions: questions.filter(q => q.label.trim()),
        }),
      });

      if (res.ok) {
        addToast('Event type updated', 'success');
        router.push('/calendar/event-types');
      } else {
        const data = await res.json();
        addToast(data.error || 'Failed to update', 'error');
      }
    } catch {
      addToast('Failed to update event type', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/calendar/event-types" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Edit Event Type</h1>
            <p className="text-gray-400 text-sm">{form.name}</p>
          </div>
        </div>
        <a
          href={`/book/${form.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ExternalLink className="w-4 h-4" /> Preview
        </a>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Section title="Basic Information">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">URL Slug *</label>
              <input
                type="text"
                value={form.slug}
                onChange={e => updateField('slug', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => updateField('description', e.target.value)}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Color picker */}
          <div className="mt-3">
            <label className="block text-sm text-gray-400 mb-2">Color</label>
            <div className="flex items-center gap-2">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => updateField('color', c.value)}
                  className={`w-7 h-7 rounded-full ${c.class} transition-all ${
                    form.color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900' : 'opacity-50 hover:opacity-80'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Active toggle */}
          <div className="mt-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => updateField('is_active', e.target.checked)}
                className="rounded border-gray-600 w-4 h-4"
              />
              <span className="text-sm text-gray-300">Active (accepting bookings)</span>
            </label>
          </div>
        </Section>

        {/* Duration & Location */}
        <Section title="Duration & Location" icon={Clock}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Duration</label>
              <select
                value={form.duration_minutes}
                onChange={e => updateField('duration_minutes', parseInt(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              >
                {DURATIONS.map(d => (
                  <option key={d} value={d}>{d} minutes</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Location</label>
              <select
                value={form.location_type}
                onChange={e => updateField('location_type', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              >
                <option value="google_meet">Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="phone">Phone Call</option>
                <option value="in_person">In Person</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {(form.location_type === 'in_person' || form.location_type === 'custom') && (
            <div className="mt-3">
              <label className="block text-sm text-gray-400 mb-1">
                {form.location_type === 'in_person' ? 'Address' : 'Custom Location Details'}
              </label>
              <input
                type="text"
                value={form.location_value}
                onChange={e => updateField('location_value', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}
        </Section>

        {/* Scheduling Rules */}
        <Section title="Scheduling Rules" icon={Shield}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Buffer Before (min)</label>
              <input type="number" value={form.buffer_before} onChange={e => updateField('buffer_before', parseInt(e.target.value) || 0)} min={0}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Buffer After (min)</label>
              <input type="number" value={form.buffer_after} onChange={e => updateField('buffer_after', parseInt(e.target.value) || 0)} min={0}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Minimum Notice (min)</label>
              <input type="number" value={form.min_notice} onChange={e => updateField('min_notice', parseInt(e.target.value) || 0)} min={0}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Days Ahead</label>
              <input type="number" value={form.max_days_ahead} onChange={e => updateField('max_days_ahead', parseInt(e.target.value) || 30)} min={1}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Per Day (0 = unlimited)</label>
              <input type="number" value={form.max_per_day} onChange={e => updateField('max_per_day', parseInt(e.target.value) || 0)} min={0}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500" />
            </div>
          </div>
        </Section>

        {/* Custom Questions */}
        <Section title="Custom Questions">
          <p className="text-xs text-gray-500 mb-3">Add questions for invitees to answer when booking</p>

          {questions.map((q, idx) => (
            <div key={idx} className="flex items-start gap-3 mb-3 bg-gray-800/50 rounded-lg p-3">
              <GripVertical className="w-4 h-4 text-gray-600 mt-2 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={q.label}
                    onChange={e => updateQuestion(idx, { label: e.target.value })}
                    placeholder="Question text"
                    className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  />
                  <select
                    value={q.type}
                    onChange={e => updateQuestion(idx, { type: e.target.value as CustomQuestion['type'] })}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="text">Short Text</option>
                    <option value="textarea">Long Text</option>
                    <option value="select">Dropdown</option>
                    <option value="radio">Radio</option>
                  </select>
                </div>
                {(q.type === 'select' || q.type === 'radio') && (
                  <input
                    type="text"
                    value={(q.options || []).join(', ')}
                    onChange={e => updateQuestion(idx, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })}
                    placeholder="Options (comma separated)"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  />
                )}
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input type="checkbox" checked={q.required} onChange={e => updateQuestion(idx, { required: e.target.checked })} className="rounded border-gray-600" />
                  Required
                </label>
              </div>
              <button type="button" onClick={() => removeQuestion(idx)} className="text-gray-500 hover:text-red-400 mt-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <button type="button" onClick={addQuestion}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Question
          </button>
        </Section>

        {/* AI Agenda */}
        <Section title="AI Agenda" icon={Brain}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.ai_agenda_enabled} onChange={e => updateField('ai_agenda_enabled', e.target.checked)}
              className="rounded border-gray-600 w-4 h-4" />
            <div>
              <p className="text-sm text-white">Enable AI Meeting Agenda</p>
              <p className="text-xs text-gray-500">AI will generate a meeting preparation brief based on CRM data</p>
            </div>
          </label>
        </Section>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
          <Link href="/calendar/event-types" className="text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-gray-400" />}
        {title}
      </h2>
      {children}
    </div>
  );
}

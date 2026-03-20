'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Plus, Save, Loader2, Trash2, X, Globe, Check,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { SchedulingAvailability, TimeWindow, WeeklyHours } from '@/lib/types';

type DayKey = keyof WeeklyHours;
const DAYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

const DEFAULT_HOURS: WeeklyHours = {
  monday: [{ start: '09:00', end: '17:00' }],
  tuesday: [{ start: '09:00', end: '17:00' }],
  wednesday: [{ start: '09:00', end: '17:00' }],
  thursday: [{ start: '09:00', end: '17:00' }],
  friday: [{ start: '09:00', end: '17:00' }],
  saturday: [],
  sunday: [],
};

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland',
];

export default function AvailabilityPage() {
  const [schedules, setSchedules] = useState<SchedulingAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeScheduleId, setActiveScheduleId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    timezone: string;
    is_default: boolean;
    weekly_hours: WeeklyHours;
    date_overrides: Record<string, TimeWindow[]>;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const { addToast } = useToast();

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduling/availability');
      const data = await res.json();
      const list = data.schedules || [];
      setSchedules(list);
      if (list.length > 0 && !activeScheduleId) {
        selectSchedule(list[0]);
      }
    } catch {
      addToast('Failed to load availability schedules', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  function selectSchedule(s: SchedulingAvailability) {
    setActiveScheduleId(s.availability_id);
    setEditForm({
      name: s.name,
      timezone: s.timezone,
      is_default: s.is_default,
      weekly_hours: s.weekly_hours || { ...DEFAULT_HOURS },
      date_overrides: s.date_overrides || {},
    });
    setShowNewForm(false);
  }

  function startNew() {
    setActiveScheduleId(null);
    setEditForm({
      name: 'Working Hours',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      is_default: schedules.length === 0,
      weekly_hours: { ...DEFAULT_HOURS },
      date_overrides: {},
    });
    setShowNewForm(true);
  }

  function updateDayWindows(day: DayKey, windows: TimeWindow[]) {
    if (!editForm) return;
    setEditForm({
      ...editForm,
      weekly_hours: { ...editForm.weekly_hours, [day]: windows },
    });
  }

  function addWindow(day: DayKey) {
    if (!editForm) return;
    const existing = editForm.weekly_hours[day] || [];
    const lastEnd = existing.length > 0 ? existing[existing.length - 1].end : '09:00';
    updateDayWindows(day, [...existing, { start: lastEnd, end: '17:00' }]);
  }

  function removeWindow(day: DayKey, idx: number) {
    if (!editForm) return;
    const windows = editForm.weekly_hours[day] || [];
    updateDayWindows(day, windows.filter((_: TimeWindow, i: number) => i !== idx));
  }

  function updateWindow(day: DayKey, idx: number, field: 'start' | 'end', value: string) {
    if (!editForm) return;
    const windows = [...(editForm.weekly_hours[day] || [])];
    windows[idx] = { ...windows[idx], [field]: value };
    updateDayWindows(day, windows);
  }

  function toggleDay(day: DayKey) {
    if (!editForm) return;
    const current = editForm.weekly_hours[day] || [];
    if (current.length > 0) {
      updateDayWindows(day, []);
    } else {
      updateDayWindows(day, [{ start: '09:00', end: '17:00' }]);
    }
  }

  // Date overrides
  const [overrideDate, setOverrideDate] = useState('');

  function addDateOverride() {
    if (!editForm || !overrideDate) return;
    setEditForm({
      ...editForm,
      date_overrides: { ...editForm.date_overrides, [overrideDate]: [] },
    });
    setOverrideDate('');
  }

  function removeDateOverride(date: string) {
    if (!editForm) return;
    const overrides = { ...editForm.date_overrides };
    delete overrides[date];
    setEditForm({ ...editForm, date_overrides: overrides });
  }

  async function handleSave() {
    if (!editForm) return;
    setSaving(true);
    try {
      if (showNewForm) {
        const res = await fetch('/api/scheduling/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        });
        if (res.ok) {
          addToast('Schedule created', 'success');
          setShowNewForm(false);
          fetchSchedules();
        } else {
          const data = await res.json();
          addToast(data.error || 'Failed to create', 'error');
        }
      } else if (activeScheduleId) {
        const res = await fetch(`/api/scheduling/availability/${activeScheduleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        });
        if (res.ok) {
          addToast('Schedule saved', 'success');
          fetchSchedules();
        } else {
          const data = await res.json();
          addToast(data.error || 'Failed to save', 'error');
        }
      }
    } catch {
      addToast('Failed to save schedule', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!activeScheduleId) return;
    try {
      const res = await fetch(`/api/scheduling/availability/${activeScheduleId}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('Schedule deleted', 'success');
        setActiveScheduleId(null);
        setEditForm(null);
        fetchSchedules();
      } else {
        const data = await res.json();
        addToast(data.error || 'Failed to delete', 'error');
      }
    } catch {
      addToast('Failed to delete schedule', 'error');
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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Availability</h1>
          <p className="text-gray-400 text-sm mt-1">Set your available hours for bookings</p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Schedule List */}
        <div className="space-y-2">
          {schedules.map(s => (
            <button
              key={s.availability_id}
              onClick={() => selectSchedule(s)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                activeScheduleId === s.availability_id
                  ? 'bg-blue-600/10 border-blue-500/30 text-white'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{s.name}</span>
                {s.is_default && (
                  <span className="text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded">Default</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{s.timezone}</p>
            </button>
          ))}
          {schedules.length === 0 && !showNewForm && (
            <div className="text-center py-8">
              <Clock className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No schedules yet</p>
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="col-span-3">
          {editForm ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-5">
              {/* Name & Timezone */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" /> Timezone
                  </label>
                  <select
                    value={editForm.timezone}
                    onChange={e => setEditForm({ ...editForm, timezone: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-400 pb-2">
                    <input
                      type="checkbox"
                      checked={editForm.is_default}
                      onChange={e => setEditForm({ ...editForm, is_default: e.target.checked })}
                      className="rounded border-gray-600"
                    />
                    Set as default
                  </label>
                </div>
              </div>

              {/* Weekly Hours */}
              <div>
                <h3 className="text-sm font-medium text-white mb-3">Weekly Hours</h3>
                <div className="space-y-2">
                  {DAYS.map(day => {
                    const windows = editForm.weekly_hours[day] || [];
                    const isActive = windows.length > 0;

                    return (
                      <div key={day} className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`w-12 py-1.5 rounded text-xs font-medium transition-colors shrink-0 mt-1 ${
                            isActive ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-800 text-gray-600'
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>

                        {isActive ? (
                          <div className="flex-1 space-y-1.5">
                            {windows.map((w, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="time"
                                  value={w.start}
                                  onChange={e => updateWindow(day, idx, 'start', e.target.value)}
                                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                                />
                                <span className="text-gray-600">-</span>
                                <input
                                  type="time"
                                  value={w.end}
                                  onChange={e => updateWindow(day, idx, 'end', e.target.value)}
                                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeWindow(day, idx)}
                                  className="text-gray-600 hover:text-red-400"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addWindow(day)}
                              className="text-xs text-gray-500 hover:text-blue-400 flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Add window
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600 mt-1.5">Unavailable</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Date Overrides */}
              <div>
                <h3 className="text-sm font-medium text-white mb-3">Date Overrides</h3>
                <p className="text-xs text-gray-500 mb-3">Mark specific dates as unavailable</p>

                {Object.keys(editForm.date_overrides).length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {Object.entries(editForm.date_overrides).map(([date]) => (
                      <div key={date} className="flex items-center gap-2 bg-gray-800/50 rounded px-3 py-1.5">
                        <span className="text-sm text-gray-300">{date}</span>
                        <span className="text-xs text-red-400">Unavailable</span>
                        <button
                          type="button"
                          onClick={() => removeDateOverride(date)}
                          className="ml-auto text-gray-500 hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={overrideDate}
                    onChange={e => setOverrideDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={addDateOverride}
                    disabled={!overrideDate}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Block Date
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {showNewForm ? 'Create Schedule' : 'Save Changes'}
                </button>
                {!showNewForm && activeScheduleId && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
              <Clock className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400">Select a schedule to edit or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

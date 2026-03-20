'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, Clock, MapPin, Loader2, ToggleLeft, ToggleRight,
  Copy, Pencil, Trash2, CalendarDays, ExternalLink, Check,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { SchedulingEventType } from '@/lib/types';

const locationLabels: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  phone: 'Phone Call',
  in_person: 'In Person',
  custom: 'Custom',
};

const colorMap: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  purple: 'bg-purple-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  pink: 'bg-pink-500',
  yellow: 'bg-yellow-500',
};

export default function EventTypesPage() {
  const [eventTypes, setEventTypes] = useState<SchedulingEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const { addToast } = useToast();

  const fetchEventTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/scheduling/event-types?active=${!showInactive}`);
      const data = await res.json();
      setEventTypes(data.event_types || []);
    } catch {
      addToast('Failed to load event types', 'error');
    } finally {
      setLoading(false);
    }
  }, [showInactive, addToast]);

  useEffect(() => { fetchEventTypes(); }, [fetchEventTypes]);

  async function toggleActive(et: SchedulingEventType) {
    try {
      const res = await fetch(`/api/scheduling/event-types/${et.event_type_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !et.is_active }),
      });
      if (res.ok) {
        setEventTypes(prev => prev.map(e =>
          e.event_type_id === et.event_type_id ? { ...e, is_active: !e.is_active } : e
        ));
        addToast(`Event type ${!et.is_active ? 'activated' : 'deactivated'}`, 'success');
      }
    } catch {
      addToast('Failed to update event type', 'error');
    }
  }

  function copyBookingLink(et: SchedulingEventType) {
    const url = `${window.location.origin}/book/${et.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(et.event_type_id);
    setTimeout(() => setCopiedId(null), 2000);
    addToast('Booking link copied', 'success');
  }

  async function deleteEventType(et: SchedulingEventType) {
    try {
      const res = await fetch(`/api/scheduling/event-types/${et.event_type_id}`, { method: 'DELETE' });
      if (res.ok) {
        setEventTypes(prev => prev.filter(e => e.event_type_id !== et.event_type_id));
        addToast('Event type deactivated', 'success');
      }
    } catch {
      addToast('Failed to delete event type', 'error');
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Event Types</h1>
          <p className="text-gray-400 text-sm mt-1">Create and manage your meeting types</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </button>
          <Link
            href="/calendar/event-types/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> New Event Type
          </Link>
        </div>
      </div>

      {/* Event Types Grid */}
      {eventTypes.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
          <CalendarDays className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 text-lg">No event types yet</p>
          <p className="text-gray-500 text-sm mt-1 mb-4">Create your first event type to start accepting bookings</p>
          <Link
            href="/calendar/event-types/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Event Type
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {eventTypes.map((et) => (
            <div
              key={et.event_type_id}
              className={`bg-gray-900 border rounded-lg overflow-hidden transition-colors ${
                et.is_active ? 'border-gray-800 hover:border-gray-700' : 'border-gray-800/50 opacity-60'
              }`}
            >
              {/* Color stripe */}
              <div className={`h-1.5 ${colorMap[et.color] || 'bg-blue-500'}`} />

              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-white font-medium">{et.name}</h3>
                    {et.description && (
                      <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{et.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleActive(et)}
                    className="shrink-0 ml-2"
                    title={et.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {et.is_active ? (
                      <ToggleRight className="w-6 h-6 text-green-400" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-gray-600" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-500 mt-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {et.duration_minutes} min
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {locationLabels[et.location_type] || et.location_type}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-800">
                  <button
                    onClick={() => copyBookingLink(et)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                  >
                    {copiedId === et.event_type_id ? (
                      <><Check className="w-3.5 h-3.5 text-green-400" /> Copied</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /> Copy Link</>
                    )}
                  </button>
                  <Link
                    href={`/calendar/event-types/${et.event_type_id}`}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Link>
                  <a
                    href={`/book/${et.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Preview
                  </a>
                  <button
                    onClick={() => deleteEventType(et)}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-500/10 transition-colors ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

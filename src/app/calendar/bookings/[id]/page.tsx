'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, Calendar, Clock, Mail, Phone, Globe,
  Video, MapPin, User, ExternalLink, CheckCircle, XCircle,
  AlertTriangle, Brain, Copy, Check,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { SchedulingBooking } from '@/lib/types';

interface BookingDetail extends SchedulingBooking {
  duration_minutes?: number;
  custom_questions?: Array<{ type: string; label: string; required: boolean; options?: string[] }>;
}

const statusConfig: Record<string, { bg: string; text: string; label: string; border: string }> = {
  confirmed: { bg: 'bg-blue-600/20', text: 'text-blue-400', label: 'Confirmed', border: 'border-blue-500/20' },
  completed: { bg: 'bg-green-600/20', text: 'text-green-400', label: 'Completed', border: 'border-green-500/20' },
  cancelled: { bg: 'bg-red-600/20', text: 'text-red-400', label: 'Cancelled', border: 'border-red-500/20' },
  no_show: { bg: 'bg-yellow-600/20', text: 'text-yellow-400', label: 'No Show', border: 'border-yellow-500/20' },
  rescheduled: { bg: 'bg-purple-600/20', text: 'text-purple-400', label: 'Rescheduled', border: 'border-purple-500/20' },
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchBooking = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheduling/bookings/${params.id}`);
      if (!res.ok) {
        addToast('Booking not found', 'error');
        router.push('/calendar/bookings');
        return;
      }
      const data = await res.json();
      setBooking(data);
    } catch {
      addToast('Failed to load booking', 'error');
    } finally {
      setLoading(false);
    }
  }, [params.id, router, addToast]);

  useEffect(() => { fetchBooking(); }, [fetchBooking]);

  async function updateStatus(newStatus: string) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/scheduling/bookings/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setBooking(updated);
        addToast(`Booking marked as ${newStatus.replace('_', ' ')}`, 'success');
      } else {
        addToast('Failed to update booking', 'error');
      }
    } catch {
      addToast('Failed to update booking', 'error');
    } finally {
      setUpdating(false);
    }
  }

  function copyMeetingUrl() {
    if (booking?.meeting_url) {
      navigator.clipboard.writeText(booking.meeting_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!booking) return null;

  const sc = statusConfig[booking.status] || statusConfig.confirmed;
  const answers = booking.answers || {};
  const hasAnswers = Object.keys(answers).length > 0;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/calendar/bookings" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Booking Details</h1>
            <p className="text-gray-400 text-sm">
              {booking.event_type_name} with {booking.invitee_name}
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-lg text-sm font-medium ${sc.bg} ${sc.text} border ${sc.border}`}>
          {sc.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="col-span-2 space-y-4">
          {/* Date/Time Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Meeting Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={Calendar} label="Date">
                {new Date(booking.starts_at).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
              </InfoRow>
              <InfoRow icon={Clock} label="Time">
                {new Date(booking.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {' - '}
                {new Date(booking.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {booking.duration_minutes && (
                  <span className="text-gray-500 ml-1">({booking.duration_minutes} min)</span>
                )}
              </InfoRow>
              <InfoRow icon={Globe} label="Timezone">{booking.invitee_timezone}</InfoRow>
              <InfoRow icon={Video} label="Location">
                {booking.meeting_url ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={booking.meeting_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      Join Meeting <ExternalLink className="w-3 h-3" />
                    </a>
                    <button onClick={copyMeetingUrl} className="text-gray-500 hover:text-white">
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ) : (
                  <span className="capitalize">{booking.location_type.replace('_', ' ')}</span>
                )}
              </InfoRow>
            </div>
          </div>

          {/* Custom Question Answers */}
          {hasAnswers && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Booking Answers</h2>
              <div className="space-y-3">
                {Object.entries(answers).map(([question, answer]) => (
                  <div key={question}>
                    <p className="text-xs text-gray-500">{question}</p>
                    <p className="text-sm text-gray-300 mt-0.5">{String(answer)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Agenda */}
          {booking.ai_agenda && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" /> AI Meeting Agenda
              </h2>
              <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {booking.ai_agenda}
              </div>
            </div>
          )}

          {/* Cancel Reason */}
          {booking.cancel_reason && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
              <p className="text-xs text-red-400 font-medium mb-1">Cancellation Reason</p>
              <p className="text-sm text-gray-300">{booking.cancel_reason}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Invitee Info */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Invitee</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-sm text-white">{booking.invitee_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                <a href={`mailto:${booking.invitee_email}`} className="text-sm text-blue-400 hover:text-blue-300">
                  {booking.invitee_email}
                </a>
              </div>
              {booking.invitee_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                  <span className="text-sm text-gray-300">{booking.invitee_phone}</span>
                </div>
              )}
              {booking.contact_id && (
                <Link
                  href={`/contacts/${booking.contact_id}`}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mt-2"
                >
                  View in CRM <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>

          {/* Host Info */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Host</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-sm text-white">{booking.host_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-sm text-gray-400">{booking.host_email}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Actions</h2>
            <div className="space-y-2">
              {booking.status === 'confirmed' && (
                <>
                  <button
                    onClick={() => updateStatus('completed')}
                    disabled={updating}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-400 hover:bg-green-500/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" /> Mark Completed
                  </button>
                  <button
                    onClick={() => updateStatus('no_show')}
                    disabled={updating}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <AlertTriangle className="w-4 h-4" /> Mark No-Show
                  </button>
                  <button
                    onClick={() => updateStatus('cancelled')}
                    disabled={updating}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> Cancel Booking
                  </button>
                </>
              )}
              {booking.status === 'cancelled' && (
                <button
                  onClick={() => updateStatus('confirmed')}
                  disabled={updating}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" /> Re-confirm
                </button>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="text-xs text-gray-600 space-y-1 px-1">
            <p>Booking ID: {booking.booking_id}</p>
            <p>Created: {new Date(booking.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(booking.updated_at).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 flex items-center gap-1 mb-0.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </p>
      <p className="text-sm text-gray-300">{children}</p>
    </div>
  );
}

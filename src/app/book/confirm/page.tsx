'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, Calendar, Clock, Video, Phone, MapPin, Monitor, Download, ExternalLink } from 'lucide-react';

interface BookingData {
  booking_id: number;
  invitee_name: string;
  invitee_email: string;
  invitee_timezone: string;
  starts_at: string;
  ends_at: string;
  status: string;
  meeting_url: string | null;
  cancel_token: string;
  event_name: string;
  event_slug: string;
  duration_minutes: number;
  location_type: string;
  host_name: string;
  host_email: string;
  org_name: string;
  org_slug: string;
  logo_url: string | null;
  primary_color: string;
  app_name: string;
}

const locationLabels: Record<string, string> = {
  google_meet: 'Google Meet', zoom: 'Zoom', phone: 'Phone Call',
  in_person: 'In Person', custom: 'Custom',
};

const locationIcons: Record<string, typeof Video> = {
  google_meet: Video, zoom: Video, phone: Phone, in_person: MapPin, custom: Monitor,
};

function buildGoogleCalUrl(booking: BookingData): string {
  const start = new Date(booking.starts_at).toISOString().replace(/[-:]/g, '').replace('.000', '');
  const end = new Date(booking.ends_at).toISOString().replace(/[-:]/g, '').replace('.000', '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: booking.event_name,
    dates: `${start}/${end}`,
    details: booking.meeting_url
      ? `Join: ${booking.meeting_url}\n\nWith: ${booking.host_name}`
      : `Meeting with ${booking.host_name}`,
    ctz: booking.invitee_timezone,
  });
  return `https://www.google.com/calendar/render?${params}`;
}

function buildIcsContent(booking: BookingData): string {
  const start = new Date(booking.starts_at).toISOString().replace(/[-:]/g, '').replace('.000', '');
  const end = new Date(booking.ends_at).toISOString().replace(/[-:]/g, '').replace('.000', '');
  const now = new Date().toISOString().replace(/[-:]/g, '').replace('.000', '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SalesHub//Scheduling//EN',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${booking.event_name}`,
    `DESCRIPTION:Meeting with ${booking.host_name}${booking.meeting_url ? '\\nJoin: ' + booking.meeting_url : ''}`,
    `ORGANIZER;CN=${booking.host_name}:mailto:${booking.host_email}`,
    `ATTENDEE;CN=${booking.invitee_name}:mailto:${booking.invitee_email}`,
    `UID:booking-${booking.booking_id}@saleshub`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadIcs(booking: BookingData) {
  const content = buildIcsContent(booking);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${booking.event_name.replace(/\s+/g, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ConfirmPage() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('booking_id');
  const token = searchParams.get('token');
  const isEmbed = searchParams.get('embed') === 'true';

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId || !token) {
      setError('Missing booking information');
      setLoading(false);
      return;
    }

    fetch(`/api/scheduling/public/booking?booking_id=${bookingId}&token=${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Booking not found');
        return res.json();
      })
      .then(setBooking)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Booking Not Found</h1>
          <p className="text-gray-500">{error || 'This booking could not be loaded.'}</p>
        </div>
      </div>
    );
  }

  const primaryColor = booking.primary_color || '#2563eb';
  const LocationIcon = locationIcons[booking.location_type] || Monitor;
  const startDate = new Date(booking.starts_at);

  return (
    <div className={`min-h-screen ${isEmbed ? 'bg-white' : 'bg-gray-50'} flex items-center justify-center p-4`}>
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          {/* Success icon */}
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-16 h-16" style={{ color: primaryColor }} />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">You&apos;re booked!</h1>
          <p className="text-gray-500 mb-6">
            A confirmation email has been sent to {booking.invitee_email}
          </p>

          {/* Booking details */}
          <div className="bg-gray-50 rounded-lg p-5 text-left space-y-3 mb-6">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Event</p>
              <p className="font-semibold text-gray-900">{booking.event_name}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>
                {startDate.toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  timeZone: booking.invitee_timezone,
                })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>
                {startDate.toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit', timeZone: booking.invitee_timezone,
                })}
                {' - '}
                {new Date(booking.ends_at).toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit', timeZone: booking.invitee_timezone,
                })}
                {' '}({booking.invitee_timezone.replace(/_/g, ' ')})
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <LocationIcon className="w-4 h-4 text-gray-400" />
              <span>{locationLabels[booking.location_type] || booking.location_type}</span>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5 mt-2">Host</p>
              <p className="text-sm text-gray-600">{booking.host_name}</p>
            </div>
          </div>

          {/* Meeting link */}
          {booking.meeting_url && (
            <a
              href={booking.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-white text-sm font-semibold mb-3"
              style={{ backgroundColor: primaryColor }}
            >
              <Video className="w-4 h-4" />
              Join Meeting
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {/* Calendar buttons */}
          <div className="flex gap-2">
            <a
              href={buildGoogleCalUrl(booking)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Calendar className="w-4 h-4" />
              Google Calendar
            </a>
            <button
              onClick={() => downloadIcs(booking)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download .ics
            </button>
          </div>

          {/* Cancel/Reschedule link */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <a
              href={`/book/cancel?booking_id=${booking.booking_id}&token=${booking.cancel_token}`}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Cancel or Reschedule
            </a>
          </div>
        </div>

        {/* Footer (hidden in embed mode) */}
        {!isEmbed && (
          <div className="text-center py-4 text-xs text-gray-400">
            Powered by {booking.app_name}
          </div>
        )}
      </div>
    </div>
  );
}

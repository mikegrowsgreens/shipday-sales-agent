/**
 * GET /api/calendar/events?start=ISO&end=ISO
 *
 * Unified calendar endpoint that fetches events from three sources:
 * 1. Google Calendar events (via OAuth connection)
 * 2. SalesHub scheduling bookings
 * 3. BDR scheduled/sent emails
 *
 * Returns all events normalized into UnifiedCalendarEvent format,
 * with deduplication for bookings that also appear in Google Calendar.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/route-auth';
import { query, queryOne } from '@/lib/db';
import { listEvents, type GoogleCalendarEvent } from '@/lib/google-calendar';
import type { CalendarConnection, UnifiedCalendarEvent } from '@/lib/types';

export const GET = withAuth(async (request, { tenant, orgId }) => {
  try {
    const { searchParams } = request.nextUrl;
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json(
        { error: 'start and end query parameters are required (ISO 8601)' },
        { status: 400 }
      );
    }

    const userId = tenant.user_id;

    // Fetch from all three sources in parallel
    const [googleEvents, bookings, sends] = await Promise.all([
      fetchGoogleEvents(orgId, userId, start, end),
      fetchBookings(orgId, start, end),
      fetchScheduledSends(orgId, start, end),
    ]);

    // Get google_event_ids from bookings for deduplication
    const bookingGoogleEventIds = new Set(
      bookings
        .filter(b => b.metadata?.google_event_id)
        .map(b => b.metadata!.google_event_id as string)
    );

    // Filter out Google events that are already represented as bookings
    const dedupedGoogleEvents = googleEvents.filter(
      e => !bookingGoogleEventIds.has(e.id)
    );

    return NextResponse.json({
      events: [...dedupedGoogleEvents, ...bookings, ...sends],
      google_connected: googleEvents.length > 0 || await hasGoogleConnection(orgId, userId),
      counts: {
        google: dedupedGoogleEvents.length,
        bookings: bookings.length,
        sends: sends.length,
      },
    });
  } catch (error) {
    console.error('[calendar/events] error:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 });
  }
});

// ─── Google Calendar Events ──────────────────────────────────────────────

async function fetchGoogleEvents(
  orgId: number,
  userId: number,
  start: string,
  end: string
): Promise<UnifiedCalendarEvent[]> {
  try {
    const connection = await queryOne<CalendarConnection>(
      `SELECT * FROM crm.calendar_connections
       WHERE org_id = $1 AND user_id = $2 AND provider = 'google' AND is_active = true`,
      [orgId, userId]
    );

    if (!connection) return [];

    const events = await listEvents(connection, start, end);

    return events.map((e: GoogleCalendarEvent) => {
      const startStr = e.start.dateTime || e.start.date || start;
      const endStr = e.end.dateTime || e.end.date || end;
      const isAllDay = !e.start.dateTime;
      const meetLink = e.conferenceData?.entryPoints?.find(
        ep => ep.entryPointType === 'video'
      )?.uri;

      return {
        id: `google-${e.id}`,
        source: 'google' as const,
        title: e.summary || '(No title)',
        description: e.description,
        start: startStr,
        end: endStr,
        allDay: isAllDay,
        color: '#64748b', // slate-500
        url: e.htmlLink,
        meetingUrl: meetLink,
        status: e.status,
        metadata: {
          google_event_id: e.id,
          organizer: e.organizer?.email,
          attendeeCount: e.attendees?.length || 0,
          recurringEventId: e.recurringEventId,
        },
      };
    });
  } catch (error) {
    console.error('[calendar/events] Google Calendar fetch failed:', error);
    return []; // Graceful fallback
  }
}

// ─── SalesHub Bookings ───────────────────────────────────────────────────

async function fetchBookings(
  orgId: number,
  start: string,
  end: string
): Promise<UnifiedCalendarEvent[]> {
  try {
    const bookings = await query<{
      booking_id: number;
      event_type_name: string;
      invitee_name: string;
      invitee_email: string;
      starts_at: string;
      ends_at: string;
      status: string;
      location_type: string;
      meeting_url: string | null;
      google_event_id: string | null;
      color: string;
    }>(
      `SELECT
        b.booking_id, et.name as event_type_name,
        b.invitee_name, b.invitee_email,
        b.starts_at, b.ends_at, b.status,
        b.location_type, b.meeting_url, b.google_event_id,
        et.color
       FROM crm.scheduling_bookings b
       JOIN crm.scheduling_event_types et ON et.event_type_id = b.event_type_id
       WHERE b.org_id = $1
         AND b.starts_at >= $2::timestamptz
         AND b.starts_at <= $3::timestamptz
         AND b.status != 'cancelled'
       ORDER BY b.starts_at ASC`,
      [orgId, start, end]
    );

    return bookings.map(b => ({
      id: `booking-${b.booking_id}`,
      source: 'booking' as const,
      title: `${b.event_type_name} — ${b.invitee_name}`,
      description: b.invitee_email,
      start: b.starts_at,
      end: b.ends_at,
      allDay: false,
      color: b.color || '#3b82f6', // blue-500
      url: `/calendar/bookings/${b.booking_id}`,
      meetingUrl: b.meeting_url || undefined,
      status: b.status,
      metadata: {
        booking_id: b.booking_id,
        google_event_id: b.google_event_id,
        invitee_email: b.invitee_email,
        location_type: b.location_type,
      },
    }));
  } catch (error) {
    console.error('[calendar/events] Bookings fetch failed:', error);
    return [];
  }
}

// ─── Scheduled Sends ─────────────────────────────────────────────────────

async function fetchScheduledSends(
  orgId: number,
  start: string,
  end: string
): Promise<UnifiedCalendarEvent[]> {
  try {
    const sends = await query<{
      id: string;
      business_name: string;
      subject: string;
      scheduled_at: string;
      status: string;
    }>(
      `SELECT
        es.id,
        l.business_name,
        es.subject,
        COALESCE(es.sent_at, es.created_at) as scheduled_at,
        CASE
          WHEN es.replied THEN 'replied'
          WHEN es.open_count > 0 THEN 'opened'
          WHEN es.sent_at IS NOT NULL THEN 'sent'
          ELSE 'scheduled'
        END as status
       FROM bdr.email_sends es
       JOIN bdr.leads l ON l.lead_id = es.lead_id AND l.org_id = $3
       WHERE (es.sent_at >= $1 OR es.created_at >= $1)
         AND (es.sent_at <= $2::timestamptz OR es.created_at <= $2::timestamptz)
         AND es.org_id = $3
       ORDER BY COALESCE(es.sent_at, es.created_at) ASC`,
      [start, end, orgId]
    );

    return sends.map(s => ({
      id: `send-${s.id}`,
      source: 'send' as const,
      title: `Email: ${s.business_name}`,
      description: s.subject,
      start: s.scheduled_at,
      end: s.scheduled_at, // Sends are point-in-time
      allDay: false,
      color: '#f59e0b', // amber-500
      status: s.status,
      metadata: {
        send_id: s.id,
        business_name: s.business_name,
        subject: s.subject,
      },
    }));
  } catch (error) {
    console.error('[calendar/events] Sends fetch failed:', error);
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function hasGoogleConnection(orgId: number, userId: number): Promise<boolean> {
  const conn = await queryOne<{ connection_id: number }>(
    `SELECT connection_id FROM crm.calendar_connections
     WHERE org_id = $1 AND user_id = $2 AND provider = 'google' AND is_active = true`,
    [orgId, userId]
  );
  return !!conn;
}

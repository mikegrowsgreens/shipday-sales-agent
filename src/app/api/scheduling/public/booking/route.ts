/**
 * GET /api/scheduling/public/booking?booking_id=xxx&token=yyy
 *
 * Public endpoint returning booking details for the confirmation and cancel pages.
 * Requires both booking_id and cancel_token for security.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export async function GET(request: NextRequest) {
  const bookingId = request.nextUrl.searchParams.get('booking_id');
  const token = request.nextUrl.searchParams.get('token');

  if (!bookingId || !token) {
    return NextResponse.json({ error: 'Missing booking_id or token parameter' }, { status: 400 });
  }

  const booking = await queryOne<{
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
    event_type_id: number;
  }>(
    `SELECT
       b.booking_id,
       b.invitee_name,
       b.invitee_email,
       b.invitee_timezone,
       b.starts_at,
       b.ends_at,
       b.status,
       b.meeting_url,
       b.cancel_token,
       et.name AS event_name,
       et.slug AS event_slug,
       et.duration_minutes,
       et.location_type,
       et.event_type_id,
       COALESCE(u.display_name, u.email) AS host_name,
       u.email AS host_email,
       o.name AS org_name,
       o.slug AS org_slug,
       COALESCE((o.settings->'branding'->>'logo_url'), '') AS logo_url,
       COALESCE((o.settings->'branding'->>'primary_color'), '#2563eb') AS primary_color,
       COALESCE((o.settings->'branding'->>'app_name'), o.name) AS app_name
     FROM crm.scheduling_bookings b
     JOIN crm.scheduling_event_types et ON et.event_type_id = b.event_type_id
     JOIN crm.organizations o ON o.org_id = b.org_id
     JOIN crm.users u ON u.user_id = b.host_user_id
     WHERE b.booking_id = $1 AND b.cancel_token = $2`,
    [parseInt(bookingId), token],
  );

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  return NextResponse.json(booking);
}

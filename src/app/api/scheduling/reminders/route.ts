/**
 * POST /api/scheduling/reminders — Send booking reminders.
 *
 * Called by n8n cron every 15 minutes.
 * Queries bookings needing 24h or 1h reminders, sends them, updates flags.
 *
 * Auth: API key (Bearer sk_...) or internal cron secret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { sendBookingReminder } from '@/lib/scheduling-emails';
import { authenticateApiKey } from '@/lib/api-auth';
import type { SchedulingBooking, SchedulingEventType } from '@/lib/types';

interface BookingWithHost extends SchedulingBooking {
  host_name: string;
  host_email: string;
  event_type_name: string;
}

export async function POST(request: NextRequest) {
  // Auth: API key or cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('Authorization');

  if (authHeader?.startsWith('Bearer sk_')) {
    const auth = await authenticateApiKey(request);
    if (!auth) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
  } else if (cronSecret) {
    const providedSecret = authHeader?.replace('Bearer ', '');
    if (providedSecret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    return NextResponse.json({ error: 'No auth configured' }, { status: 401 });
  }

  try {
    const results = { sent_24h: 0, sent_1h: 0, errors: 0 };

    // ── 24-hour reminders ─────────────────────────────────────────────────
    // Find bookings starting in 23-25 hours that haven't had 24h reminder
    const bookings24h = await query<BookingWithHost>(
      `SELECT b.*, u.name AS host_name, u.email AS host_email, et.name AS event_type_name
       FROM crm.scheduling_bookings b
       JOIN public.users u ON u.user_id = b.host_user_id
       JOIN crm.scheduling_event_types et ON et.event_type_id = b.event_type_id
       WHERE b.status = 'confirmed'
         AND b.reminder_24h_sent = false
         AND b.starts_at > NOW() + INTERVAL '23 hours'
         AND b.starts_at <= NOW() + INTERVAL '25 hours'`,
    );

    for (const booking of bookings24h) {
      try {
        const eventType = await queryOne<SchedulingEventType>(
          `SELECT * FROM crm.scheduling_event_types WHERE event_type_id = $1`,
          [booking.event_type_id],
        );
        if (!eventType) continue;

        const orgInfo = await queryOne<{ org_name: string; org_slug: string; settings: Record<string, unknown> }>(
          `SELECT name AS org_name, slug AS org_slug, settings FROM crm.organizations WHERE org_id = $1`,
          [booking.org_id],
        );
        if (!orgInfo) continue;

        const branding = (orgInfo.settings?.branding || {}) as Record<string, string>;
        const org = {
          org_id: booking.org_id,
          org_name: orgInfo.org_name,
          org_slug: orgInfo.org_slug,
          logo_url: branding.logo_url || null,
          primary_color: branding.primary_color || '#2563eb',
          app_name: branding.app_name || orgInfo.org_name,
        };

        await sendBookingReminder(booking, eventType, org, '24h');
        await query(
          `UPDATE crm.scheduling_bookings SET reminder_24h_sent = true WHERE booking_id = $1`,
          [booking.booking_id],
        );
        results.sent_24h++;
      } catch (err) {
        console.error(`[reminders] 24h reminder failed for booking ${booking.booking_id}:`, err);
        results.errors++;
      }
    }

    // ── 1-hour reminders ──────────────────────────────────────────────────
    // Find bookings starting in 45min-75min that haven't had 1h reminder
    const bookings1h = await query<BookingWithHost>(
      `SELECT b.*, u.name AS host_name, u.email AS host_email, et.name AS event_type_name
       FROM crm.scheduling_bookings b
       JOIN public.users u ON u.user_id = b.host_user_id
       JOIN crm.scheduling_event_types et ON et.event_type_id = b.event_type_id
       WHERE b.status = 'confirmed'
         AND b.reminder_1h_sent = false
         AND b.starts_at > NOW() + INTERVAL '45 minutes'
         AND b.starts_at <= NOW() + INTERVAL '75 minutes'`,
    );

    for (const booking of bookings1h) {
      try {
        const eventType = await queryOne<SchedulingEventType>(
          `SELECT * FROM crm.scheduling_event_types WHERE event_type_id = $1`,
          [booking.event_type_id],
        );
        if (!eventType) continue;

        const orgInfo = await queryOne<{ org_name: string; org_slug: string; settings: Record<string, unknown> }>(
          `SELECT name AS org_name, slug AS org_slug, settings FROM crm.organizations WHERE org_id = $1`,
          [booking.org_id],
        );
        if (!orgInfo) continue;

        const branding = (orgInfo.settings?.branding || {}) as Record<string, string>;
        const org = {
          org_id: booking.org_id,
          org_name: orgInfo.org_name,
          org_slug: orgInfo.org_slug,
          logo_url: branding.logo_url || null,
          primary_color: branding.primary_color || '#2563eb',
          app_name: branding.app_name || orgInfo.org_name,
        };

        await sendBookingReminder(booking, eventType, org, '1h');
        await query(
          `UPDATE crm.scheduling_bookings SET reminder_1h_sent = true WHERE booking_id = $1`,
          [booking.booking_id],
        );
        results.sent_1h++;
      } catch (err) {
        console.error(`[reminders] 1h reminder failed for booking ${booking.booking_id}:`, err);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      total_processed: bookings24h.length + bookings1h.length,
    });
  } catch (err) {
    console.error('[api/scheduling/reminders] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

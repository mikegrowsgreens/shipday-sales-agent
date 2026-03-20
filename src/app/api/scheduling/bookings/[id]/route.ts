/**
 * GET /api/scheduling/bookings/[id] — Full booking detail.
 * PATCH /api/scheduling/bookings/[id] — Update booking status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';
import { fireBookingStatusWebhook } from '@/lib/scheduling-webhooks';
import type { SchedulingBooking } from '@/lib/types';

// GET — full booking detail with event type and host info
export const GET = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = parseInt(params?.id || '');
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 });
    }

    const booking = await queryOne<SchedulingBooking>(
      `SELECT b.*,
              et.name AS event_type_name,
              et.duration_minutes,
              et.custom_questions,
              u.display_name AS host_name,
              u.email AS host_email
       FROM crm.scheduling_bookings b
       JOIN crm.scheduling_event_types et ON b.event_type_id = et.event_type_id
       JOIN crm.users u ON b.host_user_id = u.user_id
       WHERE b.booking_id = $1 AND b.org_id = $2`,
      [id, orgId]
    );

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    return NextResponse.json(booking);
  } catch (error) {
    console.error('[scheduling/bookings/id] GET error:', error);
    return NextResponse.json({ error: 'Failed to load booking' }, { status: 500 });
  }
});

// PATCH — update booking status (mark completed, no-show, etc.)
export const PATCH = withAuth(async (request, { orgId, params }) => {
  try {
    const id = parseInt(params?.id || '');
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 });
    }

    const body = await request.json();
    const { status, cancel_reason } = body;

    const validStatuses = ['confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify booking exists and belongs to org
    const existing = await queryOne<SchedulingBooking>(
      `SELECT * FROM crm.scheduling_bookings WHERE booking_id = $1 AND org_id = $2`,
      [id, orgId]
    );
    if (!existing) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const sets: string[] = ['status = $1', 'updated_at = NOW()'];
    const values: unknown[] = [status];
    let idx = 2;

    if (cancel_reason !== undefined) {
      sets.push(`cancel_reason = $${idx++}`);
      values.push(cancel_reason);
    }

    values.push(id, orgId);
    const updated = await queryOne<SchedulingBooking>(
      `UPDATE crm.scheduling_bookings
       SET ${sets.join(', ')}
       WHERE booking_id = $${idx} AND org_id = $${idx + 1}
       RETURNING *`,
      values
    );

    // Fire webhook for status changes (async)
    if ((status === 'completed' || status === 'no_show') && updated) {
      fireBookingStatusWebhook(updated.booking_id, status).catch(err => {
        console.error('[scheduling/bookings] Webhook error:', err);
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[scheduling/bookings/id] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
  }
});

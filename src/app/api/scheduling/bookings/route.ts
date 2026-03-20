/**
 * GET /api/scheduling/bookings — List bookings with filters.
 * POST /api/scheduling/bookings — Admin manual booking creation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';
import { createBooking, BookingError } from '@/lib/scheduling';
import type { SchedulingBooking } from '@/lib/types';

// GET — list bookings with filters (date range, status, host, search)
export const GET = withAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const hostId = searchParams.get('host_id');
    const eventTypeId = searchParams.get('event_type_id');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const sort = searchParams.get('sort') || 'starts_at';
    const order = searchParams.get('order') || 'DESC';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = ['b.org_id = $1'];
    const params: unknown[] = [orgId];
    let paramIdx = 2;

    if (status && status !== 'all') {
      conditions.push(`b.status = $${paramIdx++}`);
      params.push(status);
    }

    if (hostId) {
      conditions.push(`b.host_user_id = $${paramIdx++}`);
      params.push(parseInt(hostId));
    }

    if (eventTypeId) {
      conditions.push(`b.event_type_id = $${paramIdx++}`);
      params.push(parseInt(eventTypeId));
    }

    if (dateFrom) {
      conditions.push(`b.starts_at >= $${paramIdx++}::timestamptz`);
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push(`b.starts_at <= $${paramIdx++}::timestamptz`);
      params.push(dateTo);
    }

    if (search) {
      conditions.push(`(
        b.invitee_name ILIKE $${paramIdx} OR
        b.invitee_email ILIKE $${paramIdx}
      )`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const allowedSorts = ['starts_at', 'created_at', 'invitee_name', 'status'];
    const sortCol = allowedSorts.includes(sort) ? `b.${sort}` : 'b.starts_at';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    const bookings = await query<SchedulingBooking>(
      `SELECT b.*,
              et.name AS event_type_name,
              u.display_name AS host_name,
              u.email AS host_email
       FROM crm.scheduling_bookings b
       JOIN crm.scheduling_event_types et ON b.event_type_id = et.event_type_id
       JOIN crm.users u ON b.host_user_id = u.user_id
       ${where}
       ORDER BY ${sortCol} ${sortOrder}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM crm.scheduling_bookings b
       ${where}`,
      params
    );

    return NextResponse.json({
      bookings,
      total: parseInt(countResult?.count || '0'),
      limit,
      offset,
    });
  } catch (error) {
    console.error('[scheduling/bookings] GET error:', error);
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
  }
});

// POST — admin manual booking creation (on behalf of invitee)
export const POST = withAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();

    // Require event_type_id, starts_at, timezone, name, email
    const { event_type_id, starts_at, timezone, name, email, phone, answers } = body;

    if (!event_type_id || !starts_at || !timezone || !name || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: event_type_id, starts_at, timezone, name, email' },
        { status: 400 }
      );
    }

    // Validate the event type belongs to this org
    const eventType = await queryOne<{ event_type_id: number }>(
      `SELECT event_type_id FROM crm.scheduling_event_types
       WHERE event_type_id = $1 AND org_id = $2`,
      [event_type_id, orgId]
    );
    if (!eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    const result = await createBooking({
      event_type_id,
      starts_at,
      timezone,
      name,
      email,
      phone: phone || null,
      answers: answers || {},
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[scheduling/bookings] POST error:', err);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
});

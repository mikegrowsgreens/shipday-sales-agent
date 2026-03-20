/**
 * GET /api/scheduling/event-types — List all event types for the org.
 * POST /api/scheduling/event-types — Create a new event type.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';
import { createEventTypeSchema } from '@/lib/validators/scheduling';
import type { SchedulingEventType } from '@/lib/types';

// GET — list all event types for the org
export const GET = withAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get('active') !== 'false';

    const conditions: string[] = ['et.org_id = $1'];
    const params: unknown[] = [orgId];

    if (activeOnly) {
      conditions.push('et.is_active = true');
    }

    const eventTypes = await query<SchedulingEventType>(
      `SELECT et.*,
              u.display_name AS host_name,
              u.email AS host_email
       FROM crm.scheduling_event_types et
       JOIN crm.users u ON et.host_user_id = u.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY et.created_at DESC`,
      params
    );

    return NextResponse.json({ event_types: eventTypes });
  } catch (error) {
    console.error('[scheduling/event-types] GET error:', error);
    return NextResponse.json({ error: 'Failed to load event types' }, { status: 500 });
  }
});

// POST — create a new event type
export const POST = withAuth(async (request, { tenant, orgId }) => {
  try {
    const body = await request.json();
    const parsed = createEventTypeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Check slug uniqueness within org
    const existing = await queryOne<{ event_type_id: number }>(
      `SELECT event_type_id FROM crm.scheduling_event_types
       WHERE org_id = $1 AND slug = $2`,
      [orgId, data.slug]
    );
    if (existing) {
      return NextResponse.json({ error: 'An event type with this slug already exists' }, { status: 409 });
    }

    // Validate availability_id belongs to the org if provided
    if (data.availability_id) {
      const avail = await queryOne<{ availability_id: number }>(
        `SELECT availability_id FROM crm.scheduling_availability
         WHERE availability_id = $1 AND org_id = $2`,
        [data.availability_id, orgId]
      );
      if (!avail) {
        return NextResponse.json({ error: 'Availability schedule not found' }, { status: 400 });
      }
    }

    const eventType = await queryOne<SchedulingEventType>(
      `INSERT INTO crm.scheduling_event_types (
        org_id, host_user_id, availability_id,
        name, slug, description, duration_minutes, color,
        location_type, location_value,
        buffer_before, buffer_after, min_notice, max_days_ahead, max_per_day,
        custom_questions, ai_agenda_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        orgId, tenant.user_id, data.availability_id || null,
        data.name, data.slug, data.description || null,
        data.duration_minutes, data.color,
        data.location_type, data.location_value || null,
        data.buffer_before, data.buffer_after, data.min_notice,
        data.max_days_ahead, data.max_per_day || null,
        JSON.stringify(data.custom_questions), data.ai_agenda_enabled,
      ]
    );

    return NextResponse.json(eventType, { status: 201 });
  } catch (error) {
    console.error('[scheduling/event-types] POST error:', error);
    return NextResponse.json({ error: 'Failed to create event type' }, { status: 500 });
  }
});

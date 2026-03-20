/**
 * GET /api/scheduling/event-types/[id] — Get a single event type.
 * PATCH /api/scheduling/event-types/[id] — Update event type fields.
 * DELETE /api/scheduling/event-types/[id] — Soft delete (set is_active = false).
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';
import { updateEventTypeSchema } from '@/lib/validators/scheduling';
import type { SchedulingEventType } from '@/lib/types';

// GET — single event type with host info
export const GET = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = parseInt(params?.id || '');
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid event type ID' }, { status: 400 });
    }

    const eventType = await queryOne<SchedulingEventType>(
      `SELECT et.*,
              u.display_name AS host_name,
              u.email AS host_email
       FROM crm.scheduling_event_types et
       JOIN crm.users u ON et.host_user_id = u.user_id
       WHERE et.event_type_id = $1 AND et.org_id = $2`,
      [id, orgId]
    );

    if (!eventType) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    return NextResponse.json(eventType);
  } catch (error) {
    console.error('[scheduling/event-types/id] GET error:', error);
    return NextResponse.json({ error: 'Failed to load event type' }, { status: 500 });
  }
});

// PATCH — update event type fields
export const PATCH = withAuth(async (request, { orgId, params }) => {
  try {
    const id = parseInt(params?.id || '');
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid event type ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updateEventTypeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify event type exists and belongs to org
    const existing = await queryOne<SchedulingEventType>(
      `SELECT * FROM crm.scheduling_event_types WHERE event_type_id = $1 AND org_id = $2`,
      [id, orgId]
    );
    if (!existing) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    const data = parsed.data;

    // If slug is being changed, check uniqueness
    if (data.slug && data.slug !== existing.slug) {
      const slugTaken = await queryOne<{ event_type_id: number }>(
        `SELECT event_type_id FROM crm.scheduling_event_types
         WHERE org_id = $1 AND slug = $2 AND event_type_id != $3`,
        [orgId, data.slug, id]
      );
      if (slugTaken) {
        return NextResponse.json({ error: 'An event type with this slug already exists' }, { status: 409 });
      }
    }

    // If availability_id is being set, validate it
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

    // Build dynamic UPDATE
    const allowedFields = [
      'name', 'slug', 'description', 'duration_minutes', 'color',
      'location_type', 'location_value', 'buffer_before', 'buffer_after',
      'min_notice', 'max_days_ahead', 'max_per_day', 'availability_id',
      'custom_questions', 'ai_agenda_enabled', 'is_active',
    ];

    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (data[field as keyof typeof data] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        const val = data[field as keyof typeof data];
        values.push(field === 'custom_questions' ? JSON.stringify(val) : val);
      }
    }

    values.push(id, orgId);
    const updated = await queryOne<SchedulingEventType>(
      `UPDATE crm.scheduling_event_types
       SET ${sets.join(', ')}
       WHERE event_type_id = $${idx} AND org_id = $${idx + 1}
       RETURNING *`,
      values
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[scheduling/event-types/id] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update event type' }, { status: 500 });
  }
});

// DELETE — soft delete (set is_active = false)
export const DELETE = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = parseInt(params?.id || '');
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid event type ID' }, { status: 400 });
    }

    const updated = await queryOne<SchedulingEventType>(
      `UPDATE crm.scheduling_event_types
       SET is_active = false, updated_at = NOW()
       WHERE event_type_id = $1 AND org_id = $2
       RETURNING event_type_id, is_active`,
      [id, orgId]
    );

    if (!updated) {
      return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Event type deactivated', event_type_id: id });
  } catch (error) {
    console.error('[scheduling/event-types/id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete event type' }, { status: 500 });
  }
});

/**
 * GET /api/scheduling/availability/[id] — Get a single availability schedule.
 * PATCH /api/scheduling/availability/[id] — Update schedule fields.
 * DELETE /api/scheduling/availability/[id] — Delete schedule (if not in use).
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';
import { updateAvailabilitySchema } from '@/lib/validators/scheduling';
import type { SchedulingAvailability } from '@/lib/types';

// GET — single availability schedule
export const GET = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = parseInt(params?.id || '');
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid availability ID' }, { status: 400 });
    }

    const schedule = await queryOne<SchedulingAvailability>(
      `SELECT * FROM crm.scheduling_availability
       WHERE availability_id = $1 AND org_id = $2`,
      [id, orgId]
    );

    if (!schedule) {
      return NextResponse.json({ error: 'Availability schedule not found' }, { status: 404 });
    }

    return NextResponse.json(schedule);
  } catch (error) {
    console.error('[scheduling/availability/id] GET error:', error);
    return NextResponse.json({ error: 'Failed to load availability schedule' }, { status: 500 });
  }
});

// PATCH — update availability schedule
export const PATCH = withAuth(async (request, { tenant, orgId, params }) => {
  try {
    const id = parseInt(params?.id || '');
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid availability ID' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updateAvailabilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify schedule exists and belongs to org
    const existing = await queryOne<SchedulingAvailability>(
      `SELECT * FROM crm.scheduling_availability
       WHERE availability_id = $1 AND org_id = $2`,
      [id, orgId]
    );
    if (!existing) {
      return NextResponse.json({ error: 'Availability schedule not found' }, { status: 404 });
    }

    const data = parsed.data;

    // If setting as default, unset other defaults
    if (data.is_default) {
      await query(
        `UPDATE crm.scheduling_availability
         SET is_default = false, updated_at = NOW()
         WHERE org_id = $1 AND user_id = $2 AND is_default = true AND availability_id != $3`,
        [orgId, tenant.user_id, id]
      );
    }

    // Build dynamic UPDATE
    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.timezone !== undefined) {
      sets.push(`timezone = $${idx++}`);
      values.push(data.timezone);
    }
    if (data.is_default !== undefined) {
      sets.push(`is_default = $${idx++}`);
      values.push(data.is_default);
    }
    if (data.weekly_hours !== undefined) {
      sets.push(`weekly_hours = $${idx++}`);
      values.push(JSON.stringify(data.weekly_hours));
    }
    if (data.date_overrides !== undefined) {
      sets.push(`date_overrides = $${idx++}`);
      values.push(JSON.stringify(data.date_overrides));
    }

    values.push(id, orgId);
    const updated = await queryOne<SchedulingAvailability>(
      `UPDATE crm.scheduling_availability
       SET ${sets.join(', ')}
       WHERE availability_id = $${idx} AND org_id = $${idx + 1}
       RETURNING *`,
      values
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[scheduling/availability/id] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update availability schedule' }, { status: 500 });
  }
});

// DELETE — delete schedule (only if not referenced by any event type)
export const DELETE = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = parseInt(params?.id || '');
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid availability ID' }, { status: 400 });
    }

    // Check if any active event types reference this schedule
    const inUse = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM crm.scheduling_event_types
       WHERE availability_id = $1 AND org_id = $2 AND is_active = true`,
      [id, orgId]
    );
    if (inUse && parseInt(inUse.count) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete: this schedule is used by active event types' },
        { status: 409 }
      );
    }

    const deleted = await queryOne<{ availability_id: number }>(
      `DELETE FROM crm.scheduling_availability
       WHERE availability_id = $1 AND org_id = $2
       RETURNING availability_id`,
      [id, orgId]
    );

    if (!deleted) {
      return NextResponse.json({ error: 'Availability schedule not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Availability schedule deleted', availability_id: id });
  } catch (error) {
    console.error('[scheduling/availability/id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete availability schedule' }, { status: 500 });
  }
});

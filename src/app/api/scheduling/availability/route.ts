/**
 * GET /api/scheduling/availability — List availability schedules for the user.
 * POST /api/scheduling/availability — Create a new availability schedule.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';
import { createAvailabilitySchema } from '@/lib/validators/scheduling';
import type { SchedulingAvailability } from '@/lib/types';

// GET — list availability schedules for the current user
export const GET = withAuth(async (_request, { tenant, orgId }) => {
  try {
    const schedules = await query<SchedulingAvailability>(
      `SELECT * FROM crm.scheduling_availability
       WHERE org_id = $1 AND user_id = $2
       ORDER BY is_default DESC, created_at ASC`,
      [orgId, tenant.user_id]
    );

    return NextResponse.json({ schedules });
  } catch (error) {
    console.error('[scheduling/availability] GET error:', error);
    return NextResponse.json({ error: 'Failed to load availability schedules' }, { status: 500 });
  }
});

// POST — create a new availability schedule
export const POST = withAuth(async (request, { tenant, orgId }) => {
  try {
    const body = await request.json();
    const parsed = createAvailabilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // If this is set as default, unset other defaults for this user
    if (data.is_default) {
      await query(
        `UPDATE crm.scheduling_availability
         SET is_default = false, updated_at = NOW()
         WHERE org_id = $1 AND user_id = $2 AND is_default = true`,
        [orgId, tenant.user_id]
      );
    }

    const schedule = await queryOne<SchedulingAvailability>(
      `INSERT INTO crm.scheduling_availability (
        org_id, user_id, name, timezone, is_default, weekly_hours, date_overrides
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        orgId, tenant.user_id,
        data.name, data.timezone, data.is_default,
        JSON.stringify(data.weekly_hours),
        JSON.stringify(data.date_overrides),
      ]
    );

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    console.error('[scheduling/availability] POST error:', error);
    return NextResponse.json({ error: 'Failed to create availability schedule' }, { status: 500 });
  }
});

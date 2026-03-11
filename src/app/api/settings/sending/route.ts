import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getTenantFromSession } from '@/lib/tenant';

/**
 * GET /api/settings/sending
 * Returns sending configuration (volume limits, warm-up, sending windows).
 */
export async function GET() {
  try {
    const tenant = await getTenantFromSession();
    const orgId = tenant?.org_id || 1;

    const org = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM crm.organizations WHERE org_id = $1`,
      [orgId]
    );

    const sending = (org?.settings as Record<string, unknown>)?.sending || {
      daily_limit: 50,
      warmup_enabled: false,
      warmup_start: 10,
      warmup_increment: 5,
      warmup_target: 50,
      warmup_current_day: 0,
      send_window_start: '08:00',
      send_window_end: '18:00',
      send_window_timezone: 'America/Denver',
      send_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      delay_between_emails_min: 60,
      delay_between_emails_max: 180,
    };

    return NextResponse.json({ sending });
  } catch (error) {
    console.error('[settings/sending] GET error:', error);
    return NextResponse.json({ error: 'Failed to load sending config' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/sending
 * Updates sending configuration.
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await getTenantFromSession();
    if (tenant && tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const orgId = tenant?.org_id || 1;

    const body = await request.json();

    await query(
      `UPDATE crm.organizations SET settings = settings || $1::jsonb, updated_at = NOW() WHERE org_id = $2`,
      [JSON.stringify({ sending: body }), orgId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[settings/sending] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update sending config' }, { status: 500 });
  }
}

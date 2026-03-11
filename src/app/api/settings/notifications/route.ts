import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getTenantFromSession } from '@/lib/tenant';

/**
 * GET /api/settings/notifications
 * Returns notification preferences from org settings.
 */
export async function GET() {
  try {
    const tenant = await getTenantFromSession();
    const orgId = tenant?.org_id || 1;

    const org = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM crm.organizations WHERE org_id = $1`,
      [orgId]
    );

    const notifications = (org?.settings as Record<string, unknown>)?.notifications || {
      email_replies: true,
      email_demos_booked: true,
      email_hot_leads: true,
      sms_replies: false,
      sms_demos_booked: false,
      sms_hot_leads: false,
      daily_summary: true,
      weekly_report: true,
      notify_phone: '',
      notify_email: '',
    };

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('[settings/notifications] GET error:', error);
    return NextResponse.json({ error: 'Failed to load notification preferences' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/notifications
 * Updates notification preferences.
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await getTenantFromSession();
    const orgId = tenant?.org_id || 1;

    const body = await request.json();

    await query(
      `UPDATE crm.organizations SET settings = settings || $1::jsonb, updated_at = NOW() WHERE org_id = $2`,
      [JSON.stringify({ notifications: body }), orgId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[settings/notifications] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}

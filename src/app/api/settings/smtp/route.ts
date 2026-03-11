import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { getTenantFromSession } from '@/lib/tenant';

/**
 * GET /api/settings/smtp
 * Returns SMTP configuration from org settings.
 */
export async function GET() {
  try {
    const tenant = await getTenantFromSession();
    const orgId = tenant?.org_id || 1;

    const org = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM crm.organizations WHERE org_id = $1`,
      [orgId]
    );

    const smtp = (org?.settings as Record<string, unknown>)?.smtp || {
      host: '',
      port: 587,
      username: '',
      password: '',
      from_name: '',
      from_email: '',
      encryption: 'tls',
    };

    return NextResponse.json({ smtp });
  } catch (error) {
    console.error('[settings/smtp] GET error:', error);
    return NextResponse.json({ error: 'Failed to load SMTP settings' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/smtp
 * Updates SMTP configuration in org settings.
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await getTenantFromSession();
    if (tenant && tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const orgId = tenant?.org_id || 1;

    const body = await request.json();
    const { host, port, username, password, from_name, from_email, encryption } = body;

    const smtp = { host, port, username, password, from_name, from_email, encryption };

    await query(
      `UPDATE crm.organizations SET settings = settings || $1::jsonb, updated_at = NOW() WHERE org_id = $2`,
      [JSON.stringify({ smtp }), orgId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[settings/smtp] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update SMTP settings' }, { status: 500 });
  }
}

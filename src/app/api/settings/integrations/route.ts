import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/settings/integrations
 * Returns integration configuration from org settings.
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const org = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM crm.organizations WHERE org_id = $1`,
      [orgId]
    );

    const settings = org?.settings || {};
    const integrations = (settings as Record<string, unknown>).integrations || {
      n8n_webhooks: [],
      twilio: { account_sid: '', auth_token: '', phone_number: '' },
      calendly: { api_key: '', event_url: '' },
      fathom: { api_key: '' },
    };

    return NextResponse.json({ integrations });
  } catch (error) {
    console.error('[settings/integrations] GET error:', error);
    return NextResponse.json({ error: 'Failed to load integrations' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/integrations
 * Updates integration configuration.
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    if (tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const orgId = tenant.org_id;

    const body = await request.json();

    await query(
      `UPDATE crm.organizations SET settings = settings || $1::jsonb, updated_at = NOW() WHERE org_id = $2`,
      [JSON.stringify({ integrations: body }), orgId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[settings/integrations] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update integrations' }, { status: 500 });
  }
}

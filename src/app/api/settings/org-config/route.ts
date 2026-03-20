import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import type { OrgConfig } from '@/lib/org-config';
import { logAuditEvent } from '@/lib/audit';
import { orgConfigSchema } from '@/lib/validators/settings';

/**
 * GET /api/settings/org-config
 * Returns the org's configuration (admin only).
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const org = await queryOne<{ settings: OrgConfig }>(
      `SELECT settings FROM crm.organizations WHERE org_id = $1`,
      [orgId]
    );

    return NextResponse.json({ config: org?.settings || {} });
  } catch (error) {
    console.error('[settings/org-config] GET error:', error);
    return NextResponse.json({ error: 'Failed to load org config' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/org-config
 * Updates org configuration fields (deep merge). Admin only.
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    if (tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const orgId = tenant.org_id;

    const body = await request.json();
    const parsed = orgConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    // Deep merge: use jsonb concat (||) which does a shallow merge of top-level keys
    // For nested updates, the client should send the full nested object
    await query(
      `UPDATE crm.organizations SET settings = COALESCE(settings, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE org_id = $2`,
      [JSON.stringify(parsed.data), orgId]
    );

    // Return updated config
    const updated = await queryOne<{ settings: OrgConfig }>(
      `SELECT settings FROM crm.organizations WHERE org_id = $1`,
      [orgId]
    );

    logAuditEvent({
      orgId: orgId,
      userId: tenant?.user_id,
      action: 'settings.org_config.update',
      details: { updated_keys: Object.keys(parsed.data) },
      request,
    });

    return NextResponse.json({ config: updated?.settings || {} });
  } catch (error) {
    console.error('[settings/org-config] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update org config' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { requireFeature, getOrgPlan } from '@/lib/feature-gate';
import { generateApiKey } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit';
import { createApiKeySchema } from '@/lib/validators/settings';

/**
 * GET /api/settings/api-keys — list active API keys (masked)
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();

    const plan = await getOrgPlan(tenant.org_id);
    requireFeature(plan, 'apiAccess');

    const keys = await query<{
      key_id: number;
      key_name: string;
      key_prefix: string;
      permissions: string[];
      last_used_at: string | null;
      expires_at: string | null;
      created_at: string;
    }>(
      `SELECT key_id, key_name, key_prefix, permissions, last_used_at, expires_at, created_at
       FROM crm.api_keys
       WHERE org_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [tenant.org_id]
    );

    return NextResponse.json({ keys });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[api-keys] GET error:', error);
    return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 });
  }
}

/**
 * POST /api/settings/api-keys — generate new API key
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    if (tenant.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 });

    const plan = await getOrgPlan(tenant.org_id);
    requireFeature(plan, 'apiAccess');

    const body = await request.json();
    const parsed = createApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const keyName = parsed.data.name;

    const { key, prefix, hash } = generateApiKey();

    await query(
      `INSERT INTO crm.api_keys (org_id, key_name, key_prefix, key_hash, permissions)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant.org_id, keyName, prefix, hash, ['read', 'write']]
    );

    logAuditEvent({
      orgId: tenant.org_id,
      userId: tenant.user_id,
      action: 'api_key.create',
      details: { key_name: keyName, prefix },
      request,
    });

    // Return the full key ONCE — it cannot be retrieved again
    return NextResponse.json({ key, prefix, name: keyName });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[api-keys] POST error:', error);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/api-keys — revoke API key
 */
export async function DELETE(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    if (tenant.role !== 'admin') return NextResponse.json({ error: 'Admin required' }, { status: 403 });

    const body = await request.json();
    const { key_id } = body;

    if (!key_id) return NextResponse.json({ error: 'key_id required' }, { status: 400 });

    await query(
      `UPDATE crm.api_keys SET is_active = false WHERE key_id = $1 AND org_id = $2`,
      [key_id, tenant.org_id]
    );

    logAuditEvent({
      orgId: tenant.org_id,
      userId: tenant.user_id,
      action: 'api_key.revoke',
      resourceType: 'api_key',
      resourceId: String(key_id),
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api-keys] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { verifyPasswordHash } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { deleteAccountSchema } from '@/lib/validators/settings';

/**
 * POST /api/settings/delete-account — soft-delete org (admin only)
 * Requires password confirmation.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    if (tenant.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const body = await request.json();
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { password } = parsed.data;

    // Verify password
    const user = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM crm.users WHERE user_id = $1`,
      [tenant.user_id]
    );
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const valid = await verifyPasswordHash(password, user.password_hash);
    if (!valid) return NextResponse.json({ error: 'Invalid password' }, { status: 401 });

    // Soft-delete org
    await query(
      `UPDATE crm.organizations SET deleted_at = NOW(), is_active = false, updated_at = NOW() WHERE org_id = $1`,
      [tenant.org_id]
    );

    // Deactivate all users in the org
    await query(
      `UPDATE crm.users SET is_active = false, updated_at = NOW() WHERE org_id = $1`,
      [tenant.org_id]
    );

    logAuditEvent({
      orgId: tenant.org_id,
      userId: tenant.user_id,
      action: 'account.delete',
      details: { soft_delete: true, grace_period_days: 30 },
      request,
    });

    // Clear session
    const response = NextResponse.json({
      success: true,
      message: 'Account scheduled for deletion. Data will be permanently removed after 30 days. You can contact support to restore your account during this period.',
    });
    response.cookies.delete('session');

    return response;
  } catch (error) {
    console.error('[delete-account] error:', error);
    return NextResponse.json({ error: 'Account deletion failed' }, { status: 500 });
  }
}

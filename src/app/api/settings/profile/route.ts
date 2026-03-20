import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/settings/profile
 * Returns the current user's profile settings (work_email, etc.)
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();

    const row = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM crm.users WHERE user_id = $1`,
      [tenant.user_id]
    );

    return NextResponse.json({
      email: tenant.email,
      display_name: tenant.display_name,
      work_email: (row?.settings as { work_email?: string })?.work_email || null,
    });
  } catch (error) {
    console.error('[settings/profile] GET error:', error);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/profile
 * Update user profile settings (work_email, display_name).
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const body = await request.json();

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Update display_name if provided
    if (typeof body.display_name === 'string') {
      updates.push(`display_name = $${paramIdx++}`);
      params.push(body.display_name.trim());
    }

    // Update work_email in settings JSONB
    if (typeof body.work_email === 'string' || body.work_email === null) {
      const workEmail = body.work_email?.trim() || null;
      updates.push(`settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{work_email}', $${paramIdx++}::jsonb)`);
      params.push(JSON.stringify(workEmail));
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    params.push(tenant.user_id);

    await query(
      `UPDATE crm.users SET ${updates.join(', ')} WHERE user_id = $${paramIdx}`,
      params
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[settings/profile] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

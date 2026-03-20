import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/require-super-admin';
import { getUsage } from '@/lib/usage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const orgId = parseInt(id);

    const org = await queryOne(
      `SELECT * FROM crm.organizations WHERE org_id = $1`,
      [orgId]
    );
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const users = await query(
      `SELECT user_id, email, display_name, role, is_active, last_login_at, created_at
       FROM crm.users WHERE org_id = $1 ORDER BY created_at`,
      [orgId]
    );

    const usage = await getUsage(orgId);

    return NextResponse.json({ org, users, usage });
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error && (error as unknown as { status: number }).status === 403) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[admin/tenants/id] error:', error);
    return NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const orgId = parseInt(id);
    const body = await request.json();

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.plan) {
      updates.push(`plan = $${idx++}`);
      values.push(body.plan);
    }
    if (typeof body.is_active === 'boolean') {
      updates.push(`is_active = $${idx++}`);
      values.push(body.is_active);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(orgId);

    await query(
      `UPDATE crm.organizations SET ${updates.join(', ')} WHERE org_id = $${idx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error && (error as unknown as { status: number }).status === 403) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[admin/tenants/id] PATCH error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

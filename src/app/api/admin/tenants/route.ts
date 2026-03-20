import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/require-super-admin';

export async function GET() {
  try {
    await requireSuperAdmin();

    const tenants = await query<{
      org_id: number;
      name: string;
      slug: string;
      plan: string;
      is_active: boolean;
      user_count: string;
      contact_count: string;
      last_activity: string | null;
      created_at: string;
    }>(
      `SELECT o.org_id, o.name, o.slug, o.plan, o.is_active, o.created_at,
              (SELECT COUNT(*) FROM crm.users u WHERE u.org_id = o.org_id AND u.is_active = true) as user_count,
              (SELECT COUNT(*) FROM crm.contacts c WHERE c.org_id = o.org_id) as contact_count,
              (SELECT MAX(u.last_login_at) FROM crm.users u WHERE u.org_id = o.org_id) as last_activity
       FROM crm.organizations o
       WHERE o.deleted_at IS NULL
       ORDER BY o.created_at DESC`
    );

    return NextResponse.json({
      tenants: tenants.map(t => ({
        ...t,
        user_count: parseInt(t.user_count, 10),
        contact_count: parseInt(t.contact_count, 10),
      })),
    });
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error && (error as unknown as { status: number }).status === 403) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[admin/tenants] error:', error);
    return NextResponse.json({ error: 'Failed to load tenants' }, { status: 500 });
  }
}

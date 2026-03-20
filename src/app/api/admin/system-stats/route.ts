import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSuperAdmin } from '@/lib/require-super-admin';

export async function GET() {
  try {
    await requireSuperAdmin();

    const [orgs, users, contacts, active, planDist] = await Promise.all([
      queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM crm.organizations WHERE deleted_at IS NULL`),
      queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM crm.users WHERE is_active = true`),
      queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM crm.contacts`),
      queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM crm.organizations WHERE is_active = true AND deleted_at IS NULL`),
      query<{ plan: string; count: string }>(`SELECT plan, COUNT(*) as count FROM crm.organizations WHERE deleted_at IS NULL GROUP BY plan`),
    ]);

    const plans: Record<string, number> = {};
    for (const row of planDist) {
      plans[row.plan] = parseInt(row.count, 10);
    }

    return NextResponse.json({
      total_orgs: parseInt(orgs?.count || '0', 10),
      total_users: parseInt(users?.count || '0', 10),
      total_contacts: parseInt(contacts?.count || '0', 10),
      active_orgs: parseInt(active?.count || '0', 10),
      plans,
    });
  } catch (error: unknown) {
    if (error instanceof Error && 'status' in error && (error as unknown as { status: number }).status === 403) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[admin/system-stats] error:', error);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
}

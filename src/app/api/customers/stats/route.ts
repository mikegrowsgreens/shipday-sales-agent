import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuthGet } from '@/lib/route-auth';

// GET /api/customers/stats - Dashboard KPIs
export const GET = withAuthGet(async ({ orgId }) => {
  try {
    // Total counts by status
    const statusCounts = await query<{ account_status: string; count: string }>(
      `SELECT account_status, COUNT(*)::text as count
       FROM crm.customers
       WHERE org_id = $1 AND account_status != 'deleted'
       GROUP BY account_status`,
      [orgId]
    );

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.account_status] = parseInt(row.count);
    }

    // Counts by plan
    const planCounts = await query<{ account_plan: string; count: string }>(
      `SELECT account_plan, COUNT(*)::text as count
       FROM crm.customers
       WHERE org_id = $1 AND account_status = 'active' AND account_plan IS NOT NULL
       GROUP BY account_plan
       ORDER BY count DESC`,
      [orgId]
    );

    const byPlan: Record<string, number> = {};
    for (const row of planCounts) {
      byPlan[row.account_plan] = parseInt(row.count);
    }

    // Aggregate metrics
    const metrics = await queryOne<{
      avg_health: string;
      avg_order_val: string;
      total_locs: string;
      at_risk: string;
    }>(
      `SELECT
         COALESCE(AVG(health_score), 0)::text as avg_health,
         COALESCE(AVG(avg_order_value), 0)::text as avg_order_val,
         COALESCE(SUM(num_locations), 0)::text as total_locs,
         COUNT(*) FILTER (WHERE health_score < 40)::text as at_risk
       FROM crm.customers
       WHERE org_id = $1 AND account_status = 'active'`,
      [orgId]
    );

    return NextResponse.json({
      total_active: statusMap['active'] || 0,
      total_inactive: statusMap['inactive'] || 0,
      total_churned: statusMap['churned'] || 0,
      by_plan: byPlan,
      avg_health_score: Math.round(parseFloat(metrics?.avg_health || '0')),
      avg_order_value: parseFloat(parseFloat(metrics?.avg_order_val || '0').toFixed(2)),
      total_locations: parseInt(metrics?.total_locs || '0'),
      at_risk_count: parseInt(metrics?.at_risk || '0'),
    });
  } catch (error) {
    console.error('[customers/stats] GET error:', error);
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }
});

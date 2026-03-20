import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/coaching/benchmarks
 * Performance benchmarks with progress against goals
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    // Get goals (org-scoped)
    const goals = await query<{
      metric: string; target: number; period: string;
    }>(`SELECT metric, target, period FROM crm.performance_goals WHERE is_active = true AND org_id = $1`, [orgId]);

    // Today's activity by channel (org-scoped)
    const todayActivity = await query<{ channel: string; cnt: string }>(`
      SELECT channel, COUNT(*)::text as cnt
      FROM crm.touchpoints
      WHERE occurred_at >= CURRENT_DATE AND direction = 'outbound'
        AND org_id = $1
      GROUP BY channel
    `, [orgId]);

    // This week's activity (org-scoped)
    const weekActivity = await query<{ channel: string; event_type: string; cnt: string }>(`
      SELECT channel, event_type, COUNT(*)::text as cnt
      FROM crm.touchpoints
      WHERE occurred_at >= DATE_TRUNC('week', CURRENT_DATE)
        AND org_id = $1
      GROUP BY channel, event_type
    `, [orgId]);

    // Today's completed tasks (org-scoped)
    const todayTasks = await query<{ cnt: string }>(`
      SELECT COUNT(*)::text as cnt FROM crm.task_queue
      WHERE status = 'completed' AND completed_at >= CURRENT_DATE
        AND org_id = $1
    `, [orgId]);

    // Week's demos booked (org-scoped)
    const weekDemos = await query<{ cnt: string }>(`
      SELECT COUNT(*)::text as cnt FROM crm.calendly_events
      WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) AND cancelled = false
        AND org_id = $1
    `, [orgId]);

    // Week's replies (org-scoped)
    const weekReplies = await query<{ cnt: string }>(`
      SELECT COUNT(*)::text as cnt FROM crm.touchpoints
      WHERE event_type IN ('replied', 'reply_received')
        AND direction = 'inbound'
        AND occurred_at >= DATE_TRUNC('week', CURRENT_DATE)
        AND org_id = $1
    `, [orgId]);

    // Today's calls from phone_calls table (org-scoped)
    const todayCalls = await query<{ cnt: string }>(`
      SELECT COUNT(*)::text as cnt FROM crm.phone_calls
      WHERE started_at >= CURRENT_DATE
        AND org_id = $1
    `, [orgId]);

    // Build benchmark results
    const todayMap: Record<string, number> = {};
    for (const a of todayActivity) todayMap[a.channel] = parseInt(a.cnt);

    const benchmarks = goals.map(g => {
      let current = 0;
      if (g.metric === 'calls_daily') current = parseInt(todayCalls[0]?.cnt || '0');
      else if (g.metric === 'emails_daily') current = todayMap['email'] || 0;
      else if (g.metric === 'linkedin_daily') current = todayMap['linkedin'] || 0;
      else if (g.metric === 'sms_daily') current = todayMap['sms'] || 0;
      else if (g.metric === 'tasks_daily') current = parseInt(todayTasks[0]?.cnt || '0');
      else if (g.metric === 'replies_weekly') current = parseInt(weekReplies[0]?.cnt || '0');
      else if (g.metric === 'demos_weekly') current = parseInt(weekDemos[0]?.cnt || '0');

      const pct = g.target > 0 ? Math.round((current / g.target) * 100) : 0;
      return {
        metric: g.metric,
        label: g.metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        current,
        target: g.target,
        period: g.period,
        pct,
        status: pct >= 100 ? 'complete' : pct >= 60 ? 'on_track' : 'behind',
      };
    });

    // 7-day trend for daily metrics (org-scoped)
    const dailyTrend = await query<{ day: string; channel: string; cnt: string }>(`
      SELECT
        occurred_at::date::text as day,
        channel,
        COUNT(*)::text as cnt
      FROM crm.touchpoints
      WHERE occurred_at >= CURRENT_DATE - INTERVAL '7 days'
        AND direction = 'outbound'
        AND org_id = $1
      GROUP BY occurred_at::date, channel
      ORDER BY occurred_at::date
    `, [orgId]);

    return NextResponse.json({ benchmarks, dailyTrend });
  } catch (error) {
    console.error('[benchmarks] error:', error);
    return NextResponse.json({ error: 'Failed to load benchmarks' }, { status: 500 });
  }
}

/**
 * PATCH /api/coaching/benchmarks
 * Update a performance goal target
 */
export async function PATCH(request: NextRequest) {
  const tenant = await requireTenantSession();
  const orgId = tenant.org_id;

  const { metric, target } = await request.json();
  if (!metric || typeof target !== 'number') {
    return NextResponse.json({ error: 'metric and target required' }, { status: 400 });
  }

  await query(
    `UPDATE crm.performance_goals SET target = $1, updated_at = NOW() WHERE metric = $2 AND org_id = $3`,
    [target, metric, orgId]
  );

  return NextResponse.json({ success: true });
}

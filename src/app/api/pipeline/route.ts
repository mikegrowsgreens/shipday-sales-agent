import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const activeStages = ['outreach', 'engaged', 'demo_completed', 'negotiation', 'won', 'lost'];

/**
 * GET /api/pipeline?range=30d|90d|all&sort=updated|score|touches
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '90d';
    const sort = searchParams.get('sort') || 'updated';

    const stageList = activeStages.map(s => `'${s}'`).join(',');

    // Date filter
    let dateFilter = '';
    if (range === '7d') dateFilter = `AND c.updated_at >= NOW() - interval '7 days'`;
    else if (range === '14d') dateFilter = `AND c.updated_at >= NOW() - interval '14 days'`;
    else if (range === '30d') dateFilter = `AND c.updated_at >= NOW() - interval '30 days'`;
    else if (range === '90d') dateFilter = `AND c.updated_at >= NOW() - interval '90 days'`;
    // 'all' = no filter

    // Sort order
    let orderBy = 'c.updated_at DESC';
    if (sort === 'score') orderBy = 'c.lead_score DESC, c.updated_at DESC';
    else if (sort === 'touches') orderBy = 'tp.touch_count DESC NULLS LAST, c.updated_at DESC';

    const contacts = await query(`
      SELECT
        c.contact_id, c.email, c.phone,
        c.first_name, c.last_name, c.business_name,
        c.lifecycle_stage, c.lead_score, c.engagement_score,
        c.updated_at,
        tp.last_touch,
        COALESCE(tp.touch_count, 0)::int as touch_count
      FROM crm.contacts c
      LEFT JOIN LATERAL (
        SELECT
          MAX(occurred_at) as last_touch,
          COUNT(*) as touch_count
        FROM crm.touchpoints
        WHERE contact_id = c.contact_id
      ) tp ON true
      LEFT JOIN public.deals d ON d.deal_id::text = c.wincall_deal_id::text
      WHERE c.lifecycle_stage IN (${stageList})
        AND (c.wincall_deal_id IS NULL OR d.owner_name = 'Mike Paulus')
        ${dateFilter}
      ORDER BY
        CASE c.lifecycle_stage
          WHEN 'outreach' THEN 1
          WHEN 'engaged' THEN 2
          WHEN 'demo_completed' THEN 3
          WHEN 'negotiation' THEN 4
          WHEN 'won' THEN 5
          WHEN 'lost' THEN 6
        END,
        ${orderBy}
    `);

    // Stage counts
    const stageCounts = await query<{ lifecycle_stage: string; count: string }>(
      `SELECT c.lifecycle_stage, COUNT(*)::text as count
       FROM crm.contacts c
       LEFT JOIN public.deals d ON d.deal_id::text = c.wincall_deal_id::text
       WHERE c.lifecycle_stage IN (${stageList})
         AND (c.wincall_deal_id IS NULL OR d.owner_name = 'Mike Paulus')
         ${dateFilter}
       GROUP BY c.lifecycle_stage`
    );
    const counts: Record<string, number> = {};
    for (const r of stageCounts) {
      counts[r.lifecycle_stage] = parseInt(r.count);
    }

    // Upstream counts
    const upstream = await query<{ lifecycle_stage: string; count: string }>(
      `SELECT lifecycle_stage, COUNT(*)::text as count FROM crm.contacts WHERE lifecycle_stage IN ('raw', 'enriched') GROUP BY lifecycle_stage`
    );
    const upstreamCounts: Record<string, number> = {};
    for (const r of upstream) {
      upstreamCounts[r.lifecycle_stage] = parseInt(r.count);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Conversion metrics
    // ═══════════════════════════════════════════════════════════════════════

    // Email performance — use bdr.email_sends for accurate date-scoped counts.
    // Previously used bdr.leads cumulative counters (send_count/open_count)
    // filtered by email_sent_at, which broke date ranges because:
    //   1. email_sent_at is one date per lead, but send_count is all-time
    //   2. Leads outside the date window lose ALL their historical sends
    const emailStats = await query<{
      total_sent: string;
      total_opened: string;
      total_replied: string;
    }>(`
      SELECT
        COUNT(*)::text as total_sent,
        COUNT(*) FILTER (WHERE open_count > 0)::text as total_opened,
        COUNT(*) FILTER (WHERE replied = true)::text as total_replied
      FROM bdr.email_sends
      WHERE sent_at IS NOT NULL
        AND sent_at >= NOW() - INTERVAL '30 days'
    `);
    const emailRow = emailStats[0] || { total_sent: '0', total_opened: '0', total_replied: '0' };
    const sent = parseInt(emailRow.total_sent);
    const opened = parseInt(emailRow.total_opened);
    const replied = parseInt(emailRow.total_replied);

    // BDR lead funnel
    const bdrFunnel = await query<{ status: string; count: string }>(`
      SELECT status, COUNT(*)::text as count
      FROM bdr.leads
      WHERE created_at >= NOW() - INTERVAL '90 days'
      GROUP BY status
      ORDER BY count DESC
    `);
    const bdrCounts: Record<string, number> = {};
    for (const r of bdrFunnel) bdrCounts[r.status] = parseInt(r.count);

    // Avg days to convert between stages (lifecycle_stage transitions via touchpoints)
    const velocityRows = await query<{ lifecycle_stage: string; avg_days: string }>(`
      SELECT lifecycle_stage,
             ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400))::text as avg_days
      FROM crm.contacts
      WHERE lifecycle_stage IN (${stageList})
        AND updated_at > created_at
      GROUP BY lifecycle_stage
    `);
    const velocity: Record<string, number> = {};
    for (const r of velocityRows) velocity[r.lifecycle_stage] = parseInt(r.avg_days) || 0;

    // Angle performance
    const anglePerf = await query<{
      email_angle: string;
      total: string;
      replied: string;
      demos: string;
    }>(`
      SELECT
        COALESCE(email_angle, 'unknown') as email_angle,
        COUNT(*)::text as total,
        COUNT(*) FILTER (WHERE status = 'replied')::text as replied,
        COUNT(*) FILTER (WHERE status IN ('demo_opportunity', 'won'))::text as demos
      FROM bdr.leads
      WHERE email_angle IS NOT NULL
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY email_angle
      ORDER BY COUNT(*) DESC
    `);

    // Revenue forecasting — based on stage conversion probabilities
    const stageWeights: Record<string, number> = {
      outreach: 0.05,
      engaged: 0.15,
      demo_completed: 0.35,
      negotiation: 0.60,
      won: 1.0,
    };
    const avgDealValue = 500; // $500/mo average Shipday deal

    const forecast = {
      weighted_pipeline: 0,
      best_case: 0,
      conservative: 0,
      deals_by_stage: {} as Record<string, { count: number; weighted_value: number }>,
    };

    for (const stage of Object.keys(stageWeights)) {
      const count = counts[stage] || 0;
      const weight = stageWeights[stage];
      const weighted = count * avgDealValue * weight;
      forecast.weighted_pipeline += weighted;
      forecast.best_case += count * avgDealValue;
      forecast.deals_by_stage[stage] = { count, weighted_value: Math.round(weighted) };
    }
    forecast.conservative = Math.round(forecast.weighted_pipeline * 0.7);
    forecast.weighted_pipeline = Math.round(forecast.weighted_pipeline);
    forecast.best_case = Math.round(forecast.best_case);

    const metrics = {
      email: {
        sent,
        opened,
        replied,
        open_rate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
        reply_rate: sent > 0 ? Math.round((replied / sent) * 100) : 0,
      },
      bdr_funnel: bdrCounts,
      velocity,
      angle_performance: anglePerf.map(a => ({
        angle: a.email_angle,
        total: parseInt(a.total),
        replied: parseInt(a.replied),
        demos: parseInt(a.demos),
        reply_rate: parseInt(a.total) > 0 ? Math.round((parseInt(a.replied) / parseInt(a.total)) * 100) : 0,
      })),
      forecast,
    };

    return NextResponse.json({ contacts, counts, upstreamCounts, metrics });
  } catch (error) {
    console.error('[pipeline] error:', error);
    return NextResponse.json({ error: 'Failed to load pipeline' }, { status: 500 });
  }
}

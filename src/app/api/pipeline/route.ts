import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { requireTenantSession } from '@/lib/tenant';

const activeStages = ['outreach', 'engaged', 'demo_completed', 'negotiation', 'won', 'lost'];

/**
 * GET /api/pipeline?range=30d|90d|all&sort=updated|score|touches
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const config = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
    const ownerName = config.persona?.sender_name || '';

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '90d';
    const sort = searchParams.get('sort') || 'updated';

    // Build stage placeholders: $1, $2, ..., $6
    const stageParams = activeStages;
    const stagePlaceholders = stageParams.map((_, i) => `$${i + 1}`).join(',');

    // orgId is always the next param after stages
    const orgParam = stageParams.length + 1; // $7

    // Date filter (whitelist-based, no user input in SQL)
    let dateFilter = '';
    if (range === '7d') dateFilter = `AND c.updated_at >= NOW() - interval '7 days'`;
    else if (range === '14d') dateFilter = `AND c.updated_at >= NOW() - interval '14 days'`;
    else if (range === '30d') dateFilter = `AND c.updated_at >= NOW() - interval '30 days'`;
    else if (range === '90d') dateFilter = `AND c.updated_at >= NOW() - interval '90 days'`;

    // Sort order (whitelist-based, no user input in SQL)
    let orderBy = 'c.updated_at DESC';
    if (sort === 'score') orderBy = 'c.lead_score DESC, c.updated_at DESC';
    else if (sort === 'touches') orderBy = 'tp.touch_count DESC NULLS LAST, c.updated_at DESC';

    // Owner filter: if ownerName is set, filter by it; otherwise match all
    const hasOwner = !!ownerName;
    const ownerParam = orgParam + 1; // $8

    const contactsParams: unknown[] = [...stageParams, orgId];
    let ownerClause: string;
    if (hasOwner) {
      // For won/lost: require a wincall deal owned by this user (excludes Shipday-only customers)
      // For active stages: show all contacts unless they have a wincall deal owned by someone else
      ownerClause = `AND (
        CASE
          WHEN c.lifecycle_stage IN ('won', 'lost') THEN
            c.wincall_deal_id IS NOT NULL AND LOWER(TRIM(d.owner_name)) = LOWER(TRIM($${ownerParam}))
          ELSE
            c.wincall_deal_id IS NULL OR LOWER(TRIM(d.owner_name)) = LOWER(TRIM($${ownerParam}))
        END
      )`;
      contactsParams.push(ownerName);
    } else {
      ownerClause = '';
    }

    const contacts = await query(`
      SELECT
        c.contact_id, c.email, c.phone,
        c.first_name, c.last_name, c.business_name,
        c.lifecycle_stage, c.lead_score, c.engagement_score,
        c.updated_at,
        tp.last_touch,
        COALESCE(tp.touch_count, 0)::int as touch_count,
        d.owner_name as deal_owner
      FROM crm.contacts c
      LEFT JOIN LATERAL (
        SELECT
          MAX(occurred_at) as last_touch,
          COUNT(*) as touch_count
        FROM crm.touchpoints
        WHERE contact_id = c.contact_id AND org_id = $${orgParam}
      ) tp ON true
      LEFT JOIN public.deals d ON d.deal_id::text = c.wincall_deal_id::text
      WHERE c.org_id = $${orgParam}
        AND c.lifecycle_stage IN (${stagePlaceholders})
        ${ownerClause}
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
    `, contactsParams);

    // Stage counts — reuse same param structure
    const stageCountParams: unknown[] = [...stageParams, orgId];
    let stageOwnerClause: string;
    if (hasOwner) {
      stageOwnerClause = `AND (
        CASE
          WHEN c.lifecycle_stage IN ('won', 'lost') THEN
            c.wincall_deal_id IS NOT NULL AND LOWER(TRIM(d.owner_name)) = LOWER(TRIM($${ownerParam}))
          ELSE
            c.wincall_deal_id IS NULL OR LOWER(TRIM(d.owner_name)) = LOWER(TRIM($${ownerParam}))
        END
      )`;
      stageCountParams.push(ownerName);
    } else {
      stageOwnerClause = '';
    }

    const stageCounts = await query<{ lifecycle_stage: string; count: string }>(
      `SELECT c.lifecycle_stage, COUNT(*)::text as count
       FROM crm.contacts c
       LEFT JOIN public.deals d ON d.deal_id::text = c.wincall_deal_id::text
       WHERE c.org_id = $${orgParam}
         AND c.lifecycle_stage IN (${stagePlaceholders})
         ${stageOwnerClause}
         ${dateFilter}
       GROUP BY c.lifecycle_stage`,
      stageCountParams
    );
    const counts: Record<string, number> = {};
    for (const r of stageCounts) {
      counts[r.lifecycle_stage] = parseInt(r.count);
    }

    // Upstream counts
    const upstream = await query<{ lifecycle_stage: string; count: string }>(
      `SELECT lifecycle_stage, COUNT(*)::text as count FROM crm.contacts WHERE org_id = $1 AND lifecycle_stage IN ('raw', 'enriched') GROUP BY lifecycle_stage`,
      [orgId]
    );
    const upstreamCounts: Record<string, number> = {};
    for (const r of upstream) {
      upstreamCounts[r.lifecycle_stage] = parseInt(r.count);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Conversion metrics
    // ═══════════════════════════════════════════════════════════════════════

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
      WHERE org_id = $1
        AND sent_at IS NOT NULL
        AND sent_at >= NOW() - INTERVAL '30 days'
    `, [orgId]);
    const emailRow = emailStats[0] || { total_sent: '0', total_opened: '0', total_replied: '0' };
    const sent = parseInt(emailRow.total_sent);
    const opened = parseInt(emailRow.total_opened);
    const replied = parseInt(emailRow.total_replied);

    // BDR lead funnel
    const bdrFunnel = await query<{ status: string; count: string }>(`
      SELECT status, COUNT(*)::text as count
      FROM bdr.leads
      WHERE org_id = $1
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY status
      ORDER BY count DESC
    `, [orgId]);
    const bdrCounts: Record<string, number> = {};
    for (const r of bdrFunnel) bdrCounts[r.status] = parseInt(r.count);

    // Avg days to convert between stages
    const velocityRows = await query<{ lifecycle_stage: string; avg_days: string }>(`
      SELECT lifecycle_stage,
             ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400))::text as avg_days
      FROM crm.contacts
      WHERE org_id = $1
        AND lifecycle_stage IN (${stageParams.map((_, i) => `$${i + 2}`).join(',')})
        AND updated_at > created_at
      GROUP BY lifecycle_stage
    `, [orgId, ...stageParams]);
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
      WHERE org_id = $1
        AND email_angle IS NOT NULL
        AND created_at >= NOW() - INTERVAL '90 days'
      GROUP BY email_angle
      ORDER BY COUNT(*) DESC
    `, [orgId]);

    // Revenue forecasting — based on stage conversion probabilities
    const stageWeights: Record<string, number> = {
      outreach: 0.05,
      engaged: 0.15,
      demo_completed: 0.35,
      negotiation: 0.60,
      won: 1.0,
    };
    const avgDealValue = 500; // $500/mo average deal value

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

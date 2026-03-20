import { NextResponse } from 'next/server';
import { queryDeals } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/followups/analytics
 * Follow-up campaign analytics: response rates by touch, performance stats.
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    // Overview stats
    const [overview] = await queryDeals<{
      total_deals: number;
      active_deals: number;
      total_drafts: number;
      total_sent: number;
      total_approved: number;
      total_pending: number;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM deals.deals WHERE agent_status IS NULL OR agent_status NOT IN ('archived')) AS total_deals,
        (SELECT COUNT(*) FROM deals.deals WHERE agent_status = 'active') AS active_deals,
        (SELECT COUNT(*) FROM deals.email_drafts) AS total_drafts,
        (SELECT COUNT(*) FROM deals.email_drafts WHERE status = 'sent') AS total_sent,
        (SELECT COUNT(*) FROM deals.email_drafts WHERE status = 'approved') AS total_approved,
        (SELECT COUNT(*) FROM deals.email_drafts WHERE status = 'draft') AS total_pending
    `);

    // Sent count per touch number (response rates by touch)
    const touchStats = await queryDeals<{
      touch_number: number;
      total: number;
      sent: number;
      approved: number;
      pending: number;
    }>(`
      SELECT
        touch_number,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'sent') AS sent,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status = 'draft') AS pending
      FROM deals.email_drafts
      GROUP BY touch_number
      ORDER BY touch_number ASC
    `);

    // Deals by pipeline stage
    const stageBreakdown = await queryDeals<{
      pipeline_stage: string;
      count: number;
      with_campaign: number;
    }>(`
      SELECT
        COALESCE(d.pipeline_stage, 'unknown') AS pipeline_stage,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM deals.email_drafts ed WHERE ed.deal_id = d.deal_id
        )) AS with_campaign
      FROM deals.deals d
      WHERE d.agent_status IS NULL OR d.agent_status NOT IN ('archived')
      GROUP BY d.pipeline_stage
      ORDER BY count DESC
    `);

    // Recent activity (last 7 days)
    const recentActivity = await queryDeals<{
      action_date: string;
      action_count: number;
      sends: number;
      approvals: number;
      generations: number;
    }>(`
      SELECT
        DATE(created_at) AS action_date,
        COUNT(*) AS action_count,
        COUNT(*) FILTER (WHERE action_type LIKE '%sent%' OR action_type LIKE '%send%') AS sends,
        COUNT(*) FILTER (WHERE action_type LIKE '%approv%') AS approvals,
        COUNT(*) FILTER (WHERE action_type LIKE '%generat%') AS generations
      FROM deals.activity_log
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY action_date DESC
    `);

    // Campaign completion rates
    const completionStats = await queryDeals<{
      completion_bucket: string;
      deal_count: number;
    }>(`
      SELECT
        CASE
          WHEN draft_total = 0 THEN 'no_campaign'
          WHEN sent_total = draft_total THEN 'complete'
          WHEN sent_total > 0 THEN 'in_progress'
          ELSE 'not_started'
        END AS completion_bucket,
        COUNT(*) AS deal_count
      FROM (
        SELECT
          d.deal_id,
          (SELECT COUNT(*) FROM deals.email_drafts ed WHERE ed.deal_id = d.deal_id) AS draft_total,
          (SELECT COUNT(*) FROM deals.email_drafts ed WHERE ed.deal_id = d.deal_id AND ed.status = 'sent') AS sent_total
        FROM deals.deals d
        WHERE d.agent_status IS NULL OR d.agent_status NOT IN ('archived')
      ) sub
      GROUP BY completion_bucket
    `);

    // Edited vs untouched drafts (how often the user edits AI drafts)
    const editStats = await queryDeals<{
      edited_count: number;
      untouched_count: number;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE mike_edited = true) AS edited_count,
        COUNT(*) FILTER (WHERE mike_edited = false OR mike_edited IS NULL) AS untouched_count
      FROM deals.email_drafts
      WHERE status IN ('sent', 'approved')
    `);

    return NextResponse.json({
      overview,
      touchStats,
      stageBreakdown,
      recentActivity,
      completionStats,
      editStats: editStats[0] || { edited_count: 0, untouched_count: 0 },
    });
  } catch (error) {
    console.error('[followups/analytics] error:', error);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}

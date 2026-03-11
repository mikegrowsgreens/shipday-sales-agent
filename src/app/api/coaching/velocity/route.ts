import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/coaching/velocity
 * Pipeline velocity - time-in-stage and conversion rates
 */
export async function GET() {
  try {
    // Contacts by stage with avg time in stage
    const stageDistribution = await query<{
      stage: string;
      count: string;
      avg_days_in_stage: string;
    }>(`
      SELECT
        lifecycle_stage as stage,
        COUNT(*)::text as count,
        ROUND(AVG(EXTRACT(DAY FROM NOW() - updated_at)))::text as avg_days_in_stage
      FROM crm.contacts
      WHERE lifecycle_stage NOT IN ('raw')
      GROUP BY lifecycle_stage
      ORDER BY
        CASE lifecycle_stage
          WHEN 'enriched' THEN 1
          WHEN 'outreach' THEN 2
          WHEN 'engaged' THEN 3
          WHEN 'demo_completed' THEN 4
          WHEN 'negotiation' THEN 5
          WHEN 'won' THEN 6
          WHEN 'lost' THEN 7
          WHEN 'nurture' THEN 8
        END
    `);

    // Stage conversion rates (last 90 days)
    const stageTransitions = await query<{
      from_stage: string;
      to_stage: string;
      count: string;
    }>(`
      WITH stage_order AS (
        SELECT unnest(ARRAY['enriched','outreach','engaged','demo_completed','negotiation','won','lost','nurture']) as stage,
               generate_series(1,8) as ord
      )
      SELECT
        c.lifecycle_stage as to_stage,
        'all' as from_stage,
        COUNT(*)::text as count
      FROM crm.contacts c
      WHERE c.updated_at >= NOW() - INTERVAL '90 days'
        AND c.lifecycle_stage != 'raw'
      GROUP BY c.lifecycle_stage
    `);

    // Pipeline velocity: average days between key stages
    const velocityMetrics = await query<{
      metric: string;
      avg_days: string;
      count: string;
    }>(`
      SELECT 'outreach_to_engaged' as metric,
        ROUND(AVG(EXTRACT(DAY FROM
          (SELECT MIN(t.occurred_at) FROM crm.touchpoints t
           WHERE t.contact_id = c.contact_id AND t.event_type IN ('replied','reply_received'))
          - (SELECT MIN(t.occurred_at) FROM crm.touchpoints t
             WHERE t.contact_id = c.contact_id AND t.event_type = 'sent')
        )))::text as avg_days,
        COUNT(*)::text as count
      FROM crm.contacts c
      WHERE c.lifecycle_stage IN ('engaged','demo_completed','negotiation','won')
        AND EXISTS (SELECT 1 FROM crm.touchpoints t WHERE t.contact_id = c.contact_id AND t.event_type IN ('replied','reply_received'))

      UNION ALL

      SELECT 'engaged_to_demo' as metric,
        ROUND(AVG(EXTRACT(DAY FROM
          (SELECT MIN(ce.scheduled_at) FROM crm.calendly_events ce WHERE ce.contact_id = c.contact_id)
          - (SELECT MIN(t.occurred_at) FROM crm.touchpoints t
             WHERE t.contact_id = c.contact_id AND t.event_type IN ('replied','reply_received'))
        )))::text as avg_days,
        COUNT(*)::text as count
      FROM crm.contacts c
      WHERE c.lifecycle_stage IN ('demo_completed','negotiation','won')
        AND EXISTS (SELECT 1 FROM crm.calendly_events ce WHERE ce.contact_id = c.contact_id)

      UNION ALL

      SELECT 'first_touch_to_close' as metric,
        ROUND(AVG(EXTRACT(DAY FROM c.updated_at -
          (SELECT MIN(t.occurred_at) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id)
        )))::text as avg_days,
        COUNT(*)::text as count
      FROM crm.contacts c
      WHERE c.lifecycle_stage = 'won'
    `);

    // Bottleneck detection: stages where contacts have been sitting too long
    const bottlenecks = await query<{
      stage: string;
      contact_name: string;
      business_name: string | null;
      days_stuck: string;
      contact_id: number;
    }>(`
      SELECT
        c.lifecycle_stage as stage,
        COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
        c.business_name,
        EXTRACT(DAY FROM NOW() - c.updated_at)::text as days_stuck,
        c.contact_id
      FROM crm.contacts c
      WHERE c.lifecycle_stage IN ('engaged','demo_completed','negotiation')
        AND c.updated_at < NOW() - INTERVAL '14 days'
      ORDER BY c.updated_at ASC
      LIMIT 15
    `);

    return NextResponse.json({
      stageDistribution,
      stageTransitions,
      velocityMetrics,
      bottlenecks,
    });
  } catch (error) {
    console.error('[velocity] error:', error);
    return NextResponse.json({ error: 'Failed to load velocity data' }, { status: 500 });
  }
}

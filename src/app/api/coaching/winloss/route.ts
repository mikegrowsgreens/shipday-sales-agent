import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/coaching/winloss
 * Win/Loss analysis - what worked for wins, where did losses drop off
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '90d';
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  try {
    // Won deals analysis
    const wonDeals = await query<{
      contact_id: number;
      contact_name: string;
      business_name: string | null;
      total_touches: string;
      channels_used: string;
      first_channel: string | null;
      last_channel: string | null;
      days_to_win: string | null;
      sequences_enrolled: string;
    }>(`
      SELECT
        c.contact_id,
        COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
        c.business_name,
        (SELECT COUNT(*) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id)::text as total_touches,
        (SELECT string_agg(DISTINCT channel, ', ') FROM crm.touchpoints t WHERE t.contact_id = c.contact_id) as channels_used,
        (SELECT channel FROM crm.touchpoints t WHERE t.contact_id = c.contact_id ORDER BY occurred_at ASC LIMIT 1) as first_channel,
        (SELECT channel FROM crm.touchpoints t WHERE t.contact_id = c.contact_id ORDER BY occurred_at DESC LIMIT 1) as last_channel,
        EXTRACT(DAY FROM c.updated_at - (SELECT MIN(occurred_at) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id))::text as days_to_win,
        (SELECT COUNT(*) FROM crm.sequence_enrollments se WHERE se.contact_id = c.contact_id)::text as sequences_enrolled
      FROM crm.contacts c
      WHERE c.lifecycle_stage = 'won'
        AND c.updated_at >= NOW() - INTERVAL '1 day' * $1
      ORDER BY c.updated_at DESC
      LIMIT 20
    `, [days]);

    // Lost deals analysis
    const lostDeals = await query<{
      contact_id: number;
      contact_name: string;
      business_name: string | null;
      total_touches: string;
      channels_used: string;
      last_event: string | null;
      last_channel: string | null;
      days_active: string | null;
      last_activity: string | null;
    }>(`
      SELECT
        c.contact_id,
        COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
        c.business_name,
        (SELECT COUNT(*) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id)::text as total_touches,
        (SELECT string_agg(DISTINCT channel, ', ') FROM crm.touchpoints t WHERE t.contact_id = c.contact_id) as channels_used,
        (SELECT event_type FROM crm.touchpoints t WHERE t.contact_id = c.contact_id ORDER BY occurred_at DESC LIMIT 1) as last_event,
        (SELECT channel FROM crm.touchpoints t WHERE t.contact_id = c.contact_id ORDER BY occurred_at DESC LIMIT 1) as last_channel,
        EXTRACT(DAY FROM c.updated_at - (SELECT MIN(occurred_at) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id))::text as days_active,
        (SELECT MAX(occurred_at)::text FROM crm.touchpoints t WHERE t.contact_id = c.contact_id) as last_activity
      FROM crm.contacts c
      WHERE c.lifecycle_stage = 'lost'
        AND c.updated_at >= NOW() - INTERVAL '1 day' * $1
      ORDER BY c.updated_at DESC
      LIMIT 20
    `, [days]);

    // Win patterns summary
    const winPatterns = await query<{
      avg_touches: string;
      avg_days: string;
      most_common_first_channel: string;
      total_won: string;
    }>(`
      SELECT
        ROUND(AVG(sub.touches), 1)::text as avg_touches,
        ROUND(AVG(sub.days_active))::text as avg_days,
        MODE() WITHIN GROUP (ORDER BY sub.first_channel)::text as most_common_first_channel,
        COUNT(*)::text as total_won
      FROM (
        SELECT
          c.contact_id,
          (SELECT COUNT(*) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id) as touches,
          EXTRACT(DAY FROM c.updated_at - (SELECT MIN(occurred_at) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id)) as days_active,
          (SELECT channel FROM crm.touchpoints t WHERE t.contact_id = c.contact_id ORDER BY occurred_at ASC LIMIT 1) as first_channel
        FROM crm.contacts c
        WHERE c.lifecycle_stage = 'won'
      ) sub
      WHERE sub.touches > 0
    `);

    // Loss patterns summary
    const lossPatterns = await query<{
      avg_touches: string;
      avg_days: string;
      most_common_last_event: string;
      total_lost: string;
    }>(`
      SELECT
        ROUND(AVG(sub.touches), 1)::text as avg_touches,
        ROUND(AVG(sub.days_active))::text as avg_days,
        MODE() WITHIN GROUP (ORDER BY sub.last_event)::text as most_common_last_event,
        COUNT(*)::text as total_lost
      FROM (
        SELECT
          c.contact_id,
          (SELECT COUNT(*) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id) as touches,
          EXTRACT(DAY FROM c.updated_at - (SELECT MIN(occurred_at) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id)) as days_active,
          (SELECT event_type FROM crm.touchpoints t WHERE t.contact_id = c.contact_id ORDER BY occurred_at DESC LIMIT 1) as last_event
        FROM crm.contacts c
        WHERE c.lifecycle_stage = 'lost'
      ) sub
      WHERE sub.touches > 0
    `);

    // Channel effectiveness comparison: win rate by first-touch channel
    const channelWinRate = await query<{
      channel: string;
      total: string;
      won: string;
      lost: string;
      win_rate: string;
    }>(`
      SELECT
        sub.first_channel as channel,
        COUNT(*)::text as total,
        COUNT(CASE WHEN sub.stage = 'won' THEN 1 END)::text as won,
        COUNT(CASE WHEN sub.stage = 'lost' THEN 1 END)::text as lost,
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(CASE WHEN sub.stage = 'won' THEN 1 END)::numeric / COUNT(*)::numeric) * 100, 1)::text
          ELSE '0'
        END as win_rate
      FROM (
        SELECT
          c.lifecycle_stage as stage,
          (SELECT channel FROM crm.touchpoints t WHERE t.contact_id = c.contact_id ORDER BY occurred_at ASC LIMIT 1) as first_channel
        FROM crm.contacts c
        WHERE c.lifecycle_stage IN ('won', 'lost')
      ) sub
      WHERE sub.first_channel IS NOT NULL
      GROUP BY sub.first_channel
      ORDER BY COUNT(CASE WHEN sub.stage = 'won' THEN 1 END) DESC
    `);

    return NextResponse.json({
      wonDeals,
      lostDeals,
      winPatterns: winPatterns[0] || {},
      lossPatterns: lossPatterns[0] || {},
      channelWinRate,
    });
  } catch (error) {
    console.error('[winloss] error:', error);
    return NextResponse.json({ error: 'Failed to load win/loss data' }, { status: 500 });
  }
}

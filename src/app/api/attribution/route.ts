import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/attribution
 * Revenue attribution data - trace closed deals through touch chains.
 * Scoped to current tenant's org_id.
 */
export async function GET(request: NextRequest) {
  const tenant = await requireTenantSession();
  const orgId = tenant.org_id;

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '90d';
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  try {
    // Won deals with their full touch chain
    const wonDeals = await query<{
      contact_id: number;
      contact_name: string;
      business_name: string | null;
      lifecycle_stage: string;
      won_at: string;
      total_touches: string;
      first_touch_date: string | null;
      days_to_close: string | null;
    }>(`
      SELECT
        c.contact_id,
        COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
        c.business_name,
        c.lifecycle_stage,
        c.updated_at as won_at,
        (SELECT COUNT(*) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id AND t.org_id = $2)::text as total_touches,
        (SELECT MIN(t.occurred_at) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id AND t.org_id = $2)::text as first_touch_date,
        EXTRACT(DAY FROM c.updated_at - (SELECT MIN(t.occurred_at) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id AND t.org_id = $2))::text as days_to_close
      FROM crm.contacts c
      WHERE c.lifecycle_stage IN ('won', 'demo_completed', 'negotiation')
        AND c.updated_at >= NOW() - INTERVAL '1 day' * $1
        AND c.org_id = $2
      ORDER BY c.updated_at DESC
      LIMIT 50
    `, [days, orgId]);

    // Touch chain details for won deals
    const touchChains = await query<{
      contact_id: number;
      touchpoint_id: number;
      channel: string;
      event_type: string;
      direction: string;
      source_system: string;
      subject: string | null;
      body_preview: string | null;
      occurred_at: string;
      metadata: Record<string, unknown>;
    }>(`
      SELECT t.*
      FROM crm.touchpoints t
      WHERE t.contact_id IN (
        SELECT c.contact_id FROM crm.contacts c
        WHERE c.lifecycle_stage IN ('won', 'demo_completed', 'negotiation')
          AND c.updated_at >= NOW() - INTERVAL '1 day' * $1
          AND c.org_id = $2
      )
        AND t.org_id = $2
      ORDER BY t.contact_id, t.occurred_at ASC
    `, [days, orgId]);

    // Channel attribution summary
    const channelAttribution = await query<{
      channel: string;
      touch_count: string;
      unique_contacts: string;
    }>(`
      SELECT
        t.channel,
        COUNT(*)::text as touch_count,
        COUNT(DISTINCT t.contact_id)::text as unique_contacts
      FROM crm.touchpoints t
      WHERE t.contact_id IN (
        SELECT c.contact_id FROM crm.contacts c
        WHERE c.lifecycle_stage IN ('won', 'demo_completed', 'negotiation')
          AND c.org_id = $1
      )
        AND t.org_id = $1
      GROUP BY t.channel
      ORDER BY COUNT(*) DESC
    `, [orgId]);

    // Email angle performance
    const anglePerformance = await query<{
      angle: string;
      total_sent: string;
      total_opened: string;
      total_replied: string;
      reply_rate: string;
    }>(`
      SELECT
        COALESCE(l.email_angle, 'unknown') as angle,
        COUNT(CASE WHEN es.sent_at IS NOT NULL THEN 1 END)::text as total_sent,
        COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::text as total_opened,
        COUNT(CASE WHEN es.replied = true THEN 1 END)::text as total_replied,
        CASE
          WHEN COUNT(CASE WHEN es.sent_at IS NOT NULL THEN 1 END) > 0
          THEN ROUND((COUNT(CASE WHEN es.replied = true THEN 1 END)::numeric /
                COUNT(CASE WHEN es.sent_at IS NOT NULL THEN 1 END)::numeric) * 100, 1)::text
          ELSE '0'
        END as reply_rate
      FROM bdr.email_sends es
      JOIN bdr.leads l ON l.lead_id = es.lead_id::text
      WHERE es.sent_at >= NOW() - INTERVAL '1 day' * $1
        AND es.org_id = $2
      GROUP BY l.email_angle
      ORDER BY COUNT(CASE WHEN es.replied = true THEN 1 END) DESC
    `, [days, orgId]);

    // Sequence attribution
    const sequenceAttribution = await query<{
      sequence_id: number;
      sequence_name: string;
      total_enrolled: string;
      total_replied: string;
      total_booked: string;
      conversion_rate: string;
    }>(`
      SELECT
        s.sequence_id,
        s.name as sequence_name,
        COUNT(se.enrollment_id)::text as total_enrolled,
        COUNT(CASE WHEN se.status = 'replied' THEN 1 END)::text as total_replied,
        COUNT(CASE WHEN se.status = 'booked' THEN 1 END)::text as total_booked,
        CASE
          WHEN COUNT(se.enrollment_id) > 0
          THEN ROUND((COUNT(CASE WHEN se.status IN ('replied','booked') THEN 1 END)::numeric /
                COUNT(se.enrollment_id)::numeric) * 100, 1)::text
          ELSE '0'
        END as conversion_rate
      FROM crm.sequences s
      LEFT JOIN crm.sequence_enrollments se ON se.sequence_id = s.sequence_id
      WHERE s.org_id = $1
      GROUP BY s.sequence_id, s.name
      HAVING COUNT(se.enrollment_id) > 0
      ORDER BY COUNT(CASE WHEN se.status IN ('replied','booked') THEN 1 END) DESC
    `, [orgId]);

    // Average touches to conversion
    const avgTouches = await query<{
      avg_touches: string;
      avg_days: string;
      total_won: string;
    }>(`
      SELECT
        ROUND(AVG(touch_count), 1)::text as avg_touches,
        ROUND(AVG(days_to_first))::text as avg_days,
        COUNT(*)::text as total_won
      FROM (
        SELECT
          c.contact_id,
          (SELECT COUNT(*) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id AND t.org_id = $1) as touch_count,
          EXTRACT(DAY FROM c.updated_at - (SELECT MIN(t.occurred_at) FROM crm.touchpoints t WHERE t.contact_id = c.contact_id AND t.org_id = $1)) as days_to_first
        FROM crm.contacts c
        WHERE c.lifecycle_stage = 'won'
          AND c.org_id = $1
      ) sub
      WHERE touch_count > 0
    `, [orgId]);

    // Group touch chains by contact
    const chainsByContact: Record<number, typeof touchChains> = {};
    for (const touch of touchChains) {
      if (!chainsByContact[touch.contact_id]) chainsByContact[touch.contact_id] = [];
      chainsByContact[touch.contact_id].push(touch);
    }

    return NextResponse.json({
      wonDeals: wonDeals.map(d => ({
        ...d,
        touchChain: chainsByContact[d.contact_id] || [],
      })),
      channelAttribution,
      anglePerformance,
      sequenceAttribution,
      summary: avgTouches[0] || { avg_touches: '0', avg_days: '0', total_won: '0' },
    });
  } catch (error) {
    console.error('[attribution] error:', error);
    return NextResponse.json({ error: 'Failed to load attribution data' }, { status: 500 });
  }
}

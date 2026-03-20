import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/bdr/tracker
 * Email tracking — live sends, opens, clicks, replies with date range filtering.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { searchParams } = request.nextUrl;
    const range = searchParams.get('range') || '30d';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Parameterized date filter builder — startIdx allows reserving $1 for org_id
    type DateFilter = { filter: string; params: unknown[] };

    function buildDateFilter(col: string, startIdx = 1): DateFilter {
      if (from) {
        if (to) {
          return {
            filter: `AND ${col} >= $${startIdx}::date AND ${col} <= $${startIdx + 1}::date + INTERVAL '1 day'`,
            params: [from, to],
          };
        }
        return { filter: `AND ${col} >= $${startIdx}::date`, params: [from] };
      }
      const daysMap: Record<string, number> = {
        today: 1, '7d': 7, '14d': 14, '30d': 30, '90d': 90,
      };
      const days = daysMap[range];
      if (days) {
        return {
          filter: `AND ${col} >= NOW() - INTERVAL '1 day' * $${startIdx}`,
          params: [days],
        };
      }
      return { filter: '', params: [] };
    }

    const df = buildDateFilter('es.sent_at', 2);

    // Summary stats
    const [summary] = await query<Record<string, string>>(
      `SELECT
        COUNT(*)::text as total_sent,
        COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as total_opened,
        COUNT(CASE WHEN click_count > 0 THEN 1 END)::text as total_clicked,
        COUNT(CASE WHEN replied THEN 1 END)::text as total_replied,
        SUM(open_count)::text as total_opens,
        SUM(click_count)::text as total_clicks,
        ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as open_rate,
        ROUND(COUNT(CASE WHEN click_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as click_rate,
        ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as reply_rate
      FROM bdr.email_sends es
      WHERE es.org_id = $1 ${df.filter}`,
      [orgId, ...df.params]
    );

    // Recent email activity — sends with tracking data
    const emails = await query<Record<string, unknown>>(
      `SELECT es.id, es.lead_id, es.to_email, es.subject, es.angle, es.variant_id,
             es.sent_at, es.open_count, es.first_open_at, es.last_open_at,
             es.click_count, es.replied, es.reply_at, es.reply_sentiment,
             es.reply_classification,
             l.business_name, l.contact_name, l.tier, l.status as lead_status
      FROM bdr.email_sends es
      JOIN bdr.leads l ON l.lead_id = es.lead_id
      WHERE es.org_id = $1 ${df.filter}
      ORDER BY es.sent_at DESC
      LIMIT 100`,
      [orgId, ...df.params]
    );

    // Angle performance for date range
    const anglePerf = await query<Record<string, string>>(
      `SELECT angle,
        COUNT(*)::text as sent,
        COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opens,
        COUNT(CASE WHEN click_count > 0 THEN 1 END)::text as clicks,
        COUNT(CASE WHEN replied THEN 1 END)::text as replies,
        ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as open_rate,
        ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as reply_rate
      FROM bdr.email_sends es
      WHERE es.org_id = $1 ${df.filter} AND angle IS NOT NULL
      GROUP BY angle`,
      [orgId, ...df.params]
    );

    // Daily send/open/reply trend
    const trend = await query<Record<string, string>>(
      `SELECT DATE(es.sent_at)::text as day,
        COUNT(*)::text as sent,
        COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opened,
        COUNT(CASE WHEN replied THEN 1 END)::text as replied
      FROM bdr.email_sends es
      WHERE es.org_id = $1 ${df.filter}
      GROUP BY DATE(es.sent_at)
      ORDER BY day ASC`,
      [orgId, ...df.params]
    );

    // Recent events from email_events table
    const events = await query<Record<string, unknown>>(
      `SELECT ee.event_id, ee.lead_id, ee.event_type, ee.to_email, ee.subject,
             ee.event_at, ee.metadata,
             l.business_name, l.contact_name
      FROM bdr.email_events ee
      LEFT JOIN bdr.leads l ON l.lead_id = ee.lead_id
      WHERE ee.org_id = $1
      ORDER BY ee.event_at DESC
      LIMIT 50`,
      [orgId]
    );

    return NextResponse.json({
      summary: summary || {},
      emails,
      anglePerf,
      trend: trend.map(t => ({
        day: t.day,
        sent: parseInt(t.sent),
        opened: parseInt(t.opened),
        replied: parseInt(t.replied),
      })),
      events,
    });
  } catch (error) {
    console.error('[bdr/tracker] error:', error);
    return NextResponse.json({ error: 'Failed to fetch tracker data' }, { status: 500 });
  }
}

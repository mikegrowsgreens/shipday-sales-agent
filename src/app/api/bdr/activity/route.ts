import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/bdr/activity
 * Email sends and events feed. Supports date range filtering.
 * ?range=7d|14d|30d|90d|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const range = searchParams.get('range') || '30d';
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build date filter
    let dateFilter = '';
    const params: unknown[] = [];
    let pi = 1;

    if (range === 'custom' && from) {
      dateFilter = `AND es.sent_at >= $${pi++}`;
      params.push(from);
      if (to) {
        dateFilter += ` AND es.sent_at < ($${pi++})::date + 1`;
        params.push(to);
      }
    } else if (range !== 'all') {
      const daysMap: Record<string, number> = { '1d': 1, '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
      const days = daysMap[range] || 30;
      dateFilter = `AND es.sent_at > NOW() - INTERVAL '1 day' * $${pi++}`;
      params.push(days);
    }

    // Build events date filter (same logic but for event_at)
    let evDateFilter = dateFilter.replace(/es\.sent_at/g, 'ee.event_at');

    // Recent sends
    const sends = await query<Record<string, unknown>>(
      `SELECT es.id, es.lead_id, es.gmail_message_id, es.subject, es.angle,
              es.sent_at, es.open_count, es.replied, es.reply_at,
              l.business_name, l.contact_name, l.contact_email
       FROM bdr.email_sends es
       JOIN bdr.leads l ON l.lead_id = es.lead_id
       WHERE 1=1 ${dateFilter}
       ORDER BY es.sent_at DESC
       LIMIT $${pi}`,
      [...params, limit]
    );

    // Recent events — mirror the date-filter params (same positional placeholders)
    const evParams: unknown[] = [...params];
    let evPi = evParams.length + 1;

    const events = await query<Record<string, unknown>>(
      `SELECT ee.event_id, ee.lead_id, ee.event_type, ee.event_at, ee.metadata,
              es.subject, l.business_name, l.contact_email
       FROM bdr.email_events ee
       JOIN bdr.leads l ON l.lead_id = ee.lead_id
       LEFT JOIN bdr.email_sends es ON es.lead_id = ee.lead_id
       WHERE 1=1 ${evDateFilter}
       ORDER BY ee.event_at DESC
       LIMIT $${evPi}`,
      [...evParams, limit]
    );

    return NextResponse.json({ sends, events });
  } catch (error) {
    console.error('[bdr-activity] error:', error);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }
}

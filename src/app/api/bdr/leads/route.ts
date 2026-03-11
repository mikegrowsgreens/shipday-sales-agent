import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/bdr/leads
 * Lead intake visibility — status funnel, recent leads, intake metrics.
 * Supports: ?status, ?tier, ?search, ?limit, ?offset, ?sort_by, ?sort_order, ?lead_id (detail mode)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') || '';
    const tier = searchParams.get('tier') || '';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortOrder = searchParams.get('sort_order') === 'asc' ? 'ASC' : 'DESC';
    const leadId = searchParams.get('lead_id');

    // ─── Single lead detail mode ─────────────────────────
    if (leadId) {
      const detail = await query<Record<string, unknown>>(
        `SELECT l.*,
                COALESCE(es_agg.es_send_count, 0)::int as es_send_count,
                es_agg.last_sent_at as es_last_sent_at,
                COALESCE(es_agg.total_opens, 0)::int as es_total_opens,
                COALESCE(es_agg.total_clicks, 0)::int as es_total_clicks,
                COALESCE(es_agg.has_reply, false) as es_has_reply,
                es_agg.last_reply_at as es_last_reply_at
         FROM bdr.leads l
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int as es_send_count,
                  MAX(sent_at) as last_sent_at,
                  SUM(COALESCE(open_count, 0))::int as total_opens,
                  SUM(COALESCE(click_count, 0))::int as total_clicks,
                  BOOL_OR(COALESCE(replied, false)) as has_reply,
                  MAX(reply_at) as last_reply_at
           FROM bdr.email_sends
           WHERE lead_id = l.lead_id
         ) es_agg ON true
         WHERE l.lead_id = $1`,
        [leadId]
      );

      if (detail.length === 0) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      }

      // Also fetch email send history for this lead
      const sends = await query<Record<string, unknown>>(
        `SELECT id, email_type, subject, angle, variant_id, sent_at,
                open_count, click_count, replied, reply_at, reply_sentiment
         FROM bdr.email_sends
         WHERE lead_id = $1
         ORDER BY sent_at DESC NULLS LAST`,
        [leadId]
      );

      return NextResponse.json({ lead: detail[0], sends });
    }

    // ─── Status distribution ─────────────────────────────
    const statusDist = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count FROM bdr.leads GROUP BY status ORDER BY COUNT(*) DESC`
    );

    // ─── Validate sort column (whitelist) ────────────────
    const allowedSortCols: Record<string, string> = {
      created_at: 'l.created_at',
      business_name: 'l.business_name',
      total_score: 'l.total_score',
      tier: 'l.tier',
      status: 'l.status',
      contact_name: 'l.contact_name',
      city: 'l.city',
      google_rating: 'l.google_rating',
      send_count: 'COALESCE(l.send_count, 0)',
      open_count: 'COALESCE(l.open_count, 0)',
    };
    const sortCol = allowedSortCols[sortBy] || 'l.created_at';

    // ─── Leads query ────────────────────────────────────
    let leadsSql = `
      SELECT l.lead_id, l.business_name, l.contact_name, l.contact_email, l.phone,
             l.city, l.state, l.cuisine_type, l.status, l.tier, l.total_score,
             l.google_rating, l.google_review_count, l.created_at, l.updated_at,
             COALESCE(l.send_count, 0)::int as send_count,
             l.last_sent_date as last_sent_at,
             COALESCE(l.open_count, 0)::int as total_opens,
             COALESCE(l.has_replied, false) as has_reply,
             l.reply_date as last_reply_at,
             l.email_angle
      FROM bdr.leads l
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let pi = 1;

    if (status) {
      leadsSql += ` AND l.status = $${pi++}`;
      params.push(status);
    }
    if (tier) {
      leadsSql += ` AND l.tier = $${pi++}`;
      params.push(tier);
    }
    if (search) {
      leadsSql += ` AND (l.business_name ILIKE $${pi} OR l.contact_name ILIKE $${pi} OR l.contact_email ILIKE $${pi} OR l.city ILIKE $${pi})`;
      params.push(`%${search}%`);
      pi++;
    }

    leadsSql += ` ORDER BY ${sortCol} ${sortOrder} NULLS LAST`;
    leadsSql += ` LIMIT $${pi++} OFFSET $${pi}`;
    params.push(limit, offset);

    const leads = await query<Record<string, unknown>>(leadsSql, params);

    // ─── Total count (for pagination) ────────────────────
    let countSql = `SELECT COUNT(*)::int as total FROM bdr.leads l WHERE 1=1`;
    const countParams: unknown[] = [];
    let ci = 1;
    if (status) { countSql += ` AND l.status = $${ci++}`; countParams.push(status); }
    if (tier) { countSql += ` AND l.tier = $${ci++}`; countParams.push(tier); }
    if (search) {
      countSql += ` AND (l.business_name ILIKE $${ci} OR l.contact_name ILIKE $${ci} OR l.contact_email ILIKE $${ci} OR l.city ILIKE $${ci})`;
      countParams.push(`%${search}%`);
      ci++;
    }
    const countResult = await query<{ total: number }>(countSql, countParams);
    const filteredTotal = countResult[0]?.total || 0;

    // ─── Intake by day (last 14 days) ────────────────────
    const intake = await query<{ day: string; count: string }>(
      `SELECT DATE(created_at)::text as day, COUNT(*)::text as count
       FROM bdr.leads
       WHERE created_at > NOW() - INTERVAL '14 days'
       GROUP BY DATE(created_at)
       ORDER BY day DESC`
    );

    // ─── Tier breakdown ──────────────────────────────────
    const tierDist = await query<{ tier: string; count: string }>(
      `SELECT COALESCE(tier, 'unscored') as tier, COUNT(*)::text as count
       FROM bdr.leads
       GROUP BY COALESCE(tier, 'unscored')
       ORDER BY count DESC`
    );

    const total = statusDist.reduce((sum, r) => sum + parseInt(r.count), 0);

    return NextResponse.json({
      leads,
      total,
      filteredTotal,
      statusDist: statusDist.map(r => ({ status: r.status, count: parseInt(r.count) })),
      intake: intake.map(r => ({ day: r.day, count: parseInt(r.count) })),
      tierDist: tierDist.map(r => ({ tier: r.tier, count: parseInt(r.count) })),
    });
  } catch (error) {
    console.error('[bdr/leads] error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

/**
 * PATCH /api/bdr/leads
 * Inline edit lead fields.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_id, ...fields } = body as { lead_id: string; [key: string]: unknown };

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id required' }, { status: 400 });
    }

    // Whitelist editable fields
    const editable = ['business_name', 'contact_name', 'contact_email', 'phone', 'city', 'state', 'cuisine_type'];
    const updates: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    for (const [key, val] of Object.entries(fields)) {
      if (editable.includes(key)) {
        updates.push(`${key} = $${pi++}`);
        params.push(val);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    params.push(lead_id);

    await query(
      `UPDATE bdr.leads SET ${updates.join(', ')} WHERE lead_id = $${pi}`,
      params
    );

    return NextResponse.json({ updated: true, lead_id });
  } catch (error) {
    console.error('[bdr/leads] patch error:', error);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}

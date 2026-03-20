import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';

const VALID_SORT_COLUMNS: Record<string, string> = {
  last_clicked: 'last_clicked_at',
  total_clicks: 'total_clicks',
  recipient: 'recipient_name',
};

/**
 * GET /api/email-tracking/clicks?sort=last_clicked&range=30d&from=...&to=...&page=1&limit=50
 * Returns paginated click events with recipient info, URL, email subject, and click counts.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const params = req.nextUrl.searchParams;
    const sortKey = params.get('sort') || 'last_clicked';
    const range = params.get('range') || '30d';
    const customFrom = params.get('from') || '';
    const customTo = params.get('to') || '';
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const sortCol = VALID_SORT_COLUMNS[sortKey] || 'last_clicked_at';
    const sortDir = sortKey === 'recipient' ? 'ASC NULLS LAST' : 'DESC NULLS LAST';

    // Build date filter
    const conditions = ['ee.org_id = $1', "ee.event_type = 'click'"];
    const queryParams: unknown[] = [orgId];
    let paramIdx = 2;

    const dateCondition = buildDateCondition(range, customFrom, customTo, paramIdx);
    if (dateCondition) {
      conditions.push(dateCondition.clause);
      queryParams.push(...dateCondition.params);
      paramIdx += dateCondition.params.length;
    }

    const whereClause = conditions.join(' AND ');

    // Aggregate stats query
    const statsResult = await query<{
      total_clicks: string;
      unique_recipients: string;
      unique_urls: string;
      total_sends_with_clicks: string;
      total_sends: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_clicks,
         COUNT(DISTINCT ee.to_email)::text AS unique_recipients,
         COUNT(DISTINCT ee.metadata->>'url')::text AS unique_urls,
         (SELECT COUNT(DISTINCT es2.id)::text
          FROM bdr.email_sends es2
          WHERE es2.org_id = $1 AND es2.click_count > 0) AS total_sends_with_clicks,
         (SELECT COUNT(*)::text FROM bdr.email_sends es3 WHERE es3.org_id = $1) AS total_sends
       FROM bdr.email_events ee
       WHERE ${whereClause}`,
      queryParams
    );

    const stats = statsResult[0] || {
      total_clicks: '0',
      unique_recipients: '0',
      unique_urls: '0',
      total_sends_with_clicks: '0',
      total_sends: '0',
    };

    // Most clicked URL
    const topUrlResult = await query<{ url: string; cnt: string }>(
      `SELECT ee.metadata->>'url' AS url, COUNT(*)::text AS cnt
       FROM bdr.email_events ee
       WHERE ${whereClause} AND ee.metadata->>'url' IS NOT NULL
       GROUP BY ee.metadata->>'url'
       ORDER BY COUNT(*) DESC
       LIMIT 1`,
      queryParams
    );
    const mostClickedUrl = topUrlResult[0]?.url || null;

    // Count query for pagination (grouped rows)
    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM (
         SELECT 1
         FROM bdr.email_events ee
         LEFT JOIN bdr.email_sends es ON es.id::text = ee.metadata->>'send_id' AND es.org_id = ee.org_id
         LEFT JOIN crm.contacts c ON c.email = ee.to_email AND c.org_id = ee.org_id
         WHERE ${whereClause} AND ee.metadata->>'url' IS NOT NULL
         GROUP BY ee.to_email, ee.metadata->>'url', es.id
       ) sub`,
      queryParams
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    // Main click data query — grouped by recipient + URL + email
    const rows = await query<{
      to_email: string;
      url: string;
      send_id: string | null;
      subject: string | null;
      contact_first_name: string | null;
      contact_last_name: string | null;
      contact_business: string | null;
      total_clicks: number;
      first_clicked_at: string;
      last_clicked_at: string;
      recipient_name: string | null;
    }>(
      `SELECT
         ee.to_email,
         ee.metadata->>'url' AS url,
         es.id AS send_id,
         es.subject,
         c.first_name AS contact_first_name,
         c.last_name AS contact_last_name,
         c.business_name AS contact_business,
         COUNT(*)::int AS total_clicks,
         MIN(ee.event_at) AS first_clicked_at,
         MAX(ee.event_at) AS last_clicked_at,
         COALESCE(c.first_name || ' ' || c.last_name, c.first_name, ee.to_email) AS recipient_name
       FROM bdr.email_events ee
       LEFT JOIN bdr.email_sends es ON es.id::text = ee.metadata->>'send_id' AND es.org_id = ee.org_id
       LEFT JOIN crm.contacts c ON c.email = ee.to_email AND c.org_id = ee.org_id
       WHERE ${whereClause} AND ee.metadata->>'url' IS NOT NULL
       GROUP BY ee.to_email, ee.metadata->>'url', es.id, es.subject,
                c.first_name, c.last_name, c.business_name
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...queryParams, limit, offset]
    );

    return NextResponse.json({
      clicks: rows,
      stats: {
        totalClicks: parseInt(stats.total_clicks, 10),
        uniqueRecipients: parseInt(stats.unique_recipients, 10),
        uniqueUrls: parseInt(stats.unique_urls, 10),
        clickThroughRate:
          parseInt(stats.total_sends, 10) > 0
            ? Math.round(
                (parseInt(stats.total_sends_with_clicks, 10) / parseInt(stats.total_sends, 10)) * 100
              )
            : 0,
        mostClickedUrl,
      },
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[email-tracking/clicks] GET error:', error);
    return NextResponse.json({ error: 'Failed to load click report data' }, { status: 500 });
  }
});

function buildDateCondition(
  range: string,
  customFrom: string,
  customTo: string,
  paramIdx: number
): { clause: string; params: unknown[] } | null {
  if (range === 'all') return null;

  if (range === 'custom' && customFrom) {
    if (customTo) {
      return {
        clause: `ee.event_at >= $${paramIdx}::timestamp AND ee.event_at < ($${paramIdx + 1}::date + interval '1 day')`,
        params: [customFrom, customTo],
      };
    }
    return {
      clause: `ee.event_at >= $${paramIdx}::timestamp`,
      params: [customFrom],
    };
  }

  const intervalMap: Record<string, string> = {
    today: '1 day',
    '7d': '7 days',
    '14d': '14 days',
    '30d': '30 days',
    '90d': '90 days',
  };

  const interval = intervalMap[range];
  if (!interval) return null;

  return {
    clause: `ee.event_at >= NOW() - interval '${interval}'`,
    params: [],
  };
}

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';

const VALID_SORT_COLUMNS: Record<string, string> = {
  last_opened: 'es.last_open_at',
  last_sent: 'es.sent_at',
  most_opens: 'es.open_count',
  most_clicks: 'es.click_count',
};

/**
 * GET /api/email-tracking?sort=last_opened&search=...&page=1&limit=50
 * Returns paginated tracked email list with contact names and activity summaries.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const params = req.nextUrl.searchParams;
    const sortKey = params.get('sort') || 'last_sent';
    const search = params.get('search') || '';
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const sortCol = VALID_SORT_COLUMNS[sortKey] || 'es.sent_at';
    const sortDir = sortKey === 'last_sent' ? 'DESC' : 'DESC NULLS LAST';

    // Build WHERE clause
    const conditions = ['es.org_id = $1'];
    const queryParams: unknown[] = [orgId];
    let paramIdx = 2;

    if (search.trim()) {
      conditions.push(
        `(c.first_name ILIKE $${paramIdx} OR c.last_name ILIKE $${paramIdx} OR c.email ILIKE $${paramIdx} OR es.to_email ILIKE $${paramIdx} OR es.subject ILIKE $${paramIdx})`
      );
      queryParams.push(`%${search.trim()}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Count query
    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM bdr.email_sends es
       LEFT JOIN crm.contacts c ON c.email = es.to_email AND c.org_id = es.org_id
       WHERE ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    // Main query with last event info
    const rows = await query<{
      id: string;
      to_email: string;
      from_email: string;
      subject: string;
      gmail_thread_id: string | null;
      open_count: number;
      click_count: number;
      replied: boolean;
      reply_at: string | null;
      first_open_at: string | null;
      last_open_at: string | null;
      sent_at: string;
      contact_first_name: string | null;
      contact_last_name: string | null;
      contact_business: string | null;
      last_event_at: string | null;
      last_event_type: string | null;
    }>(
      `SELECT
         es.id,
         es.to_email,
         es.from_email,
         es.subject,
         es.gmail_thread_id,
         es.open_count,
         es.click_count,
         es.replied,
         es.reply_at,
         es.first_open_at,
         es.last_open_at,
         es.sent_at,
         c.first_name AS contact_first_name,
         c.last_name AS contact_last_name,
         c.business_name AS contact_business,
         latest_evt.last_event_at,
         latest_evt.last_event_type
       FROM bdr.email_sends es
       LEFT JOIN crm.contacts c ON c.email = es.to_email AND c.org_id = es.org_id
       LEFT JOIN LATERAL (
         SELECT ee.event_at AS last_event_at, ee.event_type AS last_event_type
         FROM bdr.email_events ee
         WHERE ee.metadata->>'send_id' = es.id::text AND ee.org_id = es.org_id
         ORDER BY ee.event_at DESC
         LIMIT 1
       ) latest_evt ON true
       WHERE ${whereClause}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...queryParams, limit, offset]
    );

    return NextResponse.json({
      emails: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[email-tracking] GET error:', error);
    return NextResponse.json({ error: 'Failed to load email tracking data' }, { status: 500 });
  }
});

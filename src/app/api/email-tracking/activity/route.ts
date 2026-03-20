import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';

const VALID_EVENT_TYPES = ['open', 'click', 'reply'];

/**
 * GET /api/email-tracking/activity?type=all&page=1&limit=30
 * Returns a paginated real-time activity feed of email events,
 * joined with email send records and contact info.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const params = req.nextUrl.searchParams;
    const eventType = params.get('type') || 'all';
    const page = Math.max(1, parseInt(params.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '30', 10)));
    const offset = (page - 1) * limit;

    // Build WHERE clause
    const conditions = ['ee.org_id = $1'];
    const queryParams: unknown[] = [orgId];
    let paramIdx = 2;

    if (eventType !== 'all' && VALID_EVENT_TYPES.includes(eventType)) {
      conditions.push(`ee.event_type = $${paramIdx}`);
      queryParams.push(eventType);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Count query
    const countResult = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM bdr.email_events ee
       WHERE ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    // Main activity feed query — events joined with sends + contacts
    const rows = await query<{
      event_id: number;
      event_type: string;
      event_at: string;
      to_email: string;
      from_email: string;
      metadata: Record<string, unknown> | null;
      send_id: string | null;
      subject: string | null;
      gmail_thread_id: string | null;
      contact_first_name: string | null;
      contact_last_name: string | null;
      contact_business: string | null;
    }>(
      `SELECT
         ee.event_id,
         ee.event_type,
         ee.event_at,
         ee.to_email,
         ee.from_email,
         ee.metadata,
         es.id AS send_id,
         es.subject,
         es.gmail_thread_id,
         c.first_name AS contact_first_name,
         c.last_name AS contact_last_name,
         c.business_name AS contact_business
       FROM bdr.email_events ee
       LEFT JOIN bdr.email_sends es
         ON es.id::text = ee.metadata->>'send_id' AND es.org_id = ee.org_id
       LEFT JOIN crm.contacts c
         ON c.email = ee.to_email AND c.org_id = ee.org_id
       WHERE ${whereClause}
       ORDER BY ee.event_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...queryParams, limit, offset]
    );

    // Event type counts for tab badges
    const countsResult = await query<{ event_type: string; cnt: string }>(
      `SELECT ee.event_type, COUNT(*)::text AS cnt
       FROM bdr.email_events ee
       WHERE ee.org_id = $1
       GROUP BY ee.event_type`,
      [orgId]
    );
    const typeCounts: Record<string, number> = {};
    for (const row of countsResult) {
      typeCounts[row.event_type] = parseInt(row.cnt, 10);
    }

    return NextResponse.json({
      events: rows,
      typeCounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('[email-tracking/activity] GET error:', error);
    return NextResponse.json({ error: 'Failed to load activity feed' }, { status: 500 });
  }
});

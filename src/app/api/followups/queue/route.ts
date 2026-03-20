import { NextRequest, NextResponse } from 'next/server';
import { queryDeals } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/followups/queue
 * Fetch all upcoming follow-up email drafts across all deals, ordered by scheduled time.
 * This powers the Queue tab — a unified view of every pending/approved/scheduled email.
 *
 * Query params:
 *   - filter: 'today' | 'week' | 'all' | 'overdue' (default: 'all')
 *   - status: 'draft' | 'approved' | 'sent' | '' (default: '' = draft+approved)
 *   - search: search term for business/contact name
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const userEmail = tenant.email;
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all';
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';

    // Use d.* to avoid missing-column errors, then pick fields in JS
    let sql = `
      SELECT
        ed.draft_id AS id,
        ed.deal_id,
        ed.touch_number,
        ed.subject,
        ed.body_plain,
        ed.status,
        ed.suggested_send_time,
        ed.scheduled_at,
        ed.sent_at,
        ed.approved_at,
        ed.mike_edited,
        ed.created_at,
        d.*,
        (SELECT COUNT(*) FROM deals.email_drafts e2 WHERE e2.deal_id = d.deal_id) AS total_touches,
        (SELECT COUNT(*) FROM deals.email_drafts e2 WHERE e2.deal_id = d.deal_id AND e2.status = 'sent') AS sent_touches
      FROM deals.email_drafts ed
      JOIN deals.deals d ON d.deal_id = ed.deal_id
      WHERE d.org_id = $1
        AND d.owner_email = $2
        AND (d.agent_status IS NULL OR d.agent_status NOT IN ('archived'))
    `;
    const params: unknown[] = [orgId, userEmail];
    let pi = 3;

    // Status filter
    if (status) {
      sql += ` AND ed.status = $${pi++}`;
      params.push(status);
    } else {
      // Default: show drafts and approved (upcoming)
      sql += ` AND ed.status IN ('draft', 'approved')`;
    }

    // Time filter
    if (filter === 'today') {
      sql += ` AND COALESCE(ed.scheduled_at, ed.suggested_send_time)::date = CURRENT_DATE`;
    } else if (filter === 'week') {
      sql += ` AND COALESCE(ed.scheduled_at, ed.suggested_send_time) <= NOW() + interval '7 days'`;
    } else if (filter === 'overdue') {
      sql += ` AND COALESCE(ed.scheduled_at, ed.suggested_send_time) < NOW() AND ed.status != 'sent'`;
    }

    // Search
    if (search) {
      sql += ` AND (d.business_name ILIKE $${pi} OR d.contact_name ILIKE $${pi})`;
      params.push(`%${search}%`);
      pi++;
    }

    sql += ` ORDER BY COALESCE(ed.scheduled_at, ed.suggested_send_time) ASC NULLS LAST LIMIT 200`;

    const queue = await queryDeals(sql, params);

    // Group by date for the UI
    const grouped: Record<string, typeof queue> = {};
    for (const item of queue) {
      const rec = item as Record<string, unknown>;
      const sendTime = (rec.scheduled_at || rec.suggested_send_time) as string | null;
      const dateKey = sendTime ? new Date(sendTime).toISOString().split('T')[0] : 'unscheduled';
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(item);
    }

    return NextResponse.json({
      queue,
      grouped,
      total: queue.length,
    });
  } catch (error) {
    console.error('[followups/queue] error:', error);
    return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { queryShipday } from '@/lib/db';

/**
 * GET /api/followups/deals
 * List all post-demo deals with optional filters.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage') || '';
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const touchProgress = searchParams.get('touch_progress') || ''; // none, started, halfway, almost_done
    const urgency = searchParams.get('urgency') || '';
    const sortBy = searchParams.get('sort') || 'next_touch'; // next_touch, last_activity, business_name, engagement

    let sql = `
      SELECT d.*,
             (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id) AS draft_count,
             (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id AND ed.status = 'sent') AS sent_count,
             (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id AND ed.status = 'draft') AS pending_count,
             (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id AND ed.status = 'approved') AS approved_count,
             (SELECT MAX(al.created_at) FROM shipday.activity_log al WHERE al.deal_id = d.deal_id) AS last_activity_at,
             (SELECT al.action_type FROM shipday.activity_log al WHERE al.deal_id = d.deal_id ORDER BY al.created_at DESC LIMIT 1) AS last_activity_type,
             (SELECT json_agg(json_build_object(
               'touch_number', ed.touch_number,
               'status', ed.status,
               'sent_at', ed.sent_at,
               'scheduled_at', COALESCE(ed.scheduled_at, ed.suggested_send_time)
             ) ORDER BY ed.touch_number)
             FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id) AS touch_summary
      FROM shipday.deals d
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let pi = 1;

    if (stage) {
      sql += ` AND d.pipeline_stage = $${pi++}`;
      params.push(stage);
    }
    if (status) {
      sql += ` AND d.agent_status = $${pi++}`;
      params.push(status);
    } else {
      sql += ` AND (d.agent_status IS NULL OR d.agent_status NOT IN ('completed', 'archived'))`;
    }
    if (urgency) {
      sql += ` AND d.urgency_level = $${pi++}`;
      params.push(urgency);
    }
    if (search) {
      sql += ` AND (d.business_name ILIKE $${pi} OR d.contact_name ILIKE $${pi} OR d.contact_email ILIKE $${pi})`;
      params.push(`%${search}%`);
      pi++;
    }

    // Touch progress filter (post-query sub-select)
    if (touchProgress === 'none') {
      sql += ` AND (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id) = 0`;
    } else if (touchProgress === 'started') {
      sql += ` AND (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id AND ed.status = 'sent') > 0
               AND (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id AND ed.status = 'sent')
                   < (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id) * 0.5`;
    } else if (touchProgress === 'halfway') {
      sql += ` AND (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id AND ed.status = 'sent')
                   >= (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id) * 0.5
               AND (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id AND ed.status = 'sent')
                   < (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id)`;
    } else if (touchProgress === 'complete') {
      sql += ` AND (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id) > 0
               AND (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id AND ed.status = 'sent')
                   = (SELECT COUNT(*) FROM shipday.email_drafts ed WHERE ed.deal_id = d.deal_id)`;
    }

    // Sort
    if (sortBy === 'last_activity') {
      sql += ` ORDER BY (SELECT MAX(al.created_at) FROM shipday.activity_log al WHERE al.deal_id = d.deal_id) DESC NULLS LAST`;
    } else if (sortBy === 'business_name') {
      sql += ` ORDER BY d.business_name ASC NULLS LAST`;
    } else if (sortBy === 'engagement') {
      sql += ` ORDER BY d.engagement_score DESC NULLS LAST`;
    } else {
      sql += ` ORDER BY d.next_touch_due ASC NULLS LAST, d.updated_at DESC`;
    }

    sql += ` LIMIT 100`;

    const deals = await queryShipday(sql, params);

    return NextResponse.json({ deals, total: deals.length });
  } catch (error) {
    console.error('[followups/deals] error:', error);
    return NextResponse.json({ error: 'Failed to load deals' }, { status: 500 });
  }
}

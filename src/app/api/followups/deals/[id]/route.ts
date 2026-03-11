import { NextRequest, NextResponse } from 'next/server';
import { query, queryShipday, queryShipdayOne } from '@/lib/db';

/**
 * GET /api/followups/deals/[id]
 * Full deal detail with email drafts and activity log.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const deal = await queryShipdayOne(
      `SELECT * FROM shipday.deals WHERE deal_id = $1`,
      [id],
    );

    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    const drafts = await queryShipday(
      `SELECT * FROM shipday.email_drafts WHERE deal_id = $1 ORDER BY touch_number ASC`,
      [id],
    );

    const activity = await queryShipday(
      `SELECT * FROM shipday.activity_log WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id],
    );

    // Pull call notes from wincall_brain (public.calls) for this deal
    // Match strategy: deal_id, attendee email, OR business name in call title
    const dealRecord = deal as { business_name?: string; contact_email?: string };
    const businessName = dealRecord.business_name || '';
    const contactEmail = dealRecord.contact_email || '';

    const callNotes = await query<{
      call_id: string;
      title: string | null;
      call_date: string | null;
      fathom_url: string | null;
      fathom_summary: string | null;
      meeting_summary: string | null;
      action_items: string | null;
      topics_discussed: unknown;
      duration_seconds: number | null;
    }>(
      `SELECT call_id, title, call_date, fathom_url, fathom_summary,
              meeting_summary, action_items, topics_discussed, duration_seconds
       FROM public.calls
       WHERE deal_id = $1
          OR ($2 != '' AND $2 = ANY(attendee_emails))
          OR ($3 != '' AND title ILIKE '%' || $3 || '%')
       ORDER BY call_date DESC
       LIMIT 10`,
      [id, contactEmail, businessName],
    );

    return NextResponse.json({ deal, drafts, activity, callNotes });
  } catch (error) {
    console.error('[followups/deals/id] error:', error);
    return NextResponse.json({ error: 'Failed to load deal' }, { status: 500 });
  }
}

/**
 * PATCH /api/followups/deals/[id]
 * Update deal notes, stage, or timing fields.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'pipeline_stage', 'agent_status', 'urgency_level',
      'next_touch_due', 'fathom_summary', 'action_items',
    ];

    const sets: string[] = [];
    const values: unknown[] = [];
    let pi = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${pi++}`);
        values.push(body[field]);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    await queryShipday(
      `UPDATE shipday.deals SET ${sets.join(', ')} WHERE deal_id = $${pi}`,
      values,
    );

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error('[followups/deals/id patch] error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

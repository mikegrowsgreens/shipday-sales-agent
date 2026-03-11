import { NextRequest, NextResponse } from 'next/server';
import { queryShipday } from '@/lib/db';

/**
 * PATCH /api/followups/drafts/[id]
 * Update a draft's subject, body, send time, or status.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ['subject', 'body_plain', 'body_html', 'suggested_send_time', 'scheduled_at', 'status'];
    const sets: string[] = [];
    const values: unknown[] = [];
    let pi = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${pi++}`);
        values.push(body[field]);
      }
    }

    // Mark as edited by Mike
    if (body.subject !== undefined || body.body_plain !== undefined) {
      sets.push(`mike_edited = true`);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    values.push(parseInt(id));

    await queryShipday(
      `UPDATE shipday.email_drafts SET ${sets.join(', ')} WHERE id = $${pi}`,
      values,
    );

    // Log activity when content is edited
    if (body.subject !== undefined || body.body_plain !== undefined) {
      const draft = await queryShipday<{ deal_id: string; touch_number: number }>(
        `SELECT deal_id, touch_number FROM shipday.email_drafts WHERE id = $1`,
        [parseInt(id)],
      );
      if (draft[0]) {
        await queryShipday(
          `INSERT INTO shipday.activity_log (deal_id, action_type, touch_number, notes, created_at)
           VALUES ($1, 'draft_edited', $2, 'Manual edit', NOW())`,
          [draft[0].deal_id, draft[0].touch_number],
        );
      }
    }

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error('[followups/drafts] error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

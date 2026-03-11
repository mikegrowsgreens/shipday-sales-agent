import { NextRequest, NextResponse } from 'next/server';
import { queryShipday } from '@/lib/db';

/**
 * POST /api/followups/add-touch
 * Add a manual touch to a deal's campaign.
 * Body: { deal_id: string, subject?: string, body_plain?: string, suggested_send_time?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deal_id, subject, body_plain, suggested_send_time } = body as {
      deal_id: string;
      subject?: string;
      body_plain?: string;
      suggested_send_time?: string;
    };

    if (!deal_id) {
      return NextResponse.json({ error: 'deal_id is required' }, { status: 400 });
    }

    // Get the next touch number
    const maxTouch = await queryShipday<{ max_touch: number }>(
      `SELECT COALESCE(MAX(touch_number), 0) as max_touch FROM shipday.email_drafts WHERE deal_id = $1`,
      [deal_id],
    );
    const nextTouchNumber = (maxTouch[0]?.max_touch || 0) + 1;

    // Insert the new touch
    const result = await queryShipday<{ id: number }>(
      `INSERT INTO shipday.email_drafts (deal_id, touch_number, subject, body_plain, suggested_send_time, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'draft', NOW(), NOW())
       RETURNING id`,
      [deal_id, nextTouchNumber, subject || '', body_plain || '', suggested_send_time || null],
    );

    // Log activity
    await queryShipday(
      `INSERT INTO shipday.activity_log (deal_id, action_type, touch_number, notes, created_at)
       VALUES ($1, 'touch_added', $2, 'Manual touch added', NOW())`,
      [deal_id, nextTouchNumber],
    );

    return NextResponse.json({
      id: result[0]?.id,
      touch_number: nextTouchNumber,
    });
  } catch (error) {
    console.error('[followups/add-touch] error:', error);
    return NextResponse.json({ error: 'Failed to add touch' }, { status: 500 });
  }
}

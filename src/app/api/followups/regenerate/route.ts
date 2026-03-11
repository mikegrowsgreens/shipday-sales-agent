import { NextRequest, NextResponse } from 'next/server';
import { queryShipdayOne, queryShipday } from '@/lib/db';
import { regenerateFollowUpTouch } from '@/lib/ai';

/**
 * POST /api/followups/regenerate
 * Regenerate a single follow-up touch via Claude AI.
 * Body: { draft_id: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { draft_id } = body as { draft_id: number };

    if (!draft_id) {
      return NextResponse.json({ error: 'draft_id is required' }, { status: 400 });
    }

    // Load the draft
    const draft = await queryShipdayOne<{
      id: number;
      deal_id: string;
      touch_number: number;
      subject: string;
      body_plain: string;
    }>(
      `SELECT id, deal_id, touch_number, subject, body_plain
       FROM shipday.email_drafts WHERE id = $1`,
      [draft_id],
    );

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    // Load deal context
    const deal = await queryShipdayOne<{
      contact_name: string;
      business_name: string;
      contact_email: string;
      pipeline_stage: string;
      pain_points: unknown;
      fathom_summary: string;
      action_items: string;
    }>(
      `SELECT contact_name, contact_email, business_name, pipeline_stage,
              pain_points, fathom_summary, action_items
       FROM shipday.deals WHERE deal_id = $1`,
      [draft.deal_id],
    );

    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    // Load other touches for context
    const otherDrafts = await queryShipday<{ touch_number: number; subject: string }>(
      `SELECT touch_number, subject FROM shipday.email_drafts
       WHERE deal_id = $1 AND id != $2
       ORDER BY touch_number ASC`,
      [draft.deal_id, draft_id],
    );

    const painPoints = Array.isArray(deal.pain_points)
      ? (deal.pain_points as string[]).join(', ')
      : typeof deal.pain_points === 'string'
        ? deal.pain_points
        : '';

    // Regenerate via Claude
    const result = await regenerateFollowUpTouch(
      {
        contact_name: deal.contact_name || 'there',
        business_name: deal.business_name || 'your restaurant',
        email: deal.contact_email || '',
        stage: deal.pipeline_stage || 'demo_completed',
        pain_points: painPoints,
        demo_notes: deal.fathom_summary || '',
        additional_context: deal.action_items || '',
      },
      draft.touch_number,
      draft.subject || '',
      draft.body_plain || '',
      otherDrafts,
    );

    // Update draft in DB
    await queryShipday(
      `UPDATE shipday.email_drafts
       SET subject = $1, body_plain = $2, mike_edited = false, updated_at = NOW()
       WHERE id = $3`,
      [result.subject, result.body, draft_id],
    );

    // Log activity
    await queryShipday(
      `INSERT INTO shipday.activity_log (deal_id, action_type, touch_number, notes, created_at)
       VALUES ($1, 'touch_regenerated', $2, $3, NOW())`,
      [draft.deal_id, draft.touch_number, JSON.stringify({ draft_id })],
    );

    return NextResponse.json({
      draft_id,
      subject: result.subject,
      body: result.body,
    });
  } catch (error) {
    console.error('[followups/regenerate] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Regeneration failed' },
      { status: 500 },
    );
  }
}

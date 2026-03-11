import { NextRequest, NextResponse } from 'next/server';
import { queryShipday, queryShipdayOne } from '@/lib/db';

/**
 * POST /api/followups/test-send
 * Send a test email to Mike's own address for a specific draft.
 * Fires the same n8n webhook but with to=mike.paulus@shipday.com and test=true.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { draft_id } = body as { draft_id: number };

    if (!draft_id) {
      return NextResponse.json({ error: 'draft_id required' }, { status: 400 });
    }

    const draft = await queryShipdayOne<{
      id: number;
      deal_id: string;
      touch_number: number;
      subject: string;
      body_html: string;
      body_plain: string;
    }>(
      `SELECT id, deal_id, touch_number, subject,
              COALESCE(body_html, '') as body_html,
              COALESCE(body_plain, '') as body_plain
       FROM shipday.email_drafts WHERE id = $1`,
      [draft_id],
    );

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    const deal = await queryShipdayOne<{
      contact_name: string;
      business_name: string;
    }>(
      `SELECT contact_name, business_name FROM shipday.deals WHERE deal_id = $1`,
      [draft.deal_id],
    );

    // Load signature from org settings
    const org = await queryShipdayOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM shipday.organizations LIMIT 1`,
    );
    const signature = (org?.settings as Record<string, unknown>)?.email_signature as string || '';

    // Append signature to body
    const bodyWithSig = draft.body_html
      ? `${draft.body_html}<br/><br/>${signature}`
      : `<div style="white-space:pre-line">${draft.body_plain}</div><br/><br/>${signature}`;

    const webhookUrl = `${process.env.N8N_BASE_URL || 'https://automation.mikegrowsgreens.com'}/webhook/followup-send-approved`;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft_id: draft.id,
        deal_id: draft.deal_id,
        touch_number: draft.touch_number,
        to: 'mike.paulus@shipday.com',
        subject: `[TEST] ${draft.subject}`,
        body_html: bodyWithSig,
        body_plain: draft.body_plain,
        contact_name: deal?.contact_name || '',
        business_name: deal?.business_name || '',
        test: true,
      }),
    });

    return NextResponse.json({ sent: true, to: 'mike.paulus@shipday.com' });
  } catch (error) {
    console.error('[followups/test-send] error:', error);
    return NextResponse.json({ error: 'Test send failed' }, { status: 500 });
  }
}

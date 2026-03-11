import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { N8N_WEBHOOK_KEY } from '@/lib/config';

/**
 * POST /api/track/sent
 * Callback from n8n after an email is actually sent via Gmail.
 * Updates email_sends with gmail_message_id and gmail_thread_id,
 * and transitions the lead status to 'sent'.
 *
 * Auth: webhook key via x-webhook-key header
 * Body: { send_id, gmail_message_id, gmail_thread_id, lead_id }
 */
export async function POST(request: NextRequest) {
  const webhookKey = request.headers.get('x-webhook-key');
  if (webhookKey !== N8N_WEBHOOK_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { send_id, gmail_message_id, gmail_thread_id, lead_id } = body;

    if (!send_id) {
      return NextResponse.json({ error: 'send_id required' }, { status: 400 });
    }

    // Update email_sends with Gmail IDs
    await query(
      `UPDATE bdr.email_sends
       SET gmail_message_id = COALESCE($2, gmail_message_id),
           gmail_thread_id = COALESCE($3, gmail_thread_id),
           sent_at = COALESCE(sent_at, NOW())
       WHERE id = $1`,
      [send_id, gmail_message_id || null, gmail_thread_id || null]
    );

    // Update lead status to 'sent' if lead_id provided
    if (lead_id) {
      await query(
        `UPDATE bdr.leads SET status = 'sent', updated_at = NOW()
         WHERE lead_id = $1 AND status IN ('approved', 'email_ready')`,
        [lead_id]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[track/sent] error:', error);
    return NextResponse.json({ error: 'Failed to record send' }, { status: 500 });
  }
}

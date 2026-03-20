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

    // Look up the send record's org_id for cross-tenant validation
    const sendRow = await query<{ org_id: number }>(
      `SELECT org_id FROM bdr.email_sends WHERE id = $1 LIMIT 1`,
      [send_id]
    );
    if (!sendRow.length) {
      return NextResponse.json({ error: 'Send record not found' }, { status: 404 });
    }
    const sendOrgId = sendRow[0].org_id;

    // Update email_sends with Gmail IDs — scoped to verified org
    await query(
      `UPDATE bdr.email_sends
       SET gmail_message_id = COALESCE($2, gmail_message_id),
           gmail_thread_id = COALESCE($3, gmail_thread_id),
           sent_at = COALESCE(sent_at, NOW())
       WHERE id = $1 AND org_id = $4`,
      [send_id, gmail_message_id || null, gmail_thread_id || null, sendOrgId]
    );

    // Update lead status to 'sent' if lead_id provided — scoped to same org
    if (lead_id) {
      await query(
        `UPDATE bdr.leads SET status = 'sent', updated_at = NOW()
         WHERE lead_id = $1 AND status IN ('approved', 'email_ready') AND org_id = $2`,
        [lead_id, sendOrgId]
      );

      // Log touchpoint for the sent event (closes the gap in the unified activity log)
      try {
        const contactRow = await query<{ contact_id: number }>(
          `SELECT contact_id FROM crm.contacts WHERE bdr_lead_id = $1::text AND org_id = $2 LIMIT 1`,
          [lead_id, sendOrgId]
        );
        if (contactRow[0]?.contact_id) {
          await query(
            `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, org_id, occurred_at)
             VALUES ($1, 'email', 'email_sent', 'outbound', 'bdr', 'Email sent', $2, $3, NOW())`,
            [
              contactRow[0].contact_id,
              JSON.stringify({ send_id, lead_id, gmail_message_id, gmail_thread_id }),
              sendOrgId,
            ]
          );
        }
      } catch (tpErr) {
        console.error('[track/sent] touchpoint error:', tpErr);
        // Non-blocking
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[track/sent] error:', error);
    return NextResponse.json({ error: 'Failed to record send' }, { status: 500 });
  }
}

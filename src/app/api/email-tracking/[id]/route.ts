import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';

/**
 * GET /api/email-tracking/[id]
 * Returns a single tracked email record with all its events for the detail view.
 */
export const GET = withAuth(async (req: NextRequest, { orgId, params }) => {
  try {
    const sendId = params?.id;
    if (!sendId) {
      return NextResponse.json({ error: 'Missing email ID' }, { status: 400 });
    }

    // Fetch the email send record with contact info
    const sendRows = await query<{
      id: string;
      to_email: string;
      from_email: string;
      subject: string;
      gmail_thread_id: string | null;
      gmail_message_id: string | null;
      open_count: number;
      click_count: number;
      replied: boolean;
      reply_at: string | null;
      reply_classification: string | null;
      first_open_at: string | null;
      last_open_at: string | null;
      sent_at: string;
      contact_first_name: string | null;
      contact_last_name: string | null;
      contact_business: string | null;
      contact_email: string | null;
    }>(
      `SELECT
         es.id,
         es.to_email,
         es.from_email,
         es.subject,
         es.gmail_thread_id,
         es.gmail_message_id,
         es.open_count,
         es.click_count,
         es.replied,
         es.reply_at,
         es.reply_classification,
         es.first_open_at,
         es.last_open_at,
         es.sent_at,
         c.first_name AS contact_first_name,
         c.last_name AS contact_last_name,
         c.business_name AS contact_business,
         c.email AS contact_email
       FROM bdr.email_sends es
       LEFT JOIN crm.contacts c ON c.email = es.to_email AND c.org_id = es.org_id
       WHERE es.id = $1 AND es.org_id = $2`,
      [sendId, orgId]
    );

    if (sendRows.length === 0) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    const emailSend = sendRows[0];

    // Fetch all events for this email, ordered chronologically (newest first)
    const events = await query<{
      event_id: number;
      event_type: string;
      event_at: string;
      to_email: string;
      from_email: string;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT
         ee.event_id,
         ee.event_type,
         ee.event_at,
         ee.to_email,
         ee.from_email,
         ee.metadata
       FROM bdr.email_events ee
       WHERE ee.metadata->>'send_id' = $1 AND ee.org_id = $2
       ORDER BY ee.event_at DESC`,
      [sendId, orgId]
    );

    return NextResponse.json({
      email: emailSend,
      events,
      totalEvents: events.length,
    });
  } catch (error) {
    console.error('[email-tracking/[id]] GET error:', error);
    return NextResponse.json({ error: 'Failed to load email detail' }, { status: 500 });
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { queryDealsOne, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgConfigFromSession } from '@/lib/org-config';
import { sendTestEmail, isValidEmail } from '@/lib/test-send';

/**
 * POST /api/followups/test-send
 * Send a test email for a specific draft.
 * Body: { draft_id: number, recipient_email?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json();
    const { draft_id, recipient_email } = body as { draft_id: number; recipient_email?: string };

    if (!draft_id) {
      return NextResponse.json({ error: 'draft_id required' }, { status: 400 });
    }

    if (recipient_email && !isValidEmail(recipient_email)) {
      return NextResponse.json({ error: 'Invalid recipient email' }, { status: 400 });
    }

    const config = await getOrgConfigFromSession();
    const testRecipient = recipient_email || config.persona?.sender_email || 'noreply@example.com';

    const draft = await queryDealsOne<{
      id: number;
      deal_id: string;
      touch_number: number;
      subject: string;
      body_html: string;
      body_plain: string;
    }>(
      `SELECT draft_id as id, deal_id, touch_number, subject,
              COALESCE(body_html, '') as body_html,
              COALESCE(body_plain, '') as body_plain
       FROM deals.email_drafts WHERE draft_id = $1`,
      [draft_id],
    );

    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    const deal = await queryDealsOne<{
      contact_name: string;
      business_name: string;
    }>(
      `SELECT contact_name, business_name FROM deals.deals WHERE deal_id = $1`,
      [draft.deal_id],
    );

    // Load signature from org settings (primary DB)
    const org = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM crm.organizations WHERE org_id = $1`,
      [orgId],
    );
    const signature = (org?.settings as Record<string, unknown>)?.email_signature as string || '';

    // Append signature to body
    const bodyWithSig = draft.body_html
      ? `${draft.body_html}<br/><br/>${signature}`
      : `<div style="white-space:pre-line">${draft.body_plain}</div><br/><br/>${signature}`;

    await sendTestEmail({
      subject: draft.subject,
      bodyHtml: bodyWithSig,
      bodyText: draft.body_plain,
      recipientEmail: testRecipient,
      senderEmail: config.persona?.sender_email,
      webhookPath: 'followup-send-approved',
      extraPayload: {
        draft_id: draft.id,
        deal_id: draft.deal_id,
        touch_number: draft.touch_number,
        contact_name: deal?.contact_name || '',
        business_name: deal?.business_name || '',
      },
    });

    return NextResponse.json({ sent: true, to: testRecipient });
  } catch (error) {
    console.error('[followups/test-send] error:', error);
    return NextResponse.json({ error: 'Test send failed' }, { status: 500 });
  }
}

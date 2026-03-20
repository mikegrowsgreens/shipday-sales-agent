import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { sendTestEmail, isValidEmail } from '@/lib/test-send';

/**
 * POST /api/bdr/campaigns/test-send
 * Send a test email for a specific lead's current email.
 * Body: { lead_id: number, recipient_email?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json();
    const { lead_id, recipient_email } = body as { lead_id: number; recipient_email?: string };

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id required' }, { status: 400 });
    }

    if (recipient_email && !isValidEmail(recipient_email)) {
      return NextResponse.json({ error: 'Invalid recipient email' }, { status: 400 });
    }

    const lead = await queryOne<{
      lead_id: number;
      contact_email: string;
      contact_name: string;
      business_name: string;
      email_subject: string;
      email_body: string;
      email_angle: string;
    }>(
      `SELECT lead_id, contact_email, contact_name, business_name,
              email_subject, email_body, email_angle
       FROM bdr.leads WHERE lead_id = $1 AND org_id = $2`,
      [lead_id, orgId]
    );

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.email_subject || !lead.email_body) {
      return NextResponse.json({ error: 'No email content generated for this lead' }, { status: 400 });
    }

    const orgConfig = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
    const senderEmail = orgConfig.persona?.sender_email || 'sales@example.com';
    // Test sends always go to the provided recipient (or sender's own email as fallback)
    const testRecipient = recipient_email || senderEmail;

    await sendTestEmail({
      subject: lead.email_subject,
      bodyText: lead.email_body,
      recipientEmail: testRecipient,
      senderEmail,
      senderName: orgConfig.persona?.sender_name,
      senderTitle: orgConfig.persona?.sender_title,
      extraPayload: {
        lead_id: lead.lead_id,
        contact_name: lead.contact_name,
        business_name: lead.business_name,
        angle: lead.email_angle,
        campaign_step: 1,
      },
    });

    return NextResponse.json({ sent: true, to: testRecipient, from: senderEmail });
  } catch (error) {
    console.error('[bdr/test-send] error:', error);
    return NextResponse.json({ error: 'Test send failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { sendTestEmail, isValidEmail } from '@/lib/test-send';

/**
 * POST /api/test-send
 * Generic test send for any email content already in hand.
 * Used by campaign previews, template previews, etc.
 * Body: { subject: string, body: string, recipient_email?: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requireTenantSession();

    const { subject, body, recipient_email } = await request.json();

    if (!subject || !body) {
      return NextResponse.json({ error: 'subject and body required' }, { status: 400 });
    }

    if (recipient_email && !isValidEmail(recipient_email)) {
      return NextResponse.json({ error: 'Invalid recipient email' }, { status: 400 });
    }

    const orgConfig = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
    const testRecipient = recipient_email || orgConfig.persona?.sender_email || 'sales@example.com';

    await sendTestEmail({
      subject,
      bodyText: body,
      recipientEmail: testRecipient,
      senderEmail: orgConfig.persona?.sender_email,
    });

    return NextResponse.json({ sent: true, to: testRecipient });
  } catch (error) {
    console.error('[test-send] error:', error);
    return NextResponse.json({ error: 'Test send failed' }, { status: 500 });
  }
}

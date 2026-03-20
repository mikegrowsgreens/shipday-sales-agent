import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { sendTestEmail, isValidEmail } from '@/lib/test-send';

/**
 * POST /api/sequences/test-send
 * Send a test email for a sequence step template.
 * Replaces template variables with sample values.
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

    // Replace template variables with sample values
    const sampleVars: Record<string, string> = {
      '{{first_name}}': 'John',
      '{{last_name}}': 'Smith',
      '{{business_name}}': 'Sample Restaurant',
      '{{company}}': 'Sample Restaurant',
      '{{city}}': 'Austin',
      '{{state}}': 'TX',
      '{{title}}': 'Owner',
    };

    let processedSubject = subject;
    let processedBody = body;
    for (const [key, value] of Object.entries(sampleVars)) {
      processedSubject = processedSubject.replaceAll(key, value);
      processedBody = processedBody.replaceAll(key, value);
    }

    const orgConfig = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
    const testRecipient = recipient_email || orgConfig.persona?.sender_email || 'sales@example.com';

    await sendTestEmail({
      subject: processedSubject,
      bodyText: processedBody,
      recipientEmail: testRecipient,
      senderEmail: orgConfig.persona?.sender_email,
    });

    return NextResponse.json({ sent: true, to: testRecipient });
  } catch (error) {
    console.error('[sequences/test-send] error:', error);
    return NextResponse.json({ error: 'Test send failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { CustomerCampaignSend } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';
import { sendEmail } from '@/lib/email';

// POST /api/customers/campaigns/[id]/send — Send approved emails
export const POST = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

    // Get approved sends
    const sends = await query<CustomerCampaignSend>(
      `SELECT * FROM crm.customer_campaign_sends
       WHERE campaign_id = $1 AND org_id = $2 AND status = 'approved'
       ORDER BY created_at`,
      [id, orgId]
    );

    if (!sends.length) {
      return NextResponse.json({ error: 'No approved emails to send' }, { status: 400 });
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const send of sends) {
      try {
        // Convert plain text body to simple HTML
        const htmlBody = (send.body || '')
          .split('\n')
          .map(line => line.trim() === '' ? '<br>' : `<p>${line}</p>`)
          .join('\n');

        const success = await sendEmail({
          to: send.to_email,
          subject: send.subject || '(no subject)',
          html: htmlBody,
          text: send.body || '',
          orgId,
        });

        if (success) {
          await queryOne(
            `UPDATE crm.customer_campaign_sends
             SET status = 'sent', sent_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND org_id = $2`,
            [send.id, orgId]
          );
          sent++;
        } else {
          await queryOne(
            `UPDATE crm.customer_campaign_sends
             SET status = 'bounced', updated_at = NOW()
             WHERE id = $1 AND org_id = $2`,
            [send.id, orgId]
          );
          failed++;
          errors.push(`${send.to_email}: SMTP send failed`);
        }
      } catch (err) {
        failed++;
        errors.push(`${send.to_email}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Update campaign stats
    await queryOne(
      `UPDATE crm.customer_campaigns SET
        sent_count = (SELECT COUNT(*) FROM crm.customer_campaign_sends WHERE campaign_id = $1 AND status = 'sent'),
        status = CASE
          WHEN (SELECT COUNT(*) FROM crm.customer_campaign_sends WHERE campaign_id = $1 AND status IN ('draft', 'approved')) = 0
          THEN 'completed' ELSE status END,
        updated_at = NOW()
       WHERE id = $1 AND org_id = $2`,
      [id, orgId]
    );

    return NextResponse.json({ sent, failed, errors: errors.slice(0, 10) });
  } catch (error) {
    console.error('[customers/campaigns/send] POST error:', error);
    return NextResponse.json({ error: 'Failed to send campaign' }, { status: 500 });
  }
});

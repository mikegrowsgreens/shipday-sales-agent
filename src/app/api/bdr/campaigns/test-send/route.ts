import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

/**
 * POST /api/bdr/campaigns/test-send
 * Send a test email to Mike's own address for a specific lead's current email.
 * Fires the same n8n webhook but with to=mike.paulus@shipday.com and test=true.
 * Body: { lead_id: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_id } = body as { lead_id: number };

    if (!lead_id) {
      return NextResponse.json({ error: 'lead_id required' }, { status: 400 });
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
       FROM bdr.leads WHERE lead_id = $1`,
      [lead_id]
    );

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.email_subject || !lead.email_body) {
      return NextResponse.json({ error: 'No email content generated for this lead' }, { status: 400 });
    }

    // Convert plain text body to HTML for sending
    const bodyHtml = `<html><body style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">${
      lead.email_body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>')
    }</body></html>`;

    const webhookUrl = `${process.env.N8N_BASE_URL || 'https://automation.mikegrowsgreens.com'}/webhook/dashboard-send-approved`;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        send_id: `test_${Date.now()}`,
        lead_id: lead.lead_id,
        to: 'mike.paulus@shipday.com',
        subject: `[TEST] ${lead.email_subject}`,
        body_html: bodyHtml,
        body_plain: lead.email_body,
        contact_name: lead.contact_name,
        business_name: lead.business_name,
        angle: lead.email_angle,
        campaign_step: 1,
        test: true,
      }),
    });

    return NextResponse.json({ sent: true, to: 'mike.paulus@shipday.com' });
  } catch (error) {
    console.error('[bdr/test-send] error:', error);
    return NextResponse.json({ error: 'Test send failed' }, { status: 500 });
  }
}

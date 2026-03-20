import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

/**
 * GET /api/phone/sms-templates - Get SMS templates for post-call follow-ups
 * POST /api/phone/sms-templates - Send SMS from template
 */

function buildSmsTemplates(senderName: string, companyName: string) {
  const senderFirst = senderName.split(' ')[0] || senderName;
  return [
    {
      id: 'voicemail_followup',
      name: 'Voicemail Follow-Up',
      category: 'post-call',
      template: `Hi {{first_name}}, this is ${senderFirst} from ${companyName}. Just left you a voicemail about helping {{business_name}}. Would love to connect — when works best for a quick chat?`,
    },
    {
      id: 'great_call',
      name: 'Great Call Follow-Up',
      category: 'post-call',
      template: `Great talking with you {{first_name}}! As discussed, I'll send over the details on how ${companyName} can help {{business_name}}. Looking forward to our next conversation!`,
    },
    {
      id: 'meeting_confirm',
      name: 'Meeting Confirmation',
      category: 'post-call',
      template: `Hi {{first_name}}, confirming our demo for {{meeting_date}}. I'll show you how ${companyName} handles everything we discussed. See you then!`,
    },
    {
      id: 'missed_call',
      name: 'Missed Call',
      category: 'post-call',
      template: `Hi {{first_name}}, tried reaching you today about {{business_name}}. I'll try again in a couple days, or feel free to text me back a good time!`,
    },
    {
      id: 'quick_question',
      name: 'Quick Question',
      category: 'outreach',
      template: `Hi {{first_name}}, quick question — would {{business_name}} benefit from what we offer? Either way, I think we can help. - ${senderFirst} @ ${companyName}`,
    },
    {
      id: 'check_in',
      name: 'Check-In',
      category: 'nurture',
      template: 'Hey {{first_name}}, just checking in on {{business_name}}. Have you had a chance to think about what we discussed? Happy to answer any questions!',
    },
  ];
}

export const GET = withAuth(async (_request, { orgId: _orgId }) => {
  const config = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
  const senderName = config.persona?.sender_name || 'Sales Team';
  const companyName = config.company_name || 'SalesHub';
  return NextResponse.json({ templates: buildSmsTemplates(senderName, companyName) });
});

export const POST = withAuth(async (request: NextRequest, { orgId }) => {
  try {
    const body = await request.json();
    const { template_id, contact_id, custom_body } = body;

    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
    }

    // Get contact for template substitution — scoped to org
    const contact = await query<{
      contact_id: number; phone: string | null;
      first_name: string | null; business_name: string | null;
    }>(
      `SELECT contact_id, phone, first_name, business_name FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`,
      [contact_id, orgId]
    );

    if (contact.length === 0 || !contact[0].phone) {
      return NextResponse.json({ error: 'Contact not found or no phone number' }, { status: 400 });
    }

    const config = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
    const senderName = config.persona?.sender_name || 'Sales Team';
    const companyName = config.company_name || 'SalesHub';
    const templates = buildSmsTemplates(senderName, companyName);

    let smsBody = custom_body;

    if (!smsBody && template_id) {
      const template = templates.find(t => t.id === template_id);
      if (!template) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      smsBody = template.template
        .replace(/\{\{first_name\}\}/g, contact[0].first_name || 'there')
        .replace(/\{\{business_name\}\}/g, contact[0].business_name || 'your business')
        .replace(/\{\{meeting_date\}\}/g, 'the scheduled time');
    }

    if (!smsBody) {
      return NextResponse.json({ error: 'No message body' }, { status: 400 });
    }

    // Send via existing Twilio SMS route logic
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioAuth || !twilioFrom) {
      return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
    }

    const msgParams = new URLSearchParams({
      To: contact[0].phone,
      From: twilioFrom,
      Body: smsBody,
    });

    const response = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: msgParams.toString(),
        timeout: 30000,
      }
    );

    const msgData = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: 'SMS send failed', details: msgData.message }, { status: 500 });
    }

    // Record — scoped to org
    await query(
      `INSERT INTO crm.sms_messages (contact_id, direction, from_number, to_number, body, twilio_sid, status, org_id)
       VALUES ($1, 'outbound', $2, $3, $4, $5, $6, $7)`,
      [contact_id, twilioFrom, contact[0].phone, smsBody, msgData.sid, msgData.status, orgId]
    );

    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, body_preview, metadata, occurred_at, org_id)
       VALUES ($1, 'sms', 'sent', 'outbound', 'saleshub', $2, $3, NOW(), $4)`,
      [contact_id, smsBody.substring(0, 200), JSON.stringify({ twilio_sid: msgData.sid, template_id }), orgId]
    );

    return NextResponse.json({
      success: true,
      message_sid: msgData.sid,
      body: smsBody,
    });
  } catch (error) {
    console.error('[phone/sms-templates] error:', error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
});

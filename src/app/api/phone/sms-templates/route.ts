import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/phone/sms-templates - Get SMS templates for post-call follow-ups
 * POST /api/phone/sms-templates - Send SMS from template
 */

const SMS_TEMPLATES = [
  {
    id: 'voicemail_followup',
    name: 'Voicemail Follow-Up',
    category: 'post-call',
    template: 'Hi {{first_name}}, this is Mike from Shipday. Just left you a voicemail about helping {{business_name}} streamline deliveries. Would love to connect — when works best for a quick chat?',
  },
  {
    id: 'great_call',
    name: 'Great Call Follow-Up',
    category: 'post-call',
    template: 'Great talking with you {{first_name}}! As discussed, I\'ll send over the details on how Shipday can help {{business_name}}. Looking forward to our next conversation!',
  },
  {
    id: 'meeting_confirm',
    name: 'Meeting Confirmation',
    category: 'post-call',
    template: 'Hi {{first_name}}, confirming our demo for {{meeting_date}}. I\'ll show you how Shipday handles everything we discussed. See you then!',
  },
  {
    id: 'missed_call',
    name: 'Missed Call',
    category: 'post-call',
    template: 'Hi {{first_name}}, tried reaching you today about delivery optimization for {{business_name}}. I\'ll try again in a couple days, or feel free to text me back a good time!',
  },
  {
    id: 'quick_question',
    name: 'Quick Question',
    category: 'outreach',
    template: 'Hi {{first_name}}, quick question — is {{business_name}} currently managing your own deliveries or using a third-party service? Either way, I think we can help. - Mike @ Shipday',
  },
  {
    id: 'check_in',
    name: 'Check-In',
    category: 'nurture',
    template: 'Hey {{first_name}}, just checking in on {{business_name}}. Have you had a chance to think about what we discussed? Happy to answer any questions!',
  },
];

export async function GET() {
  return NextResponse.json({ templates: SMS_TEMPLATES });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { template_id, contact_id, custom_body } = body;

    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
    }

    // Get contact for template substitution
    const contact = await query<{
      contact_id: number; phone: string | null;
      first_name: string | null; business_name: string | null;
    }>(
      `SELECT contact_id, phone, first_name, business_name FROM crm.contacts WHERE contact_id = $1`,
      [contact_id]
    );

    if (contact.length === 0 || !contact[0].phone) {
      return NextResponse.json({ error: 'Contact not found or no phone number' }, { status: 400 });
    }

    let smsBody = custom_body;

    if (!smsBody && template_id) {
      const template = SMS_TEMPLATES.find(t => t.id === template_id);
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

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: msgParams.toString(),
      }
    );

    const msgData = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: 'SMS send failed', details: msgData.message }, { status: 500 });
    }

    // Record
    await query(
      `INSERT INTO crm.sms_messages (contact_id, direction, from_number, to_number, body, twilio_sid, status)
       VALUES ($1, 'outbound', $2, $3, $4, $5, $6)`,
      [contact_id, twilioFrom, contact[0].phone, smsBody, msgData.sid, msgData.status]
    );

    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, body_preview, metadata, occurred_at)
       VALUES ($1, 'sms', 'sent', 'outbound', 'saleshub', $2, $3, NOW())`,
      [contact_id, smsBody.substring(0, 200), JSON.stringify({ twilio_sid: msgData.sid, template_id })]
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
}

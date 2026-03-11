import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

/**
 * POST /api/twilio/sms - Send an SMS via Twilio
 *
 * Body: { contact_id, body, task_id? }
 */
export async function POST(request: NextRequest) {
  const reqBody = await request.json();
  const { contact_id, body: smsBody, task_id } = reqBody;

  if (!contact_id || !smsBody) {
    return NextResponse.json({ error: 'contact_id and body required' }, { status: 400 });
  }

  const contact = await queryOne<{
    contact_id: number;
    phone: string | null;
    first_name: string | null;
    business_name: string | null;
  }>(
    `SELECT contact_id, phone, first_name, business_name FROM crm.contacts WHERE contact_id = $1`,
    [contact_id]
  );

  if (!contact?.phone) {
    return NextResponse.json({ error: 'Contact has no phone number' }, { status: 400 });
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioAuth || !twilioFrom) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
  }

  try {
    const msgParams = new URLSearchParams({
      To: contact.phone,
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
      console.error('[twilio/sms] error:', msgData);
      return NextResponse.json({ error: 'SMS send failed', details: msgData.message }, { status: 500 });
    }

    // Record in sms_messages table
    await query(
      `INSERT INTO crm.sms_messages (contact_id, direction, from_number, to_number, body, twilio_sid, status)
       VALUES ($1, 'outbound', $2, $3, $4, $5, $6)`,
      [contact_id, twilioFrom, contact.phone, smsBody, msgData.sid, msgData.status]
    );

    // Log touchpoint
    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, body_preview, metadata, occurred_at)
       VALUES ($1, 'sms', 'sent', 'outbound', 'saleshub', $2, $3, NOW())`,
      [
        contact_id,
        smsBody.substring(0, 200),
        JSON.stringify({ twilio_sid: msgData.sid, task_id }),
      ]
    );

    return NextResponse.json({
      success: true,
      message_sid: msgData.sid,
      status: msgData.status,
      to: contact.phone,
    });
  } catch (error) {
    console.error('[twilio/sms] error:', error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}

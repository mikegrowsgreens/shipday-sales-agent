import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { TRACKING_BASE_URL } from '@/lib/config';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/twilio/call - Initiate a Twilio click-to-call
 *
 * Creates a TwiML-powered outbound call from Mike's Twilio number
 * to the contact's phone, connecting to Mike's phone first (like a bridge).
 *
 * Body: { contact_id, task_id? }
 */
export async function POST(request: NextRequest) {
  const tenant = await requireTenantSession();
  const orgId = tenant.org_id;

  const body = await request.json();
  const { contact_id, task_id } = body;

  if (!contact_id) {
    return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
  }

  // Get contact phone
  const contact = await queryOne<{
    contact_id: number;
    phone: string | null;
    email: string;
    first_name: string | null;
    business_name: string | null;
  }>(
    `SELECT contact_id, phone, email, first_name, business_name FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`,
    [contact_id, orgId]
  );

  if (!contact?.phone) {
    return NextResponse.json({ error: 'Contact has no phone number' }, { status: 400 });
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  const repPhone = process.env.TWILIO_REP_PHONE;
  const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL || `${TRACKING_BASE_URL}/api/twilio/status`;

  if (!twilioSid || !twilioAuth || !twilioFrom) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
  }

  try {
    // Create call via Twilio REST API
    // This calls Mike first, then connects to the contact
    const twiml = `<Response><Dial callerId="${twilioFrom}"><Number>${contact.phone}</Number></Dial></Response>`;

    const callParams = new URLSearchParams({
      To: repPhone || twilioFrom, // Call Mike first
      From: twilioFrom,
      Twiml: twiml,
      StatusCallback: statusCallback,
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
    });

    const response = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: callParams.toString(),
        timeout: 30000,
      }
    );

    const callData = await response.json();

    if (!response.ok) {
      console.error('[twilio/call] error:', callData);
      return NextResponse.json({ error: 'Twilio call failed', details: callData.message }, { status: 500 });
    }

    // Record in phone_calls table
    await query(
      `INSERT INTO crm.phone_calls (contact_id, direction, from_number, to_number, twilio_sid, status, metadata)
       VALUES ($1, 'outbound', $2, $3, $4, 'initiated', $5)`,
      [
        contact_id,
        twilioFrom,
        contact.phone,
        callData.sid,
        JSON.stringify({ task_id, call_data: { sid: callData.sid, status: callData.status } }),
      ]
    );

    // Log touchpoint
    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
       VALUES ($1, 'phone', 'call_initiated', 'outbound', 'saleshub', $2, $3, NOW())`,
      [
        contact_id,
        `Call to ${contact.first_name || 'contact'} @ ${contact.business_name || 'Unknown'}`,
        JSON.stringify({ twilio_sid: callData.sid, task_id }),
      ]
    );

    return NextResponse.json({
      success: true,
      call_sid: callData.sid,
      status: callData.status,
      to: contact.phone,
    });
  } catch (error) {
    console.error('[twilio/call] error:', error);
    return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 });
  }
}

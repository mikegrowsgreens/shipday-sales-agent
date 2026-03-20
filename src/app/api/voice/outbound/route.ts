import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

/**
 * POST /api/voice/outbound - Initiate an outbound AI voice agent call
 *
 * Creates a Twilio call to the prospect's phone number, then connects
 * the call to the voice agent WebSocket server via Media Stream.
 *
 * Body: { contact_id: number }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();
    const { contact_id } = body;

    if (!contact_id) {
      return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
    }

    // Get contact
    const contact = await queryOne<{
      contact_id: number;
      phone: string | null;
      first_name: string | null;
      last_name: string | null;
      business_name: string | null;
    }>(
      `SELECT contact_id, phone, first_name, last_name, business_name
       FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`,
      [contact_id, orgId]
    );

    if (!contact?.phone) {
      return NextResponse.json({ error: 'Contact has no phone number' }, { status: 400 });
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
    const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL || `${process.env.TRACKING_BASE_URL || ''}/api/twilio/status`;

    if (!twilioSid || !twilioAuth || !twilioFrom) {
      return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 });
    }

    // Build the TwiML URL that Twilio will fetch when the prospect answers
    const voiceAgentHost = process.env.VOICE_AGENT_HOST || 'wss://voice.mikegrowsgreens.com';
    const voiceAgentPort = process.env.VOICE_AGENT_PORT || '3006';
    const wsUrl = voiceAgentHost.includes('://') ? voiceAgentHost : `wss://${voiceAgentHost}:${voiceAgentPort}`;

    // TwiML to connect answered call to voice agent
    const twiml = `<Response><Connect><Stream url="${wsUrl}"><Parameter name="contact_id" value="${contact_id}" /><Parameter name="org_id" value="${orgId}" /><Parameter name="direction" value="outbound" /></Stream></Connect></Response>`;

    // Create the outbound call
    const callParams = new URLSearchParams({
      To: contact.phone,
      From: twilioFrom,
      Twiml: twiml,
      StatusCallback: statusCallback,
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
      MachineDetection: 'Enable', // Detect voicemail
      MachineDetectionTimeout: '5',
    });

    const response = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: callParams.toString(),
        timeout: 30000,
      }
    );

    const callData = await response.json();

    if (!response.ok) {
      console.error('[voice/outbound] Twilio error:', callData);
      return NextResponse.json({ error: 'Failed to initiate call', details: callData.message }, { status: 500 });
    }

    // Record the call
    await query(
      `INSERT INTO crm.phone_calls (contact_id, direction, from_number, to_number, twilio_sid, status, metadata)
       VALUES ($1, 'outbound', $2, $3, $4, 'initiated', $5)`,
      [
        contact_id,
        twilioFrom,
        contact.phone,
        callData.sid,
        JSON.stringify({ voice_agent: true, source: 'outbound' }),
      ]
    );

    // Record touchpoint
    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
       VALUES ($1, 'phone', 'ai_voice_call_initiated', 'outbound', 'voice-agent', $2, $3, NOW())`,
      [
        contact_id,
        `AI Voice Call to ${contact.first_name || 'contact'} @ ${contact.business_name || 'Unknown'}`,
        JSON.stringify({ twilio_sid: callData.sid, voice_agent: true }),
      ]
    );

    return NextResponse.json({
      success: true,
      call_sid: callData.sid,
      status: callData.status,
      to: contact.phone,
      voice_agent: true,
    });
  } catch (error) {
    console.error('[voice/outbound] Error:', error);
    return NextResponse.json({ error: 'Failed to initiate voice agent call' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * POST /api/voice/inbound - TwiML endpoint for inbound calls
 *
 * When a call comes in to the Twilio number, this returns TwiML
 * that redirects audio to the voice agent WebSocket server via Media Stream.
 *
 * Twilio sends form-encoded data with caller info.
 */
export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const params = new URLSearchParams(bodyText);

    const callSid = params.get('CallSid') || '';
    const from = params.get('From') || '';
    const to = params.get('To') || '';

    console.log(`[voice/inbound] Incoming call: ${callSid} from ${from} to ${to}`);

    // Try to match caller to a contact
    let contactId: string | undefined;
    let orgId: string | undefined;

    if (from) {
      const cleanPhone = from.replace(/\D/g, '');
      const contact = await query<{ contact_id: number; org_id: number }>(
        `SELECT contact_id, org_id FROM crm.contacts
         WHERE REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '+', '') LIKE '%' || $1
         LIMIT 1`,
        [cleanPhone.slice(-10)] // Match last 10 digits
      );

      if (contact.length > 0) {
        contactId = String(contact[0].contact_id);
        orgId = String(contact[0].org_id);
        console.log(`[voice/inbound] Matched contact: ${contactId} (org: ${orgId})`);
      }
    }

    // Record the incoming call
    if (contactId) {
      await query(
        `INSERT INTO crm.phone_calls (contact_id, direction, from_number, to_number, twilio_sid, status, metadata)
         VALUES ($1, 'inbound', $2, $3, $4, 'initiated', $5)`,
        [
          parseInt(contactId),
          from,
          to,
          callSid,
          JSON.stringify({ voice_agent: true, source: 'inbound' }),
        ]
      );
    }

    // Build custom parameters to pass to the WebSocket server
    const customParams = new URLSearchParams();
    if (contactId) customParams.set('contact_id', contactId);
    if (orgId) customParams.set('org_id', orgId);
    customParams.set('caller_number', from);
    customParams.set('direction', 'inbound');

    const voiceAgentHost = process.env.VOICE_AGENT_HOST || 'wss://voice.mikegrowsgreens.com';
    const voiceAgentPort = process.env.VOICE_AGENT_PORT || '3006';
    const wsUrl = voiceAgentHost.includes('://') ? voiceAgentHost : `wss://${voiceAgentHost}:${voiceAgentPort}`;

    // Return TwiML that connects to the voice agent via Media Stream
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      ${Array.from(customParams.entries()).map(([k, v]) => `<Parameter name="${k}" value="${v}" />`).join('\n      ')}
    </Stream>
  </Connect>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[voice/inbound] Error:', error);

    // Fallback: play a message and hang up
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">We're sorry, our voice system is temporarily unavailable. Please try again later or visit our website.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

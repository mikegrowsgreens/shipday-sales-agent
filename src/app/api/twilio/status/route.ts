import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { TWILIO_AUTH_TOKEN } from '@/lib/config';
import { verifyTwilioSignature } from '@/lib/twilio-verify';

/**
 * POST /api/twilio/status - Twilio call status callback (webhook)
 *
 * Receives call status updates and records them.
 * Updates phone_calls table with duration, status, etc.
 * Validates Twilio signature when TWILIO_AUTH_TOKEN is set.
 */
export async function POST(request: NextRequest) {
  try {
    // Clone the request to read body twice (once for verification, once for processing)
    const bodyText = await request.text();
    const formParams = new URLSearchParams(bodyText);

    // Verify Twilio signature if auth token is configured
    if (TWILIO_AUTH_TOKEN) {
      const twilioSig = request.headers.get('x-twilio-signature') || '';
      const requestUrl = request.url;
      const params: Record<string, string> = {};
      formParams.forEach((value, key) => { params[key] = value; });

      if (!verifyTwilioSignature(TWILIO_AUTH_TOKEN, twilioSig, requestUrl, params)) {
        console.warn('[twilio/status] Invalid Twilio signature');
        return new NextResponse('<Response/>', { status: 403, headers: { 'Content-Type': 'text/xml' } });
      }
    }

    const callSid = formParams.get('CallSid');
    const callStatus = formParams.get('CallStatus') || '';
    const callDuration = formParams.get('CallDuration') || '0';

    if (!callSid) {
      return NextResponse.json({ error: 'Missing CallSid' }, { status: 400 });
    }

    console.log(`[twilio/status] ${callSid}: ${callStatus} (${callDuration}s)`);

    // Update phone_calls record
    await query(
      `UPDATE crm.phone_calls
       SET status = $1,
           duration_seconds = $2,
           ended_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE ended_at END,
           metadata = metadata || jsonb_build_object('last_status', $1, 'duration', $2)
       WHERE twilio_sid = $3`,
      [callStatus, parseInt(callDuration), callSid]
    );

    // If call completed, update touchpoint
    if (callStatus === 'completed' && parseInt(callDuration) > 0) {
      await query(
        `UPDATE crm.touchpoints
         SET event_type = 'call_completed',
             metadata = metadata || jsonb_build_object('duration_seconds', $1, 'status', 'completed')
         WHERE channel = 'phone'
           AND metadata->>'twilio_sid' = $2`,
        [parseInt(callDuration), callSid]
      );
    }

    return new NextResponse('<Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[twilio/status] error:', error);
    return new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }
}

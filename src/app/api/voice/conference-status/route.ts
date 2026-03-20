import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/voice/conference-status - Conference status callback
 *
 * Receives events when participants join/leave conference rooms
 * during warm handoffs from the AI voice agent.
 */
export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();
    const params = new URLSearchParams(bodyText);

    const conferenceSid = params.get('ConferenceSid') || '';
    const statusCallbackEvent = params.get('StatusCallbackEvent') || '';
    const callSid = params.get('CallSid') || '';

    console.log(`[voice/conference] Event: ${statusCallbackEvent}, conference: ${conferenceSid}, call: ${callSid}`);

    // Could be extended to track handoff completion, update call records, etc.

    return new NextResponse('<Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('[voice/conference] Error:', error);
    return new NextResponse('<Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

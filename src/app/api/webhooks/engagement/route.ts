import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const contactId = searchParams.get('cid');
  const executionId = searchParams.get('eid');

  if (contactId) {
    try {
      // Log open event as touchpoint
      await query(
        `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, metadata)
         VALUES ($1, 'email', 'opened', 'outbound', 'saleshub', $2)`,
        [
          parseInt(contactId),
          JSON.stringify({ execution_id: executionId, user_agent: request.headers.get('user-agent') }),
        ]
      );

      // Update engagement score
      await query(
        `UPDATE crm.contacts SET engagement_score = engagement_score + 1 WHERE contact_id = $1`,
        [parseInt(contactId)]
      );

      // If linked to a sequence execution, update its status
      if (executionId) {
        await query(
          `UPDATE crm.sequence_step_executions SET status = 'opened' WHERE execution_id = $1 AND status = 'sent'`,
          [parseInt(executionId)]
        );
      }
    } catch (error) {
      console.error('[engagement] tracking error:', error);
    }
  }

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

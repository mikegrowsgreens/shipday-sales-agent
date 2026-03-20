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
      // Look up the contact's org_id for tenant-scoped writes
      const contactRow = await query<{ org_id: number }>(
        `SELECT org_id FROM crm.contacts WHERE contact_id = $1 LIMIT 1`,
        [parseInt(contactId)]
      );
      const contactOrgId = contactRow[0]?.org_id;
      if (!contactOrgId) {
        // Contact not found — skip tracking silently
        return new NextResponse(PIXEL, {
          headers: {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        });
      }

      // Log open event as touchpoint — scoped to contact's org
      await query(
        `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, metadata, org_id)
         VALUES ($1, 'email', 'opened', 'outbound', 'saleshub', $2, $3)`,
        [
          parseInt(contactId),
          JSON.stringify({ execution_id: executionId, user_agent: request.headers.get('user-agent') }),
          contactOrgId,
        ]
      );

      // Update engagement score — scoped to contact's org
      await query(
        `UPDATE crm.contacts SET engagement_score = engagement_score + 1 WHERE contact_id = $1 AND org_id = $2`,
        [parseInt(contactId), contactOrgId]
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

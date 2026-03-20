import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyTrackingToken } from '@/lib/hmac';

// 1x1 transparent PNG (68 bytes)
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * GET /api/track/o/[id]?sig={hmac}
 * Open-tracking pixel. Verifies HMAC signature, serves a 1x1 transparent PNG,
 * and logs the open event.
 * [id] = email_sends.id (UUID)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sendId } = await params;
  const sig = request.nextUrl.searchParams.get('sig') || '';

  // Verify HMAC signature
  if (!sig || !verifyTrackingToken(sendId, sig)) {
    // Still serve pixel (don't leak info) but don't log
    return new NextResponse(PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': PIXEL.length.toString(),
        'Cache-Control': 'no-store',
      },
    });
  }

  // Always serve the pixel immediately (don't block on DB)
  const response = new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': PIXEL.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });

  // Log the open event asynchronously (fire and forget)
  logOpen(sendId, request).catch(err =>
    console.error('[track/open] error:', err)
  );

  return response;
}

async function logOpen(sendId: string, request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Derive org_id from the send record for tenant scoping
  const orgRow = await query<{ org_id: number }>(
    `SELECT org_id FROM bdr.email_sends WHERE id = $1`,
    [sendId]
  );
  const orgId = orgRow[0]?.org_id;
  if (!orgId) return; // Unknown send record — skip silently

  // Update email_sends counters (scoped to org)
  await query(
    `UPDATE bdr.email_sends
     SET open_count = open_count + 1,
         first_open_at = COALESCE(first_open_at, NOW()),
         last_open_at = NOW()
     WHERE id = $1 AND org_id = $2`,
    [sendId, orgId]
  );

  // Insert event record (scoped to org)
  await query(
    `INSERT INTO bdr.email_events (lead_id, event_type, event_at, metadata, org_id)
     SELECT es.lead_id, 'open', NOW(),
            jsonb_build_object(
              'send_id', $1,
              'ip', $2,
              'user_agent', LEFT($3, 200)
            ),
            es.org_id
     FROM bdr.email_sends es WHERE es.id = $1 AND es.org_id = $4`,
    [sendId, ip, userAgent, orgId]
  );
}

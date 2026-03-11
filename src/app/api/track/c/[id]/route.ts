import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyTrackingToken } from '@/lib/hmac';

const FALLBACK_URL = 'https://mikegrowsgreens.com';

/**
 * GET /api/track/c/[id]?url={encodedUrl}&i={linkIndex}&sig={hmac}
 * Click-tracking redirect. Verifies HMAC signature, logs the click event,
 * and redirects to the original URL.
 * [id] = email_sends.id (UUID)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sendId } = await params;
  const url = request.nextUrl.searchParams.get('url');
  const linkIndex = request.nextUrl.searchParams.get('i') || '0';
  const sig = request.nextUrl.searchParams.get('sig') || '';

  // Fallback URL if none provided
  const redirectUrl = url || FALLBACK_URL;

  // Validate URL to prevent open redirect attacks
  try {
    const parsed = new URL(redirectUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.redirect(FALLBACK_URL);
    }
  } catch {
    return NextResponse.redirect(FALLBACK_URL);
  }

  // Verify HMAC signature — redirect either way but only log valid clicks
  if (sig && verifyTrackingToken(sendId, sig)) {
    // Log the click event asynchronously
    logClick(sendId, redirectUrl, linkIndex, request).catch(err =>
      console.error('[track/click] error:', err)
    );
  }

  // Redirect immediately
  return NextResponse.redirect(redirectUrl);
}

async function logClick(sendId: string, url: string, linkIndex: string, request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Update email_sends click counter
  await query(
    `UPDATE bdr.email_sends
     SET click_count = click_count + 1
     WHERE id = $1`,
    [sendId]
  );

  // Insert event record
  await query(
    `INSERT INTO bdr.email_events (lead_id, event_type, event_at, metadata)
     SELECT es.lead_id, 'click', NOW(),
            jsonb_build_object(
              'send_id', $1,
              'url', $2,
              'link_index', $3,
              'ip', $4,
              'user_agent', LEFT($5, 200)
            )
     FROM bdr.email_sends es WHERE es.id = $1`,
    [sendId, url, linkIndex, ip, userAgent]
  );
}

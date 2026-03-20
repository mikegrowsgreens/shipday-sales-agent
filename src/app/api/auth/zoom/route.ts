/**
 * GET /api/auth/zoom
 * Initiates Zoom OAuth flow.
 * Redirects the user to Zoom's consent screen.
 */

import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/tenant';
import { getAuthUrl } from '@/lib/zoom';

export async function GET() {
  try {
    const tenant = await requireTenantSession();

    // Encode user/org info in state for the callback
    const state = Buffer.from(
      JSON.stringify({
        userId: tenant.user_id,
        orgId: tenant.org_id,
        orgSlug: tenant.org_slug,
      })
    ).toString('base64url');

    const url = getAuthUrl(state);
    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[zoom/oauth] error:', error);
    return NextResponse.json({ error: 'Failed to initiate Zoom OAuth' }, { status: 500 });
  }
}

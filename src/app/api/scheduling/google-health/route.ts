/**
 * GET /api/scheduling/google-health
 * Comprehensive health check for Google Calendar integration.
 * Checks env vars, DB connection record, token expiry, and FreeBusy API.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/route-auth';
import { queryOne } from '@/lib/db';
import { getFreeBusy } from '@/lib/google-calendar';
import type { CalendarConnection } from '@/lib/types';

export const GET = withAuth(async (_request, { orgId, tenant }) => {
  const userId = tenant.user_id;
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || '';

  const envConfigured = !!(clientId && clientSecret);

  // Check DB for connection
  const connection = await queryOne<CalendarConnection>(
    `SELECT * FROM crm.calendar_connections
     WHERE org_id = $1 AND user_id = $2 AND provider = 'google'`,
    [orgId, userId],
  );

  const hasConnection = !!connection;
  const isActive = connection?.is_active ?? false;
  const accountEmail = connection?.account_email ?? null;
  const tokenExpiresAt = connection?.token_expires_at ?? null;
  const tokenExpired = tokenExpiresAt ? new Date(tokenExpiresAt) < new Date() : true;
  const tokenExpiresIn = tokenExpiresAt
    ? Math.max(0, Math.round((new Date(tokenExpiresAt).getTime() - Date.now()) / 1000))
    : 0;

  // Test FreeBusy API if connected
  let freeBusyWorking = false;
  let freeBusyError: string | null = null;

  if (connection && isActive) {
    try {
      const now = new Date();
      const oneHourLater = new Date(now.getTime() + 3600000);
      await getFreeBusy(connection, now.toISOString(), oneHourLater.toISOString());
      freeBusyWorking = true;
    } catch (err) {
      freeBusyError = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  const healthy = envConfigured && hasConnection && isActive && !tokenExpired && freeBusyWorking;

  return NextResponse.json({
    healthy,
    env: {
      configured: envConfigured,
      redirectUri: redirectUri || 'https://saleshub.mikegrowsgreens.com/api/auth/google-calendar/callback',
      clientIdSet: !!clientId,
      clientSecretSet: !!clientSecret,
    },
    connection: {
      exists: hasConnection,
      is_active: isActive,
      account_email: accountEmail,
      token_expires_at: tokenExpiresAt,
      token_expired: tokenExpired,
      token_expires_in_seconds: tokenExpiresIn,
    },
    freebusy: {
      working: freeBusyWorking,
      error: freeBusyError,
    },
  });
});

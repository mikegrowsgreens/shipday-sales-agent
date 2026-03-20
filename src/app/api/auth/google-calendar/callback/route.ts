/**
 * GET /api/auth/google-calendar/callback
 * Handles the OAuth callback from Google.
 * Exchanges the code for tokens, encrypts them, and stores in DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, getAccountEmail } from '@/lib/google-calendar';
import { encryptToken } from '@/lib/crypto';
import { queryOne } from '@/lib/db';
import type { CalendarConnection } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');

  // User denied consent
  if (error) {
    console.warn('[google-calendar/callback] user denied:', error);
    return NextResponse.redirect(new URL('/calendar/connections?error=denied', request.url));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL('/calendar/connections?error=missing_params', request.url));
  }

  try {
    // Decode state
    const state = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    const { userId, orgId, orgSlug } = state as { userId: number; orgId: number; orgSlug: string };

    if (!userId || !orgId) {
      return NextResponse.redirect(new URL('/calendar/connections?error=invalid_state', request.url));
    }

    // Exchange code for tokens
    const tokens = await exchangeCode(code);

    // Get the Google account email
    const accountEmail = await getAccountEmail(tokens.access_token);

    // Encrypt tokens before storage
    const encryptedAccessToken = encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const scopes = tokens.scope ? tokens.scope.split(' ') : [];

    // Upsert: if a connection for this provider+user already exists, update it
    const connection = await queryOne<CalendarConnection>(
      `INSERT INTO crm.calendar_connections
        (org_id, user_id, provider, account_email, access_token, refresh_token, token_expires_at, scopes, is_active)
       VALUES ($1, $2, 'google', $3, $4, $5, $6, $7, true)
       ON CONFLICT (org_id, user_id, provider)
       DO UPDATE SET
         account_email = EXCLUDED.account_email,
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, crm.calendar_connections.refresh_token),
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [orgId, userId, accountEmail, encryptedAccessToken, encryptedRefreshToken, expiresAt, scopes]
    );

    console.log(`[google-calendar/callback] connected ${accountEmail} for user ${userId} org ${orgId} → connection_id=${connection?.connection_id}`);

    return NextResponse.redirect(
      new URL(`/calendar/connections?connected=google&email=${encodeURIComponent(accountEmail)}`, request.url)
    );
  } catch (err) {
    console.error('[google-calendar/callback] error:', err);
    return NextResponse.redirect(new URL('/calendar/connections?error=exchange_failed', request.url));
  }
}

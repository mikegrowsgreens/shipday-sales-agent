/**
 * Zoom API integration using raw fetch().
 * Handles OAuth, meeting creation/deletion for scheduling.
 */

import { encryptToken, decryptToken } from './crypto';
import { queryOne } from './db';
import type { CalendarConnection } from './types';

const ZOOM_AUTH_URL = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ZOOM_API = 'https://api.zoom.us/v2';

function getClientId(): string {
  const id = process.env.ZOOM_CLIENT_ID;
  if (!id) throw new Error('ZOOM_CLIENT_ID not set');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.ZOOM_CLIENT_SECRET;
  if (!secret) throw new Error('ZOOM_CLIENT_SECRET not set');
  return secret;
}

function getRedirectUri(): string {
  return process.env.ZOOM_REDIRECT_URI || 'https://saleshub.mikegrowsgreens.com/api/auth/zoom/callback';
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

/**
 * Build Zoom OAuth consent URL.
 * @param state - opaque string passed through the OAuth flow
 */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    state,
  });
  return `${ZOOM_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 * Zoom uses Basic auth (base64 client_id:client_secret) for token exchange.
 */
export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const credentials = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString('base64');

  const res = await fetch(ZOOM_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom token exchange failed: ${err}`);
  }

  return res.json();
}

/**
 * Get the email address of the authenticated Zoom account.
 */
export async function getAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${ZOOM_API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get Zoom account email');
  const data = await res.json();
  return data.email;
}

// ─── Token Refresh ──────────────────────────────────────────────────────────

/**
 * Refresh the access token if expired. Returns the connection with updated tokens.
 * Persists the new tokens (encrypted) back to the database.
 */
export async function refreshTokenIfNeeded(
  connection: CalendarConnection
): Promise<CalendarConnection> {
  const now = new Date();
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;

  // If token is still valid (with 5-minute buffer), return as-is
  if (expiresAt && expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return connection;
  }

  // Decrypt the refresh token
  const refreshToken = connection.refresh_token ? decryptToken(connection.refresh_token) : null;
  if (!refreshToken) {
    throw new Error('No Zoom refresh token available — user must re-authenticate');
  }

  const credentials = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString('base64');

  const res = await fetch(ZOOM_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom token refresh failed: ${err}`);
  }

  const data = await res.json();
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  const encryptedAccessToken = encryptToken(data.access_token);
  const encryptedRefreshToken = data.refresh_token ? encryptToken(data.refresh_token) : null;

  // Zoom rotates refresh tokens — update both
  const updated = await queryOne<CalendarConnection>(
    `UPDATE crm.calendar_connections
     SET access_token = $1,
         refresh_token = COALESCE($2, refresh_token),
         token_expires_at = $3,
         updated_at = NOW()
     WHERE connection_id = $4
     RETURNING *`,
    [encryptedAccessToken, encryptedRefreshToken, newExpiresAt, connection.connection_id]
  );

  if (!updated) throw new Error('Failed to update refreshed Zoom token in DB');

  // Return with decrypted access token for immediate use
  return { ...updated, access_token: data.access_token };
}

/**
 * Get a usable access token from a connection (refreshing if needed).
 */
export async function getAccessToken(connection: CalendarConnection): Promise<string> {
  const refreshed = await refreshTokenIfNeeded(connection);
  // If refreshed, the access_token is already decrypted from the refresh flow
  if (refreshed.connection_id === connection.connection_id && refreshed.access_token === connection.access_token) {
    return decryptToken(connection.access_token);
  }
  return refreshed.access_token;
}

// ─── Meeting API ───────────────────────────────────────────────────────────

export interface CreateMeetingData {
  topic: string;
  startTime: string;   // ISO 8601
  duration: number;    // minutes
  timezone: string;
}

export interface CreatedMeeting {
  meetingId: number;
  joinUrl: string;
}

/**
 * Create a Zoom meeting.
 */
export async function createMeeting(
  connection: CalendarConnection,
  data: CreateMeetingData
): Promise<CreatedMeeting> {
  const accessToken = await getAccessToken(connection);

  const res = await fetch(`${ZOOM_API}/users/me/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: data.topic,
      type: 2, // Scheduled meeting
      start_time: data.startTime,
      duration: data.duration,
      timezone: data.timezone,
      settings: {
        join_before_host: true,
        waiting_room: false,
        auto_recording: 'none',
        meeting_authentication: false,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom create meeting failed: ${err}`);
  }

  const meeting = await res.json();

  return {
    meetingId: meeting.id,
    joinUrl: meeting.join_url,
  };
}

/**
 * Delete a Zoom meeting.
 */
export async function deleteMeeting(
  connection: CalendarConnection,
  meetingId: number | string
): Promise<void> {
  const accessToken = await getAccessToken(connection);

  const res = await fetch(`${ZOOM_API}/meetings/${meetingId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 404 is fine — meeting already deleted
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Zoom delete meeting failed: ${err}`);
  }
}

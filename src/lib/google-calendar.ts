/**
 * Google Calendar API integration using raw fetch().
 * Handles OAuth, FreeBusy queries, and event creation with Google Meet.
 */

import { encryptToken, decryptToken } from './crypto';
import { queryOne } from './db';
import type { CalendarConnection } from './types';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_CLIENT_ID not set');
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET not set');
  return secret;
}

function getRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || 'https://saleshub.mikegrowsgreens.com/api/auth/google-calendar/callback';
}

// ─── OAuth ──────────────────────────────────────────────────────────────────

/**
 * Build Google OAuth consent URL.
 * @param state - opaque string passed through the OAuth flow (e.g., JSON with orgId + userId)
 */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  return res.json();
}

/**
 * Get the email address of the authenticated Google account.
 */
export async function getAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to get Google account email');
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
    throw new Error('No refresh token available — user must re-authenticate');
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token refresh failed: ${err}`);
  }

  const data = await res.json();
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  const encryptedAccessToken = encryptToken(data.access_token);

  // Update in DB
  const updated = await queryOne<CalendarConnection>(
    `UPDATE crm.calendar_connections
     SET access_token = $1, token_expires_at = $2, updated_at = NOW()
     WHERE connection_id = $3
     RETURNING *`,
    [encryptedAccessToken, newExpiresAt, connection.connection_id]
  );

  if (!updated) throw new Error('Failed to update refreshed token in DB');

  // Return with decrypted access token for immediate use
  return { ...updated, access_token: data.access_token };
}

/**
 * Get a usable access token from a connection (refreshing if needed).
 */
export async function getAccessToken(connection: CalendarConnection): Promise<string> {
  const refreshed = await refreshTokenIfNeeded(connection);
  // If refreshed, the access_token is already decrypted from the refresh flow
  // If not refreshed, we need to decrypt it
  if (refreshed.connection_id === connection.connection_id && refreshed.access_token === connection.access_token) {
    return decryptToken(connection.access_token);
  }
  return refreshed.access_token;
}

// ─── Calendar API ───────────────────────────────────────────────────────────

export interface BusySlot {
  start: string;
  end: string;
}

/**
 * Query Google Calendar FreeBusy API to get busy slots.
 */
export async function getFreeBusy(
  connection: CalendarConnection,
  timeMin: string,
  timeMax: string
): Promise<BusySlot[]> {
  const accessToken = await getAccessToken(connection);

  const res = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      timeZone: 'UTC',
      items: [{ id: 'primary' }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google FreeBusy API failed: ${err}`);
  }

  const data = await res.json();
  const busy: BusySlot[] = data.calendars?.primary?.busy || [];
  return busy;
}

export interface CreateEventData {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  attendees?: Array<{ email: string; displayName?: string }>;
}

export interface CreatedEvent {
  eventId: string;
  meetLink: string | null;
  htmlLink: string;
}

/**
 * Create a Google Calendar event with optional Google Meet link.
 */
export async function createEventWithMeet(
  connection: CalendarConnection,
  eventData: CreateEventData
): Promise<CreatedEvent> {
  const accessToken = await getAccessToken(connection);

  const body: Record<string, unknown> = {
    summary: eventData.summary,
    description: eventData.description || '',
    start: {
      dateTime: eventData.startDateTime,
      timeZone: eventData.timezone,
    },
    end: {
      dateTime: eventData.endDateTime,
      timeZone: eventData.timezone,
    },
    conferenceData: {
      createRequest: {
        requestId: `saleshub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  if (eventData.attendees?.length) {
    body.attendees = eventData.attendees;
  }

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar create event failed: ${err}`);
  }

  const event = await res.json();

  return {
    eventId: event.id,
    meetLink: event.conferenceData?.entryPoints?.find(
      (ep: { entryPointType: string; uri: string }) => ep.entryPointType === 'video'
    )?.uri || null,
    htmlLink: event.htmlLink,
  };
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  htmlLink: string;
  status: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType: string; uri: string }>;
  };
  organizer?: { email: string; displayName?: string; self?: boolean };
  creator?: { email: string; displayName?: string };
  recurringEventId?: string;
}

/**
 * List Google Calendar events in a date range.
 * Expands recurring events into individual instances.
 */
export async function listEvents(
  connection: CalendarConnection,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getAccessToken(connection);

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar list events failed: ${err}`);
  }

  const data = await res.json();
  return (data.items || []).filter(
    (e: GoogleCalendarEvent) => e.status !== 'cancelled'
  );
}

/**
 * Delete a Google Calendar event.
 */
export async function deleteEvent(
  connection: CalendarConnection,
  eventId: string
): Promise<void> {
  const accessToken = await getAccessToken(connection);

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events/${eventId}?sendUpdates=all`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  // 410 Gone is fine — event already deleted
  if (!res.ok && res.status !== 410) {
    const err = await res.text();
    throw new Error(`Google Calendar delete event failed: ${err}`);
  }
}

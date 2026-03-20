/**
 * Calendly API v2 Wrapper
 *
 * Fetches event types, availability schedules, scheduled events, and invitees
 * from the Calendly API for migration into the built-in scheduling system.
 *
 * API Docs: https://developer.calendly.com/api-docs/
 */

const CALENDLY_BASE = 'https://api.calendly.com';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CalendlyUser {
  uri: string;
  name: string;
  email: string;
  scheduling_url: string;
  timezone: string;
  slug: string;
}

export interface CalendlyEventType {
  uri: string;
  name: string;
  slug: string;
  active: boolean;
  color: string;
  description_plain: string | null;
  description_html: string | null;
  duration: number; // minutes
  kind: string; // 'solo', 'group', etc.
  type: string; // 'StandardEventType'
  scheduling_url: string;
  custom_questions: CalendlyCustomQuestion[];
  profile: { name: string; owner: string; type: string };
  internal_note: string | null;
}

export interface CalendlyCustomQuestion {
  name: string;
  type: 'string' | 'text' | 'phone_number' | 'single_select' | 'multi_select' | 'radio_button';
  position: number;
  enabled: boolean;
  required: boolean;
  answer_choices: string[];
  include_other: boolean;
}

export interface CalendlyAvailabilitySchedule {
  uri: string;
  name: string;
  default: boolean;
  timezone: string;
  rules: CalendlyAvailabilityRule[];
}

export interface CalendlyAvailabilityRule {
  type: 'wday' | 'date';
  wday?: string; // 'monday', 'tuesday', etc.
  date?: string; // 'YYYY-MM-DD' for date overrides
  intervals: { from: string; to: string }[];
}

export interface CalendlyScheduledEvent {
  uri: string;
  name: string;
  status: 'active' | 'canceled';
  start_time: string; // ISO 8601
  end_time: string;
  event_type: string; // URI
  location: {
    type: string;
    location?: string;
    join_url?: string;
    status?: string;
  } | null;
  cancellation?: {
    canceled_by: string;
    reason: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface CalendlyInvitee {
  uri: string;
  name: string;
  email: string;
  timezone: string;
  status: 'active' | 'canceled';
  cancel_url: string;
  reschedule_url: string;
  no_show: { uri: string } | null;
  questions_and_answers: { question: string; answer: string; position: number }[];
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse<T> {
  collection: T[];
  pagination: {
    count: number;
    next_page: string | null;
    next_page_token: string | null;
    previous_page: string | null;
    previous_page_token: string | null;
  };
}

// ─── API Client ─────────────────────────────────────────────────────────────

async function calendlyFetch<T>(apiKey: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, CALENDLY_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Calendly API ${res.status}: ${res.statusText} — ${body}`);
  }

  return res.json();
}

/**
 * Paginate through all results for a Calendly collection endpoint.
 */
async function paginateAll<T>(
  apiKey: string,
  path: string,
  params: Record<string, string>
): Promise<T[]> {
  const all: T[] = [];

  // Build initial URL
  const initialUrl = new URL(path, CALENDLY_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v) initialUrl.searchParams.set(k, v);
  }

  let nextUrl: string | null = initialUrl.toString();

  do {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Calendly API ${res.status}: ${res.statusText} — ${body}`);
    }

    const data = (await res.json()) as PaginatedResponse<T>;
    all.push(...data.collection);
    nextUrl = data.pagination.next_page ?? null;
  } while (nextUrl);

  return all;
}

// ─── Public Functions ───────────────────────────────────────────────────────

/**
 * GET /users/me — returns the authenticated Calendly user profile.
 */
export async function getCalendlyUser(apiKey: string): Promise<CalendlyUser> {
  const res = await calendlyFetch<{ resource: CalendlyUser }>(apiKey, '/users/me');
  return res.resource;
}

/**
 * GET /event_types — returns all event types for the user.
 */
export async function getCalendlyEventTypes(apiKey: string, userUri: string): Promise<CalendlyEventType[]> {
  return paginateAll<CalendlyEventType>(apiKey, '/event_types', {
    user: userUri,
    count: '100',
  });
}

/**
 * GET /user_availability_schedules — returns all availability schedules.
 */
export async function getCalendlyAvailabilitySchedules(
  apiKey: string,
  userUri: string
): Promise<CalendlyAvailabilitySchedule[]> {
  const res = await calendlyFetch<{ collection: CalendlyAvailabilitySchedule[] }>(
    apiKey,
    '/user_availability_schedules',
    { user: userUri }
  );
  return res.collection;
}

/**
 * GET /scheduled_events — returns events in a date range, paginated.
 */
export async function getCalendlyScheduledEvents(
  apiKey: string,
  userUri: string,
  minStartTime: string,
  maxStartTime?: string
): Promise<CalendlyScheduledEvent[]> {
  const params: Record<string, string> = {
    user: userUri,
    min_start_time: minStartTime,
    count: '100',
    sort: 'start_time:asc',
  };
  if (maxStartTime) params.max_start_time = maxStartTime;

  return paginateAll<CalendlyScheduledEvent>(apiKey, '/scheduled_events', params);
}

/**
 * GET /scheduled_events/:uuid/invitees — returns invitees for one event.
 */
export async function getCalendlyEventInvitees(
  apiKey: string,
  eventUri: string
): Promise<CalendlyInvitee[]> {
  return paginateAll<CalendlyInvitee>(apiKey, `${eventUri}/invitees`, {
    count: '100',
  });
}

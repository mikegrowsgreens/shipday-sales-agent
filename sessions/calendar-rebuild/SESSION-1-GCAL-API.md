# Session 1: Google Calendar Events API + Unified Endpoint

## Goal
Add the ability to fetch actual Google Calendar events and create a unified API endpoint that merges Google events, SalesHub bookings, and scheduled email sends.

---

## Context

**Project:** SalesHub — `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/`
**Stack:** Next.js 14 (App Router), PostgreSQL, TypeScript, Tailwind CSS
**Auth pattern:** `withAuth` middleware in `src/lib/route-auth.ts`, org_id isolation
**Google Calendar:** OAuth tokens stored encrypted in `crm.calendar_connections`
**Primary calendar:** mike.paulus@shipday.com (America/Denver timezone)

---

## What to Build

### 1. Add `listEvents()` to Google Calendar Library

**File:** `src/lib/google-calendar.ts`

- Add `GoogleCalendarEvent` interface (id, summary, description, start/end, htmlLink, attendees, conferenceData, etc.)
- Add `listEvents(connection, timeMin, timeMax)` function
- Uses `GET /calendars/primary/events` with `singleEvents=true`, `orderBy=startTime`, `maxResults=250`
- Follows existing pattern: `getAccessToken(connection)` → fetch → parse
- Filters out cancelled events

### 2. Add Unified Calendar Types

**File:** `src/lib/types.ts`

- `CalendarEventSource = 'google' | 'booking' | 'send'`
- `UnifiedCalendarEvent` interface with: id, source, title, description, start, end, allDay, color, url, meetingUrl, status, metadata

### 3. Create Unified Calendar Events Endpoint

**File:** `src/app/api/calendar/events/route.ts`

`GET /api/calendar/events?start=ISO&end=ISO`

Fetches from 3 sources in parallel:
1. **Google Calendar** — via `listEvents()` from `crm.calendar_connections` OAuth token
2. **SalesHub bookings** — from `crm.scheduling_bookings` joined with `crm.scheduling_event_types`
3. **Scheduled sends** — from `bdr.email_sends` + `bdr.leads` (same data as `/api/bdr/campaigns/calendar`)

**Deduplication:** If a booking has a `google_event_id` that matches a Google Calendar event, suppress the Google event (show only the booking).

**Graceful fallback:** If Google Calendar not connected or API fails, still return bookings + sends.

**Response shape:**
```json
{
  "events": [...UnifiedCalendarEvent],
  "google_connected": boolean,
  "counts": { "google": N, "bookings": N, "sends": N }
}
```

**Color scheme:**
- Google events: `#64748b` (slate-500)
- Bookings: event type color or `#3b82f6` (blue-500)
- Sends: `#f59e0b` (amber-500)

---

## Key Files

| File | Action |
|------|--------|
| `src/lib/google-calendar.ts` | Add `listEvents()` + `GoogleCalendarEvent` |
| `src/lib/types.ts` | Add `UnifiedCalendarEvent`, `CalendarEventSource` |
| `src/app/api/calendar/events/route.ts` | CREATE — unified endpoint |

## Status: COMPLETED

# Session 4: Calendly Import + Google OAuth Setup

## Goal
Configure Google OAuth credentials, import all Calendly meeting data (event types, availability, bookings), and verify the data landed correctly.

---

## Context

**Depends on:** Sessions 1-3 (calendar system built and working)
**Calendly token:** Available in n8n — needs to be copied to SalesHub org settings DB
**Google OAuth:** User has credentials ready — populate `.env.local`
**Import endpoint:** `POST /api/scheduling/import-calendly` already built, uses `src/lib/calendly-api.ts`
**Import logic:** Fetches event types, availability schedules, 6 months of bookings, and migrates legacy `crm.calendly_events`

---

## Tasks

### 1. Configure Google OAuth

- Get `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from user
- Populate in `saleshub/.env.local`
- Verify `GOOGLE_REDIRECT_URI` is correct: `https://saleshub.mikegrowsgreens.com/api/auth/google-calendar/callback`
- Restart dev server

### 2. Configure Calendly API Key

- Get Calendly Personal Access Token from n8n
- Store in database: `UPDATE crm.organizations SET settings = jsonb_set(settings, '{integrations,calendly,api_key}', '"TOKEN_HERE"') WHERE org_id = N`
- Alternatively, add a UI input on `/calendar/connections` page for the Calendly API key

### 3. Run Calendly Import

- Navigate to `/calendar/connections`
- Click "Import from Calendly"
- Monitor import progress (event types → availability → bookings → legacy migration)
- Review import results summary

### 4. Verify Imported Data

- **Event Types:** Check `/calendar/event-types` — all Calendly meeting types should appear with correct names, durations, colors, custom questions
- **Availability:** Check `/calendar/availability` — weekly hours and timezone should match Calendly settings
- **Bookings:** Check `/calendar/bookings` — 6 months of past bookings with correct statuses (completed, cancelled, no_show)
- **Contacts linked:** Verify bookings are auto-linked to existing contacts by email match
- **Duplicate handling:** Re-running import should skip already-imported items

### 5. Connect Google Calendar

- Navigate to `/calendar/connections`
- Click "Connect" on Google Calendar
- Complete OAuth for mike.paulus@shipday.com
- Verify connection appears as "Connected"
- Verify calendar events now show on the unified calendar view

---

## Potential Code Changes

- Add Calendly API key input field on Connections page (currently requires DB update)
- Add Google OAuth credentials health check on Connections page

---

## Key Files

| File | Action |
|------|--------|
| `saleshub/.env.local` | MODIFY — add Google OAuth creds |
| `src/app/api/scheduling/import-calendly/route.ts` | READ — verify import logic |
| `src/lib/calendly-api.ts` | READ — verify API wrapper |
| `src/app/calendar/connections/page.tsx` | POSSIBLY MODIFY — add API key input |

## Status: PENDING

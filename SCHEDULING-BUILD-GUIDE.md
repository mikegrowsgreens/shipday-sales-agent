# SalesHub Scheduling System — Session Build Guide

> Built-in Calendly replacement with Google Meet/Zoom, AI agendas, custom branding, and full CRM integration.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PUBLIC BOOKING FLOW                        │
│  /book/[orgSlug]  →  /book/[orgSlug]/[eventSlug]  →  confirm │
│  (event list)        (date → time → form → book)             │
└──────────────┬──────────────────────────────────────────────┘
               │ POST /api/scheduling/book
               ▼
┌─────────────────────────────────────────────────────────────┐
│                    BOOKING ENGINE                             │
│  src/lib/scheduling.ts                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Availability  │  │ Google Cal   │  │ Existing Bookings │  │
│  │ Schedule      │  │ FreeBusy API │  │ + Buffers         │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         └─────────┬───────┘───────────────────┘             │
│                   ▼                                          │
│          computeAvailableSlots()                             │
│                   │                                          │
│                   ▼                                          │
│          createBooking() ──→ Google Calendar Event + Meet    │
│                   │      ──→ Confirmation Email              │
│                   │      ──→ Contact Auto-Link + Touchpoint  │
│                   │      ──→ AI Agenda (if enabled)          │
│                   │      ──→ Webhook → n8n                   │
└──────────────────┼──────────────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────┐
│               INTERNAL DASHBOARD                             │
│  /scheduling           → Overview + upcoming bookings        │
│  /scheduling/event-types → CRUD event types                  │
│  /scheduling/availability → Weekly hours editor              │
│  /scheduling/bookings    → All bookings table + calendar     │
│  /scheduling/connections → Google/Zoom OAuth management      │
└─────────────────────────────────────────────────────────────┘
```

---

## Session Breakdown

### Session 1: Database Schema + Core Types
**Goal:** Tables exist, TypeScript types defined, Zod validators ready.

**Tasks:**
1. Create `migrations/013-scheduling.sql` with all 5 tables:
   - `crm.calendar_connections`
   - `crm.scheduling_event_types`
   - `crm.scheduling_availability`
   - `crm.scheduling_bookings`
   - `crm.scheduling_webhook_log`
2. Run migration against the database
3. Add TypeScript interfaces to `src/lib/types.ts`:
   - `CalendarConnection`, `SchedulingEventType`, `SchedulingAvailability`, `SchedulingBooking`
4. Create `src/lib/validators/scheduling.ts` with Zod schemas:
   - `createEventTypeSchema`, `updateEventTypeSchema`
   - `createAvailabilitySchema`, `updateAvailabilitySchema`
   - `createBookingSchema` (public — name, email, event_type_id, starts_at, timezone, answers)
   - `slotsQuerySchema` (event_type_id, date, timezone)

**Key context:**
- Database: `wincall_brain` on DigitalOcean managed PostgreSQL
- Connection string in `.env.local` / `.env.production` as `DATABASE_URL`
- DB utility: `src/lib/db.ts` — use `query()` function for all SQL
- All tables use `org_id` FK to `crm.organizations(org_id)` for multi-tenancy
- Existing Zod pattern: see `src/lib/validators/` directory

**Verify:** `SELECT * FROM crm.scheduling_event_types LIMIT 0;` succeeds

---

### Session 2: Token Encryption + Google Calendar OAuth
**Goal:** Users can connect Google Calendar, tokens stored encrypted.

**Tasks:**
1. Create `src/lib/crypto.ts`:
   - `encryptToken(plaintext: string): string` — AES-256-GCM with `TOKEN_ENCRYPTION_KEY` env var
   - `decryptToken(ciphertext: string): string`
2. Create `src/lib/google-calendar.ts`:
   - `getAuthUrl(state: string): string` — build Google OAuth URL with scopes: `calendar.events`, `calendar.readonly`
   - `exchangeCode(code: string): { access_token, refresh_token, expires_in }`
   - `refreshToken(connection): CalendarConnection` — refresh if expired
   - `getFreeBusy(connection, timeMin, timeMax): BusySlot[]`
   - `createEventWithMeet(connection, eventData): { eventId, meetLink }`
   - `deleteEvent(connection, eventId): void`
3. Create `src/app/api/auth/google-calendar/route.ts` — GET redirects to Google consent
4. Create `src/app/api/auth/google-calendar/callback/route.ts` — exchanges code, encrypts + stores tokens in `crm.calendar_connections`, redirects to `/scheduling/connections?connected=google`
5. Create `src/app/api/scheduling/connections/route.ts` — GET lists connections (auth required)
6. Create `src/app/api/scheduling/connections/[id]/route.ts` — DELETE disconnects

**Key context:**
- Auth wrapper: `import { withAuth } from '@/lib/route-auth'` — use `withAuth(handler)` pattern
- Session payload has: `userId`, `orgId`, `orgSlug`, `role`
- No Google client library — use raw `fetch()` against `https://oauth2.googleapis.com/` and `https://www.googleapis.com/calendar/v3/`
- Google Meet auto-creation: set `conferenceDataVersion=1` query param on Calendar Events insert, include `conferenceData.createRequest` in body

**New env vars:**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://saleshub.mikegrowsgreens.com/api/auth/google-calendar/callback
TOKEN_ENCRYPTION_KEY=  # Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Verify:** Complete OAuth flow → tokens in DB → `getFreeBusy()` returns data

---

### Session 3: Slot Computation Engine
**Goal:** Given an event type + date + timezone, return available time slots.

**Tasks:**
1. Create `src/lib/scheduling.ts` with:
   - `computeAvailableSlots(eventTypeId, date, timezone, orgId)`:
     1. Load event type (duration, buffers, min_notice, max_per_day, availability_id)
     2. Load availability schedule → get `weekly_hours` for day-of-week, check `date_overrides`
     3. Load existing bookings for that host on that date (status != cancelled)
     4. If Google Calendar connected → call `getFreeBusy()` for that date
     5. Convert availability windows to slot candidates (e.g., 9:00-17:00 → 9:00, 9:30, 10:00... at event duration intervals)
     6. Subtract: existing bookings + their buffers, Google Cal busy times, slots within min_notice window
     7. Apply max_per_day limit
     8. Return `{ slots: Array<{ start: string, end: string }> }` in requested timezone
2. Create `src/app/api/scheduling/slots/route.ts` (PUBLIC, no auth):
   - GET with query params: `event_type_id`, `date` (YYYY-MM-DD), `timezone`
   - Validate with Zod
   - Rate limit: 60 req/min/IP
   - Returns available slots
3. Add `/api/scheduling/slots` to `publicPaths` in `src/middleware.ts`

**Key context:**
- `date-fns` v4 is already installed — use for date math
- May need `date-fns-tz` or the timezone features in date-fns v4 (check `node_modules/date-fns` for tz support)
- Rate limiting: `rate-limiter-flexible` already in package.json — see if there's existing rate limit setup to follow
- Slot intervals: use event duration as step (30-min event = 30-min intervals)

**Verify:** `GET /api/scheduling/slots?event_type_id=1&date=2026-03-20&timezone=America/Chicago` returns correct slots respecting all constraints

---

### Session 4: Booking Engine + Email Notifications
**Goal:** Public booking endpoint creates bookings with Google Meet links and sends emails.

**Tasks:**
1. Add to `src/lib/scheduling.ts`:
   - `createBooking(params)`:
     1. Validate slot is still available (prevent double-booking race condition with `SELECT ... FOR UPDATE`)
     2. Create booking row in `crm.scheduling_bookings`
     3. If Google Calendar connected → `createEventWithMeet()` → store `google_event_id` + `meeting_url`
     4. Auto-link contact: check `crm.contacts` for matching `invitee_email` → set `contact_id`
     5. Create touchpoint: `INSERT INTO crm.touchpoints` with channel='scheduling', event_type='meeting_booked'
     6. Generate cancel_token (UUID v4)
     7. If `ai_agenda_enabled` → call `generateMeetingAgenda()` → store in `ai_agenda`
     8. Send confirmation emails
     9. Return booking with meeting URL
   - `cancelBooking(cancelToken)` → update status, delete Google event, send cancellation email
2. Create `src/lib/scheduling-emails.ts`:
   - `sendBookingConfirmation(booking, eventType, org)` — to invitee AND host
   - `sendCancellationNotice(booking, eventType, org)` — to both
   - `sendBookingReminder(booking, eventType, org, type: '24h' | '1h')` — to both
   - All use `sendEmail()` from `src/lib/email.ts`, styled with org branding
   - Include .ics calendar attachment in confirmation
3. Create `src/app/api/scheduling/book/route.ts` (PUBLIC):
   - POST with body: `{ event_type_id, starts_at, timezone, name, email, phone?, answers? }`
   - Rate limit: 10 req/hr/IP
   - Returns: `{ booking_id, meeting_url, cancel_token, confirmation_page_url }`
4. Create `src/app/api/scheduling/cancel/route.ts` (PUBLIC):
   - POST with body: `{ cancel_token, action: 'cancel' | 'reschedule', reason?, new_starts_at? }`
5. Create `src/app/api/scheduling/reminders/route.ts` (API key auth):
   - POST — queries bookings needing reminders, sends them, updates flags
   - Called by n8n cron every 15 minutes
6. Add public paths to `src/middleware.ts`

**Key context:**
- Email sending: `src/lib/email.ts` has `sendEmail({ to, subject, html, from? })` using per-org SMTP config
- Touchpoint insert pattern: see `crm.touchpoints` usage in existing API routes
- Use `crypto.randomUUID()` for cancel_token generation
- Race condition prevention: use a transaction with `SELECT ... WHERE starts_at = $1 AND host_user_id = $2 AND status != 'cancelled' FOR UPDATE`

**Verify:** POST to `/api/scheduling/book` → booking in DB, Google Calendar event created, confirmation email received, contact auto-linked

---

### Session 5: Event Types + Availability CRUD API
**Goal:** All internal management API routes working.

**Tasks:**
1. Create `src/app/api/scheduling/event-types/route.ts`:
   - GET — list all event types for org
   - POST — create event type (validate with Zod)
2. Create `src/app/api/scheduling/event-types/[id]/route.ts`:
   - GET — single event type
   - PATCH — update fields
   - DELETE — soft delete (set `is_active = false`)
3. Create `src/app/api/scheduling/availability/route.ts`:
   - GET — list availability schedules for user
   - POST — create schedule
4. Create `src/app/api/scheduling/availability/[id]/route.ts`:
   - GET, PATCH, DELETE
5. Create `src/app/api/scheduling/bookings/route.ts`:
   - GET — list bookings with filters (date range, status, host, search)
   - POST — manual booking creation (admin creates on behalf of invitee)
6. Create `src/app/api/scheduling/bookings/[id]/route.ts`:
   - GET — full booking detail
   - PATCH — update status (mark completed, no-show, etc.)

**Key context:**
- All routes use `withAuth(handler)` from `src/lib/route-auth.ts`
- Pattern to follow: see any existing CRUD route like `src/app/api/contacts/route.ts`
- org_id comes from session: `const { orgId } = getSession(request)`
- Return JSON with `NextResponse.json()`

**Verify:** Full CRUD cycle through API for event types, availability, and bookings

---

### Session 6: Public Booking Page (Frontend)
**Goal:** Prospects can visit a branded page, pick a date/time, and book a meeting.

**Tasks:**
1. Create `src/app/book/[orgSlug]/page.tsx`:
   - Fetch org by slug → display branded landing with logo, colors, app_name
   - List active event types as cards (name, description, duration, color)
   - Click → navigate to event type booking page
   - Light theme (not the internal dark theme)
2. Create `src/app/book/[orgSlug]/[eventSlug]/page.tsx`:
   - **Date picker**: Month calendar, dates fetched for availability, gray out unavailable
   - **Time slots**: On date select → fetch `GET /api/scheduling/slots` → show scrollable time buttons
   - **Timezone**: Auto-detect with `Intl.DateTimeFormat().resolvedOptions().timeZone`, dropdown override
   - **Booking form**: Name, email, phone (optional), custom questions from event type
   - **Submit**: POST to `/api/scheduling/book` → redirect to confirmation
   - Fully responsive mobile design
3. Create `src/app/book/confirm/page.tsx`:
   - Shows: event name, date/time, timezone, meeting link, host info
   - "Add to Google Calendar" link (gcal URL scheme)
   - .ics download button
   - "Cancel or Reschedule" link with cancel_token
4. Create `src/app/book/cancel/page.tsx`:
   - Load booking by cancel_token
   - Show current booking details
   - Cancel button with optional reason
   - Reschedule option → shows new date/time picker → POST to cancel API with action='reschedule'
5. Add `/book` to public paths in middleware

**Key context:**
- These are PUBLIC pages — no auth, no sidebar, no dark theme
- Branding from `crm.organizations.settings.branding`: `{ logo_url, primary_color, app_name }`
- Use a clean layout.tsx for `/book` that doesn't inherit the app shell
- Existing font: Inter from Google Fonts (already in layout.tsx)
- Icon library: lucide-react

**Verify:** Full booking flow works end-to-end: land → pick date → pick time → fill form → confirm → receive email with Meet link

---

### Session 7: Internal Scheduling Dashboard (Frontend)
**Goal:** Internal pages for managing scheduling.

**Tasks:**
1. Add to `src/components/layout/Sidebar.tsx`:
   - `{ href: '/scheduling', label: 'Scheduling', icon: CalendarDays }` in MAIN section
2. Create `src/app/scheduling/page.tsx`:
   - Upcoming bookings list (next 7 days)
   - Quick stats: meetings this week, booking rate, next meeting
   - Quick links: create event type, manage availability, view all bookings
3. Create `src/app/scheduling/event-types/page.tsx`:
   - Grid of event type cards with: name, duration, location type, active toggle, copy link, edit
   - "Create Event Type" button
4. Create `src/app/scheduling/event-types/new/page.tsx` + `[id]/page.tsx`:
   - Form: name, slug (auto-generated), description, duration dropdown, location type, buffer times, min notice, max days ahead, max per day
   - Custom questions builder: add/remove/reorder questions with types (text, textarea, select, radio)
   - AI agenda toggle
   - Preview: link to public booking page
5. Create `src/app/scheduling/availability/page.tsx`:
   - Visual weekly grid: 7 columns (Mon-Sun), time rows
   - Click/drag to set available windows per day
   - Timezone selector
   - Date overrides section: calendar to mark specific dates as unavailable or custom hours
6. Create `src/app/scheduling/bookings/page.tsx`:
   - Table view: date, invitee, event type, status, meeting link
   - Filters: date range, status, event type
   - Search by invitee name/email
7. Create `src/app/scheduling/bookings/[id]/page.tsx`:
   - Full detail: invitee info, answers to custom questions, AI agenda, meeting link
   - Actions: mark completed, mark no-show, cancel, view contact in CRM
8. Create `src/app/scheduling/connections/page.tsx`:
   - Google Calendar: connect/disconnect button, shows connected email
   - Zoom: connect/disconnect button (placeholder for Phase 5)
   - Connection status indicators

**Key context:**
- Follow existing page patterns: dark theme (bg-gray-950), sidebar layout
- Components use Tailwind + lucide-react icons
- No external component library — all custom Tailwind
- Data fetching pattern: `useEffect` + `fetch()` in client components (see existing pages)

**Verify:** All pages render, CRUD operations work through UI, Google connection management works

---

### Session 8: AI Integration
**Goal:** AI generates meeting agendas and suggests optimal meeting types.

**Tasks:**
1. Add to `src/lib/ai.ts`:
   - `generateMeetingAgenda({ contact, eventType, touchpoints, brainContent, orgConfig })`:
     - System prompt: "You are a sales meeting preparation assistant..."
     - Context: contact data, lifecycle stage, past interactions, brain knowledge, event type
     - Output: structured agenda with sections: Objectives, Talking Points, Pain Points to Address, Relevant Case Studies, Questions to Ask
   - `suggestOptimalMeetingType({ contact, eventTypes })`:
     - Based on lifecycle stage + engagement history → recommend which event type to suggest
     - Used by AI assistant and chat
2. Update `src/app/chat/page.tsx`:
   - Add `[BOOK_MEETING:event-slug]` marker detection alongside existing `[BOOK_DEMO]`
   - When detected: render inline `TimeSlotPicker` component instead of Calendly embed
   - Pre-fill invitee data from chat context
   - Org setting `scheduling_provider: 'built_in' | 'calendly'` controls which renders
3. Update system prompt in `prospectChat()` in `src/lib/ai.ts`:
   - Add available event types to context so AI can recommend specific ones
   - Update instruction to use `[BOOK_MEETING:slug]` marker

**Key context:**
- AI model: `claude-sonnet-4-5-20250929` via `@anthropic-ai/sdk`
- Prompt safety: `src/lib/prompt-guard.ts` — sanitize inputs before passing to prompts
- Existing pattern: see `generateEmail()` and `prospectChat()` in ai.ts for how prompts are built
- Brain content: planned `crm.brain_content` table (may need to check if it exists yet)

**Verify:** Booking with `ai_agenda_enabled` → agenda generated and stored. Chat triggers `[BOOK_MEETING]` → inline booking widget appears.

---

### Session 9: Zoom Integration
**Goal:** Zoom OAuth + auto-create Zoom meetings.

**Tasks:**
1. Create `src/lib/zoom.ts`:
   - `getAuthUrl(state)` — Zoom OAuth URL with `meeting:write:meeting` scope
   - `exchangeCode(code)` — exchange authorization code for tokens
   - `refreshToken(connection)` — refresh expired tokens
   - `createMeeting(connection, { topic, startTime, duration, timezone })` — returns `{ meetingId, joinUrl }`
   - `deleteMeeting(connection, meetingId)`
2. Create `src/app/api/auth/zoom/route.ts` — initiate OAuth
3. Create `src/app/api/auth/zoom/callback/route.ts` — handle callback
4. Update `createBooking()` in `src/lib/scheduling.ts`:
   - If `location_type = 'zoom'` → call `createMeeting()` → store `zoom_meeting_id` + `meeting_url`
5. Update connections page to show Zoom connect/disconnect

**New env vars:**
```
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_REDIRECT_URI=https://saleshub.mikegrowsgreens.com/api/auth/zoom/callback
```

**Verify:** Connect Zoom → create booking with Zoom → Zoom meeting created → join URL in confirmation

---

### Session 10: Webhooks, Analytics, Embeddable Widget
**Goal:** Advanced features for automation and insights.

**Tasks:**
1. **Webhook system:**
   - On booking lifecycle events → POST to configured webhook URLs (from org settings)
   - Events: `booking.created`, `booking.cancelled`, `booking.rescheduled`, `booking.completed`, `booking.no_show`
   - Log deliveries in `crm.scheduling_webhook_log`
   - Configure webhook URLs in org settings (alongside existing n8n webhook config)
2. **Analytics:**
   - Add to `/scheduling` dashboard or new `/scheduling/analytics` page
   - Metrics: total bookings, cancellation rate, no-show rate, bookings by event type, popular days/times heatmap, avg lead time (time between booking and meeting)
   - Use existing `KpiGrid` component pattern
3. **Embeddable widget:**
   - Create `/api/scheduling/embed.js` — JavaScript snippet that injects booking iframe
   - Usage: `<script src="https://saleshub.../api/scheduling/embed.js" data-org="slug" data-event="slug"></script>`
   - Or inline embed: `<iframe src="https://saleshub.../book/slug/event-slug?embed=true">`
   - Booking pages detect `?embed=true` query param → render without header/footer

**Verify:** Webhook fires to n8n on booking → automation triggers. Analytics show correct data. Embed widget loads booking flow on external page.

---

### Session 11: Calendly Data Migration
**Goal:** Import all Calendly event types, availability schedules, and past bookings into the new system.

**Tasks:**
1. Create `src/app/api/scheduling/import-calendly/route.ts` (POST, admin-only):
   - Read `calendly.api_key` from `organizations.settings.integrations`
   - `GET /users/me` → get user URI + profile
   - `GET /event_types?user={uri}` → map to `crm.scheduling_event_types` (name, slug, duration, color, description, locations→location_type, custom_questions→booking_questions)
   - `GET /user_availability_schedules` → map rules to `crm.scheduling_availability.weekly_hours` JSONB
   - `GET /scheduled_events?user={uri}&min_start_time={6mo_ago}` → paginate all events
   - For each event: `GET /scheduled_events/{uuid}/invitees` → create `crm.scheduling_bookings` with invitee data, answers, no-show status
   - Auto-link bookings to `crm.contacts` by email match
   - Also migrate existing `crm.calendly_events` rows → `crm.scheduling_bookings`
2. Add "Import from Calendly" button on `/scheduling/connections` page:
   - Progress indicator (fetching event types... schedules... bookings...)
   - Import summary with counts
   - Duplicate handling (skip if slug exists)

**Key context:**
- Calendly API base: `https://api.calendly.com/` with `Authorization: Bearer {api_key}` header
- Calendly API key already stored in org settings at `settings.integrations.calendly.api_key`
- Availability rules format: `{ day: "monday", intervals: [{ from: "09:00", to: "17:00" }] }` → convert to our `weekly_hours` format
- Paginate with `page_token` from response `pagination.next_page_token`

**Verify:** Click import → event types created matching Calendly config → availability matches → past 6mo bookings imported with contact links

---

### Session 12: Follow-Up Booking Integration
**Goal:** Book a follow-up call inline from the follow-ups page, alongside starting a campaign.

**Tasks:**
1. Update `src/app/followups/[id]/page.tsx`:
   - Replace "Book via Calendly" button (lines 587-595) with inline `TimeSlotPicker` component
   - Pre-fill from deal: `contact_name`, `contact_email`, `contact_phone`
   - On booking → auto-set "Next Follow-Up Call" date field (the existing datetime input)
   - Add "Book Call & Start Campaign" button that chains: book slot → generate campaign with booked date as anchor
2. Update `src/components/scheduling/TimeSlotPicker.tsx`:
   - Support `embedded` mode (no page navigation, callback on booking)
   - Accept `prefill` prop: `{ name, email, phone }`
   - Accept `onBooked` callback: `(booking) => void`
3. Add to `src/lib/scheduling.ts`:
   - `createBookingFromDeal(dealId, bookingParams)` — includes deal context (Fathom summary, pain points)
   - Links booking to deal for traceability
4. Extend `generateMeetingAgenda()` in `src/lib/ai.ts`:
   - Accept optional Fathom data (summary, pain_points, interests, objections, action_items)
   - Generate pre-meeting brief combining demo insights + follow-up goals

**Key context:**
- Follow-up detail page: `src/app/followups/[id]/page.tsx`
- Deal data includes: `fathom_summary`, `pain_points`, `interests`, `objections`, `action_items`, `contact_name`, `contact_email`
- Existing "Next Follow-Up Call" section (lines 575-626) has datetime input + save button
- Campaign generation already adapts to the next_call_date

**Verify:** From follow-up detail → click "Book Call" → inline picker shows → book slot → "Next Follow-Up Call" date auto-updates → "Book Call & Start Campaign" creates booking AND triggers campaign generation

---

## Session Parallelism Guide

```
Session 1 (DB + Types)
    │
    ├──→ Sessions 2 + 3 + 5 (in parallel: Google OAuth, Slot Engine, CRUD API)
    │         │
    │         ├──→ Sessions 4 + 9 (in parallel: Booking Engine, Zoom)
    │         │         │
    │         │         ├──→ Sessions 6 + 7 (in parallel: Public Pages, Internal Dashboard)
    │         │         │         │
    │         │         │         ├──→ Sessions 8 + 11 (in parallel: AI Integration, Calendly Migration)
    │         │         │         │         │
    │         │         │         │         └──→ Sessions 10 + 12 (in parallel: Webhooks, Follow-Up Integration)
```

**Recommended batches:**
1. **Batch 1:** Session 1 (foundation)
2. **Batch 2:** Sessions 2 + 3 + 5 (three in parallel)
3. **Batch 3:** Sessions 4 + 9 (two in parallel)
4. **Batch 4:** Sessions 6 + 7 (two in parallel)
5. **Batch 5:** Sessions 8 + 11 (two in parallel)
6. **Batch 6:** Sessions 10 + 12 (two in parallel)

---

## Quick Reference: File Map

```
NEW FILES:
├── migrations/013-scheduling.sql
├── src/lib/
│   ├── crypto.ts                    # Token encryption
│   ├── google-calendar.ts           # Google Calendar API
│   ├── zoom.ts                      # Zoom API (Session 9)
│   ├── scheduling.ts                # Slot computation + booking engine
│   ├── scheduling-emails.ts         # Email templates
│   └── validators/scheduling.ts     # Zod schemas
├── src/app/api/
│   ├── auth/google-calendar/        # OAuth flow
│   ├── auth/zoom/                   # OAuth flow (Session 9)
│   └── scheduling/                  # All scheduling API routes
│       ├── event-types/
│       ├── availability/
│       ├── bookings/
│       ├── connections/
│       ├── slots/       (PUBLIC)
│       ├── book/        (PUBLIC)
│       ├── cancel/      (PUBLIC)
│       └── reminders/
├── src/app/book/                    # Public booking pages
│   ├── [orgSlug]/page.tsx
│   ├── [orgSlug]/[eventSlug]/page.tsx
│   ├── confirm/page.tsx
│   └── cancel/page.tsx
├── src/app/scheduling/              # Internal dashboard
│   ├── page.tsx
│   ├── event-types/
│   ├── availability/
│   ├── bookings/
│   └── connections/
└── src/components/scheduling/       # Reusable components
    ├── EventTypeCard.tsx
    ├── EventTypeForm.tsx
    ├── AvailabilityEditor.tsx
    ├── TimeSlotPicker.tsx
    ├── BookingForm.tsx
    ├── BookingCalendar.tsx
    ├── BookingDetail.tsx
    ├── ConnectionStatus.tsx
    └── OAuthConnectButton.tsx

MODIFIED FILES:
├── src/middleware.ts                # Add public paths
├── src/components/layout/Sidebar.tsx # Add "Calendar" nav item → /scheduling
├── src/lib/ai.ts                   # AI agenda + meeting suggestions + Fathom context
├── src/lib/types.ts                # New interfaces
├── src/app/chat/page.tsx           # [BOOK_MEETING] handler
├── src/app/followups/[id]/page.tsx  # Inline booking + "Book Call & Start Campaign"
└── schema.sql                      # Reference schema update

ADDITIONAL NEW FILES (Sessions 11-12):
├── src/app/api/scheduling/import-calendly/route.ts  # Calendly data migration
└── src/lib/calendly-api.ts                          # Calendly API v2 wrapper
```

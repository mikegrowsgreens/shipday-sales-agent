# Session 3: Merge Into Single Calendar Tab + Sub-navigation

## Goal
Replace the separate "Scheduling" and "Send Calendar" sidebar tabs with a single unified "Calendar" tab, move all scheduling pages under `/calendar/`, and add sub-navigation.

---

## Context

**Depends on:** Session 2 (calendar UI components — must be built first)
**Current sidebar:** Two items — "Scheduling" (`/scheduling`) and "Send Calendar" (`/send-calendar`)
**Scheduling sub-pages:** event-types, event-types/new, event-types/[id], bookings, bookings/[id], availability, connections, analytics, webhooks
**Public booking pages:** `/book/[orgSlug]/[eventSlug]` — remain unchanged

---

## What to Build

### 1. Update Sidebar

**File:** `src/components/layout/Sidebar.tsx`

Replace lines 57-58:
```
{ href: '/scheduling', label: 'Scheduling', icon: CalendarDays },
{ href: '/send-calendar', label: 'Send Calendar', icon: CalendarDays },
```
With single entry:
```
{ href: '/calendar', label: 'Calendar', icon: CalendarDays },
```

### 2. Calendar Layout with Sub-navigation

**File:** `src/app/calendar/layout.tsx` (CREATE)

Layout component with horizontal tab bar:
- **Calendar** → `/calendar`
- **Event Types** → `/calendar/event-types`
- **Availability** → `/calendar/availability`
- **Bookings** → `/calendar/bookings`
- **Connections** → `/calendar/connections`

Use `usePathname()` for active tab highlighting. Match existing dark theme style.

### 3. Main Calendar Page

**File:** `src/app/calendar/page.tsx` (CREATE)

- Stats bar (meetings this week, upcoming, cancelled, active event types)
- `<UnifiedCalendar />` component from Session 2
- "New Event Type" button

### 4. Move Scheduling Sub-pages

Move/recreate these under `/calendar/`:
- `src/app/calendar/event-types/page.tsx` — from `src/app/scheduling/event-types/page.tsx`
- `src/app/calendar/event-types/new/page.tsx` — from `src/app/scheduling/event-types/new/page.tsx`
- `src/app/calendar/event-types/[id]/page.tsx` — from `src/app/scheduling/event-types/[id]/page.tsx`
- `src/app/calendar/availability/page.tsx` — from `src/app/scheduling/availability/page.tsx`
- `src/app/calendar/bookings/page.tsx` — from `src/app/scheduling/bookings/page.tsx`
- `src/app/calendar/bookings/[id]/page.tsx` — from `src/app/scheduling/bookings/[id]/page.tsx`
- `src/app/calendar/connections/page.tsx` — from `src/app/scheduling/connections/page.tsx`
- `src/app/calendar/analytics/page.tsx` — from `src/app/scheduling/analytics/page.tsx`

### 5. Redirects for Old URLs

- `src/app/scheduling/page.tsx` → `redirect('/calendar')`
- `src/app/send-calendar/page.tsx` → `redirect('/calendar')`
- All scheduling sub-pages redirect to `/calendar/` equivalents

### 6. Update Internal Links

- `src/app/api/auth/google-calendar/callback/route.ts` — change `/scheduling/connections` → `/calendar/connections`
- All `Link` hrefs inside moved pages: `/scheduling/...` → `/calendar/...`

---

## Key Files

| File | Action |
|------|--------|
| `src/components/layout/Sidebar.tsx` | MODIFY — merge 2 items into 1 |
| `src/app/calendar/layout.tsx` | CREATE — sub-nav tabs |
| `src/app/calendar/page.tsx` | CREATE — main page |
| `src/app/calendar/event-types/*` | CREATE — move from scheduling |
| `src/app/calendar/availability/*` | CREATE — move from scheduling |
| `src/app/calendar/bookings/*` | CREATE — move from scheduling |
| `src/app/calendar/connections/*` | CREATE — move from scheduling |
| `src/app/scheduling/page.tsx` | MODIFY — add redirect |
| `src/app/send-calendar/page.tsx` | MODIFY — add redirect |
| `src/app/api/auth/google-calendar/callback/route.ts` | MODIFY — update redirect URLs |

## Status: PENDING

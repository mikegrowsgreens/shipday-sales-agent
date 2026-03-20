# Session 2: Unified Calendar UI Component

## Goal
Build the main calendar view component with month and week views, color-coded events from all three sources.

---

## Context

**Depends on:** Session 1 (unified `/api/calendar/events` endpoint — COMPLETED)
**Reference component:** `src/components/outbound/SendCalendar.tsx` — existing month grid pattern
**Design:** Dark theme, Tailwind CSS only, no external calendar library
**Color scheme:** Google=slate (#64748b), Bookings=blue (#3b82f6), Sends=amber (#f59e0b)

---

## What to Build

### 1. Main Calendar Component

**File:** `src/components/calendar/UnifiedCalendar.tsx`

- Month/week view toggle
- Prev/next/today navigation
- Fetches from `GET /api/calendar/events?start=&end=`
- Manages view state (current date, view mode)
- Shows "Connect Google Calendar" banner if `google_connected === false`
- Loading state with skeleton

### 2. Month View

**File:** `src/components/calendar/MonthView.tsx`

- 7-column grid (Sun-Sat), 5-6 rows
- Day cells show date number + up to 3 color-coded event pills
- "+N more" overflow for busy days
- Click day → expand to show all events in detail panel
- Dim days outside current month
- Highlight today

### 3. Week View

**File:** `src/components/calendar/WeekView.tsx`

- 7-day columns × hourly rows (7am-7pm working hours, scrollable for full 24h)
- Events positioned as absolute blocks based on start/end time
- Current time indicator (red line)
- All-day events in header row
- Event blocks show title + time

### 4. Event Component

**File:** `src/components/calendar/CalendarEvent.tsx`

- Shared pill/block component for both views
- Color based on source type
- Shows title, time
- Click handler: bookings → `/calendar/bookings/[id]`, Google → htmlLink (new tab), sends → detail inline
- Hover tooltip with full details

---

## Key Files

| File | Action |
|------|--------|
| `src/components/calendar/UnifiedCalendar.tsx` | CREATE |
| `src/components/calendar/MonthView.tsx` | CREATE |
| `src/components/calendar/WeekView.tsx` | CREATE |
| `src/components/calendar/CalendarEvent.tsx` | CREATE |
| `src/components/outbound/SendCalendar.tsx` | READ — reference for month grid pattern |

## Status: COMPLETE

# Session 5: End-to-End Testing

## Goal
Verify the complete booking flow works end-to-end, test all calendar display features, fix any issues found.

---

## Context

**Depends on:** Sessions 1-4 (everything built and configured)
**Test email:** mikeaverypaulus@gmail.com
**Host calendar:** mike.paulus@shipday.com
**Public booking URL pattern:** `/book/[orgSlug]/[eventSlug]`

---

## Test Plan

### 1. Google Calendar Display
- [ ] Navigate to `/calendar` — verify unified calendar renders
- [ ] Check that Weekly Sales Sync (recurring Mon 11am MT) appears in slate/gray
- [ ] Switch between month and week views
- [ ] Verify events from mike.paulus@shipday.com are showing

### 2. Create Test Event Type
- [ ] Go to `/calendar/event-types/new`
- [ ] Create "Test Meeting" — 30 min, Google Meet, business hours
- [ ] Verify it appears in event types list
- [ ] Note the public booking URL

### 3. Book Test Meeting
- [ ] Open public booking page: `/book/[orgSlug]/test-meeting`
- [ ] Select a date and available time slot
- [ ] Fill form: name="Test User", email=mikeaverypaulus@gmail.com
- [ ] Submit booking
- [ ] Verify confirmation page shows with:
  - [ ] Google Meet link
  - [ ] ICS download button
  - [ ] "Add to Google Calendar" link

### 4. Verify Booking in System
- [ ] Check `/calendar/bookings` — new booking appears with status "confirmed"
- [ ] Check unified calendar — booking appears in blue
- [ ] Check Google Calendar (mike.paulus@shipday.com) — event was created
- [ ] Check deduplication — booking shows once (not duplicated as Google event + booking)

### 5. Test Cancellation
- [ ] Go to booking detail page `/calendar/bookings/[id]`
- [ ] Cancel the booking
- [ ] Verify status changes to "cancelled"
- [ ] Verify Google Calendar event is deleted
- [ ] Verify cancelled booking no longer shows on calendar (unless showing cancelled)

### 6. Test Edge Cases
- [ ] Book a meeting for a slot that conflicts with a Google Calendar event — should be blocked
- [ ] Try booking with min_notice violation — should show no available slots
- [ ] Check that past bookings from Calendly import display correctly on calendar
- [ ] Verify "Connect Google Calendar" prompt shows when not connected

### 7. Fix Issues
- Document and fix any issues found during testing
- Re-test after fixes

---

## Key Commands

```bash
# Check booking in DB
psql -c "SELECT booking_id, invitee_name, invitee_email, status, starts_at, google_event_id FROM crm.scheduling_bookings ORDER BY created_at DESC LIMIT 5"

# Check Google Calendar connection
psql -c "SELECT connection_id, account_email, is_active FROM crm.calendar_connections WHERE provider = 'google'"

# Check imported Calendly data
psql -c "SELECT count(*) as event_types FROM crm.scheduling_event_types"
psql -c "SELECT count(*) as bookings FROM crm.scheduling_bookings"
```

## Actual Results (2026-03-16)

### Bugs Found & Fixed
1. **SQL column name mismatch** (root cause of blank booking pages): `org_name`/`org_slug` used as column names in 7 locations across 5 files — actual columns are `name`/`slug`
2. **Wrong table reference**: `public.users` → `crm.users` (3 locations in scheduling.ts)
3. **Wrong column name**: `u.name` → `u.display_name`, `u.first_name || ' ' || u.last_name` → `u.display_name` (users table has no first/last name)
4. **Touchpoints constraint**: `touchpoints_channel_check` didn't include `scheduling` — added it
5. **Sidebar on public pages**: booking pages rendered inside CRM sidebar — fixed with middleware x-pathname header + conditional root layout
6. **Org slug**: changed from `mikegrowsgreens` to `shipday` + made editable in Settings

### Test Booking Results
- Booking ID 274: "Mike Test 2" / mikeaverypaulus@gmail.com
- Event: Shipday Consultation | Video, March 17, 2026 11:00 AM MT
- Confirmation page: working (You're booked!, ICS download, Google Calendar link, Cancel/Reschedule)
- meeting_url: null (Google OAuth not yet connected — will generate Meet links once connected)

### Not Yet Tested
- Google Calendar OAuth connection (needs GOOGLE_CLIENT_ID/SECRET in .env.local)
- Google Meet link generation
- Cancellation flow via API
- Deduplication of Google events vs bookings

## Status: COMPLETED (partial — Google OAuth pending)

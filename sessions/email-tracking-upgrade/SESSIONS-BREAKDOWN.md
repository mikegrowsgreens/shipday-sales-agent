# Email Tracking Upgrade — Sessions Breakdown

**Project:** SalesHub Email Tracking & Data Visibility Upgrade
**Inspiration:** Mailsuite dashboard (mailsuite.com/en/dashboard/tracked)
**Goal:** Transform SalesHub's email tracking from backend-only to a Mailsuite-caliber UI with per-email drill-down, real-time activity feeds, click analytics, and clickable call log rows.

---

## Project Scope Summary

### What SalesHub Has Today
- **Backend tracking** is solid: HMAC-signed open pixels, click redirects, reply webhooks
- **Database tables** store everything: `bdr.email_sends` (open_count, click_count, reply timestamps), `bdr.email_events` (granular event log with IP/user-agent/metadata)
- **Analytics page** shows aggregate KPIs (Total Contacts, Touchpoints, Replies, Reply Rate) but no per-email breakdown
- **Inbox page** is a unified activity stream but not email-tracking focused
- **Call log page** exists but rows are not clickable/expandable for detail

### What Mailsuite Does Better (Design Patterns to Adopt)
1. **Email Tracking List** — Sortable table of all tracked emails with Recipients, Subject, Sent Date, Activity summary (e.g. "6 opens - 4 clicks"), Last Activity timestamp. Click any row to drill in.
2. **Email Detail View** — Full activity timeline grouped by date. Each event shows icon + action + timestamp + recipient. Header has subject, recipients, send date, activity summary, "Open in Gmail" link.
3. **Click Report** — Dedicated page: Recipient | URL Clicked | Last Clicked | Total Clicks. See exactly which links drive engagement.
4. **Latest Activity Feed** — Real-time stream with filter tabs (All, Opens, Clicks, Replies). Relative timestamps ("22 hours ago"). Quick scan of what just happened.
5. **Email Productivity Stats** — KPI counters (Sent Emails, Recipients, etc.) + heatmaps showing when emails are sent and opened. Period selector.

### Additional SalesHub Requirement
6. **Clickable Call Log Rows** — Click anywhere on a call log row to expand and see full detail (recording player, notes, Fathom AI metrics, action items, disposition).

---

## Session Breakdown (6 Sessions)

### Session 1: Email Tracking List Page
**Files:** New page + API route + components
**Scope:**
- New `/app/email-tracking/page.tsx` — dedicated email tracking list page
- API route `/api/email-tracking` — queries `bdr.email_sends` joined with `bdr.email_events` for activity summaries
- Sortable/filterable table with columns:
  - Recipients (contact name + email chips)
  - Email subject + sent date subtitle
  - Activity badge ("6 opens - 4 clicks" or "Replied")
  - Last activity timestamp (relative + absolute)
  - Status indicator (sent/opened/clicked/replied color dot)
- Dropdown sort: Last opened, Last sent, Most opens, Most clicks
- Search by recipient name/email or subject
- Pagination (50 per page)
- Add nav link to sidebar

**Data Source:** `bdr.email_sends` joined with `crm.contacts` for recipient names
**Depends On:** Nothing (backend tracking already exists)

---

### Session 2: Email Detail View (Drill-Down)
**Files:** Dynamic page + API route + timeline component
**Scope:**
- New `/app/email-tracking/[id]/page.tsx` — detail view for a single tracked email
- Header card: Subject, Recipients (name + email), Send date, Activity summary (X opens, Y clicks, replied/not), "Open in Gmail" link (using `gmail_thread_id`)
- **Activity Timeline component** — chronological event feed grouped by date:
  - Open events: eye icon + "Opened email" + timestamp + "by [recipient]"
  - Click events: link icon + "Clicked link" + timestamp + URL clicked + "by [recipient]"
  - Reply events: reply icon + "Replied" + timestamp + reply snippet preview
  - IP/location metadata on hover (from `bdr.email_events.metadata`)
- API route `/api/email-tracking/[id]` — returns send record + all events sorted by timestamp
- Back navigation to list
- Make rows on the Session 1 list page clickable — clicking navigates to this detail view

**Data Source:** `bdr.email_sends` + `bdr.email_events` filtered by send_id
**Depends On:** Session 1 (list page to link from)

---

### Session 3: Click Report Page
**Files:** New page + API route
**Scope:**
- New `/app/email-tracking/clicks/page.tsx` — dedicated click analytics
- Table columns:
  - Recipient (name or email)
  - URL clicked (truncated with full URL on hover)
  - Email subject (which email contained the link)
  - Last clicked timestamp
  - Total clicks (count)
- Aggregate stats at top: Total clicks, Unique recipients who clicked, Most clicked URL, Click-through rate
- Filter by date range
- Sort by last clicked, total clicks, recipient
- CSV export button
- Add as sub-nav tab under Email Tracking

**Data Source:** `bdr.email_events` WHERE `event_type = 'click'` joined with `bdr.email_sends` + `crm.contacts`
**Depends On:** Session 1 (shares nav structure)

---

### Session 4: Latest Activity Feed
**Files:** New page + API route + feed components
**Scope:**
- New `/app/email-tracking/activity/page.tsx` — real-time activity stream
- Filter tabs: All | Opens | Clicks | Replies
- Each feed item shows:
  - Event icon (eye for open, link for click, reply arrow for reply)
  - "[Recipient] opened/clicked/replied to your email"
  - Email subject as subtitle
  - Relative timestamp ("22 hours ago", "2 days ago")
  - Click any item to navigate to the email detail view (Session 2)
- Auto-refresh every 30 seconds (reuse pattern from Inbox page)
- "Load more" pagination (newest first)
- Optional: Desktop notification badge in sidebar for new activity
- Add as sub-nav tab under Email Tracking

**Data Source:** `bdr.email_events` ordered by `event_at` DESC, joined with `bdr.email_sends` + `crm.contacts`
**Depends On:** Session 2 (links to detail view)

---

### Session 5: Email Productivity Dashboard
**Files:** New page + API route + chart components
**Scope:**
- New `/app/email-tracking/productivity/page.tsx` — email performance analytics
- Period selector: 7 days, 30 days, 90 days, custom range
- **KPI Cards row:**
  - Emails Sent (count)
  - Unique Recipients
  - Open Rate (%)
  - Click Rate (%)
  - Reply Rate (%)
  - Avg Opens Per Email
- **Heatmap: "When your emails get opened"** — day-of-week x hour-of-day grid showing open density (reuse green color scale like Mailsuite)
- **Heatmap: "When you send emails"** — same grid for send times
- **Top Performing Emails** — table of top 5 emails by engagement (opens + clicks)
- **Trend Chart** — daily sent vs opened vs clicked over selected period (line chart, reuse TrendChart component)
- Add as sub-nav tab under Email Tracking

**Data Source:** Aggregate queries on `bdr.email_sends` + `bdr.email_events`, grouped by date/hour
**Depends On:** Nothing (standalone analytics, but benefits from nav structure from Session 1)

---

### Session 6: Clickable Call Log Rows
**Files:** Modify existing calls page + new detail panel component
**Scope:**
- Modify `/app/calls/page.tsx` — make entire row clickable with hover state (cursor-pointer, subtle bg highlight)
- **Expandable Detail Panel** (slide-out or inline expand):
  - Call metadata: direction, status, disposition, duration, timestamps
  - Audio player for recording (if `recording_url` exists)
  - Call notes (editable inline)
  - Fathom AI metrics (if linked): talk/listen ratio, question count, filler words, longest monologue, meeting type
  - Action items extracted from call (if Fathom data exists)
  - Topics discussed
  - Link to contact profile
  - Quick actions: Add note, Create follow-up task, Log disposition
- Click anywhere on row to expand; click again or X to collapse
- Keyboard nav: arrow keys to move between rows, Enter to expand, Escape to close
- Maintain existing sort/filter functionality

**Files Modified:** `/src/app/calls/page.tsx` (primary), possibly new `/src/components/calls/CallDetailPanel.tsx`
**Depends On:** Nothing (standalone improvement to existing page)

---

## Architecture Notes

### Shared Components to Build
- `EmailEventTimeline` — reusable timeline for Session 2 detail + Session 4 feed
- `ActivityBadge` — "6 opens - 4 clicks" styled badge for list views
- `HeatmapChart` — day/hour grid visualization for Session 5
- `EmailTrackingNav` — sub-navigation tabs (Tracked Emails | Clicks | Activity | Productivity)

### API Pattern
All new API routes follow existing SalesHub patterns:
- Org-scoped queries via `tenant.ts` helpers
- Zod validation on query params
- Rate limiting via `rate-limit.ts`
- Auth via `route-auth.ts`

### No Database Migrations Required
All data already exists in `bdr.email_sends`, `bdr.email_events`, `crm.contacts`, and `crm.phone_calls`. This project is purely UI/API — no schema changes needed.

---

## Estimated Complexity
| Session | New Files | Modified Files | Difficulty |
|---------|-----------|----------------|------------|
| 1 - Tracking List | 3 | 1 (sidebar nav) | Medium |
| 2 - Detail View | 3 | 1 (list page links) | Medium |
| 3 - Click Report | 2 | 1 (nav tabs) | Easy-Medium |
| 4 - Activity Feed | 3 | 0 | Medium |
| 5 - Productivity | 3 | 0 | Medium-Hard (heatmap) |
| 6 - Call Log | 1-2 | 1 (calls page) | Medium |

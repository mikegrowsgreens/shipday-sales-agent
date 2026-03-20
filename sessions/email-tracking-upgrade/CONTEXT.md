# Email Tracking Upgrade — Project Context

**For use across all 6 build sessions in Claude Code.**
Paste this file at the start of each session so Claude has full context.

---

## What This Project Is

Upgrading SalesHub's email tracking from backend-only data collection to a full Mailsuite-style UI with per-email drill-down, click analytics, real-time activity feeds, productivity heatmaps, and expandable call log rows.

**Inspiration:** Mailsuite (mailsuite.com) — their tracked emails dashboard, click report, latest activity feed, and email productivity pages.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript 5
- **Styling:** Tailwind CSS 4, dark mode (gray-900 bg, gray-800 cards, gray-700 borders)
- **Icons:** Lucide React
- **Database:** PostgreSQL (multi-tenant, org_id scoping on all queries)
- **Auth:** Custom JWT via `route-auth.ts` and `tenant.ts` helpers
- **Validation:** Zod schemas in `/src/lib/validators/`
- **Rate Limiting:** `rate-limiter-flexible` via `/src/lib/rate-limit.ts`

---

## Existing Database Tables (No Migrations Needed)

### `bdr.email_sends` — Core tracked email records
```sql
id              UUID PRIMARY KEY
org_id          UUID
lead_id         UUID
to_email        TEXT
from_email      TEXT
subject         TEXT (available via campaign_emails join or stored directly)
gmail_message_id TEXT
gmail_thread_id  TEXT
open_count      INTEGER
click_count     INTEGER
first_open_at   TIMESTAMP
last_open_at    TIMESTAMP
reply_at        TIMESTAMP
replied         BOOLEAN
reply_classification TEXT
sent_at         TIMESTAMP
created_at      TIMESTAMP
```

### `bdr.email_events` — Granular event log
```sql
event_id        SERIAL PRIMARY KEY
org_id          UUID
lead_id         UUID
event_type      TEXT ('open', 'click', 'reply')
event_at        TIMESTAMP
to_email        TEXT
from_email      TEXT
metadata        JSONB (send_id, ip, user_agent, url, link_index, etc.)
created_at      TIMESTAMP
```

### `crm.contacts` — Master contact records
```sql
contact_id      UUID PRIMARY KEY
org_id          UUID
email           TEXT UNIQUE
phone           TEXT
first_name      TEXT
last_name       TEXT
business_name   TEXT
title           TEXT
lifecycle_stage TEXT
bdr_lead_id     UUID (links to bdr.leads)
```

### `crm.phone_calls` — Call records
```sql
call_id         UUID PRIMARY KEY
org_id          UUID
contact_id      UUID
twilio_call_sid TEXT
from_number     TEXT
to_number       TEXT
direction       TEXT (inbound/outbound)
status          TEXT
disposition     TEXT
duration_secs   INTEGER
recording_url   TEXT
notes           TEXT
started_at      TIMESTAMP
ended_at        TIMESTAMP
```

---

## Key Existing Files to Reference

### Email Tracking Backend
- `/src/lib/email-tracking.ts` — Pixel injection + link rewriting (HMAC-signed)
- `/src/lib/hmac.ts` — HMAC-SHA256 signing/verification
- `/src/app/api/track/o/[id]/route.ts` — Open tracking endpoint
- `/src/app/api/track/c/[id]/route.ts` — Click tracking redirect
- `/src/app/api/track/sent/route.ts` — Send confirmation webhook
- `/src/app/api/track/replies/route.ts` — Reply detection webhook

### Existing UI Pages (Patterns to Follow)
- `/src/app/analytics/page.tsx` — KPI cards, trend charts, funnel (follow this layout pattern)
- `/src/app/inbox/page.tsx` — Unified feed with tabs, auto-refresh, search (follow this pattern for activity feed)
- `/src/app/calls/page.tsx` — Call log table with sorting/filtering (modify this in Session 6)
- `/src/components/analytics/TrendChart.tsx` — Reusable line chart component
- `/src/components/analytics/FunnelChart.tsx` — Funnel visualization

### Auth & Tenant Patterns
- `/src/lib/route-auth.ts` — Use `withAuth()` wrapper on all API routes
- `/src/lib/tenant.ts` — Use `getOrgId()` to scope all DB queries
- `/src/lib/db.ts` — PostgreSQL query wrapper

### Existing Component Patterns
- `/src/components/ui/KpiGrid.tsx` — KPI metric cards (reuse for productivity stats)
- `/src/components/ui/DateRangeSelector.tsx` — Period picker (reuse for productivity)
- `/src/components/ui/Toast.tsx` — Toast notifications

---

## Design System

### Color Palette (Dark Mode)
- Background: `bg-gray-900`
- Card/Panel: `bg-gray-800`
- Borders: `border-gray-700`
- Text Primary: `text-white`
- Text Secondary: `text-gray-400`
- Text Muted: `text-gray-500`
- Accent/Links: `text-blue-400` or `text-green-400`
- Success: `text-green-400` / `bg-green-500/20`
- Warning: `text-yellow-400` / `bg-yellow-500/20`
- Error: `text-red-400` / `bg-red-500/20`

### Status Colors for Email Events
- **Sent:** `text-gray-400` (neutral)
- **Opened:** `text-green-400` (positive engagement)
- **Clicked:** `text-blue-400` (strong engagement)
- **Replied:** `text-purple-400` (highest engagement)
- **No activity:** `text-gray-600` (dim)

### Component Patterns
- Cards: `bg-gray-800 rounded-xl border border-gray-700 p-6`
- Table rows: `hover:bg-gray-800/50 cursor-pointer transition-colors`
- Badges: `px-2 py-0.5 rounded-full text-xs font-medium`
- Section headers: `text-lg font-semibold text-white`
- Timestamps: `text-sm text-gray-500`

---

## Mailsuite UI Patterns to Replicate

### Email Tracking List (Session 1)
- Clean table with generous row padding
- Recipients shown as name chips/badges
- Subject is primary text, sent date is smaller subtitle below it
- Activity column: bold count ("6 opens - 4 clicks") + "Last open on [date]" below
- Actions column: "..." menu button
- Sort dropdown at top: "Last opened emails" / "Last sent" / etc.
- "Download CSV" link top-right

### Email Detail View (Session 2)
- Subject as large heading at top with "Open in Gmail" link
- Metadata card below: Recipients, Send date, Activity summary
- "Email Activity" section with "Download Delivery Certificate" option
- Timeline: Date separator labels ("Yesterday", "Mar 11"), then events below
- Each event: Green eye icon + "Opened email [time]" + "by [recipient email]"

### Click Report (Session 3)
- Simple 4-column table: Recipient | URL | Last Clicked | Total Clicks
- "Download CSV" top-right

### Latest Activity Feed (Session 4)
- Filter tabs: All | Opens | Clicks | (Replies)
- Each item: eye/link icon + "[Name/email] opened/clicked your email" + subject subtitle + relative timestamp right-aligned
- Clickable rows navigate to email detail

### Email Productivity (Session 5)
- 4 KPI circles/cards across top: Sent Emails, Recipients, etc.
- "When you send your emails" heatmap (day-of-week x hour grid)
- "When you received your emails" heatmap
- Green gradient color scale for density

---

## Session Files Location

All session plans: `/saleshub/sessions/email-tracking-upgrade/`
- `SESSIONS-BREAKDOWN.md` — Full 6-session plan with scope per session
- `CONTEXT.md` — This file (paste at start of each session)

---

## Navigation Structure

Add to sidebar under a new "Email Tracking" section:
```
EMAIL TRACKING
  Tracked Emails    → /email-tracking
  Click Report      → /email-tracking/clicks
  Activity Feed     → /email-tracking/activity
  Productivity      → /email-tracking/productivity
```

The call log improvement (Session 6) modifies the existing `/calls` page — no nav changes needed.

---

## API Route Conventions

Follow existing patterns:
```typescript
// /src/app/api/email-tracking/route.ts
import { withAuth } from '@/lib/route-auth';
import { getOrgId } from '@/lib/tenant';
import { query } from '@/lib/db';

export const GET = withAuth(async (req) => {
  const orgId = getOrgId(req);
  // ... query with org_id WHERE clause
  return Response.json({ data });
});
```

All queries MUST include `WHERE org_id = $orgId` for tenant isolation.

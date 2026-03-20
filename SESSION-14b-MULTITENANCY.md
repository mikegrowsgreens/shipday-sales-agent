# Session 14b: Multi-Tenancy Implementation

**Prerequisite:** Session 14a (security fixes) complete and tested
**Scope:** Phase 2 from audit punch list
**Goal:** Every database query is scoped by `org_id`. No cross-tenant data leakage possible.
**Rule:** Do NOT deploy. Commit all changes for review.

---

## Overview

Currently 107 of 115 API routes query data globally with no tenant filtering. This session adds `org_id` to every table and every query, implements Row-Level Security as defense-in-depth, and rewrites the auth flow for proper multi-tenant login.

---

## Step 1: Schema Migration — Add org_id to All Tables

### Tables Already Having org_id (verify NOT NULL)
- `crm.contacts` — has org_id (nullable, needs NOT NULL)
- `crm.sequences` — has org_id (nullable, needs NOT NULL)
- `crm.task_queue` — has org_id (nullable, needs NOT NULL)
- `crm.touchpoints` — has org_id (nullable, needs NOT NULL)

### Tables Missing org_id — CRM Schema
Add `org_id INTEGER NOT NULL REFERENCES crm.organizations(id)` to:
- `crm.sequence_steps`
- `crm.sequence_enrollments`
- `crm.sequence_step_executions`
- `crm.calendly_events`
- `crm.sms_messages`
- `crm.shipday_signups`
- `crm.phone_calls`
- `crm.saved_segments`
- `crm.contact_merges`
- `crm.lifecycle_rules`
- `crm.deal_attribution`
- `crm.performance_goals`
- `crm.signup_funnel_events`
- `crm.linkedin_profiles`
- `crm.linkedin_activity`

### Tables Missing org_id — BDR Schema
Add `org_id INTEGER NOT NULL REFERENCES crm.organizations(id)` to:
- `bdr.leads`
- `bdr.campaigns`
- `bdr.campaign_emails`
- `bdr.email_sends`
- `bdr.templates`
- `bdr.campaign_templates`
- `bdr.scraping_jobs`
- `bdr.briefings`
- `bdr.email_templates`

### Tables Missing org_id — Brain Schema
Add `org_id INTEGER NOT NULL REFERENCES crm.organizations(id)` to:
- `brain.internal_content`
- `brain.tags`
- Any other brain tables

### Migration Script
Create `migrations/001-add-org-id-everywhere.sql`:
1. Add `org_id` column with DEFAULT 1 to all tables missing it
2. Backfill existing rows to org_id = 1
3. Make org_id NOT NULL (after backfill)
4. Remove DEFAULT (so new inserts must explicitly set org_id)
5. Make existing nullable org_id columns NOT NULL

```sql
-- Example pattern for each table:
ALTER TABLE crm.sequence_steps ADD COLUMN IF NOT EXISTS org_id INTEGER DEFAULT 1;
UPDATE crm.sequence_steps SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE crm.sequence_steps ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE crm.sequence_steps ALTER COLUMN org_id DROP DEFAULT;
ALTER TABLE crm.sequence_steps ADD CONSTRAINT fk_sequence_steps_org
  FOREIGN KEY (org_id) REFERENCES crm.organizations(id);
```

### Indexes
Create indexes for all new org_id columns:
```sql
CREATE INDEX IF NOT EXISTS idx_sequence_steps_org ON crm.sequence_steps(org_id);
CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_org ON crm.sequence_enrollments(org_id);
-- ... for every table
```

Create composite indexes for high-traffic queries:
```sql
CREATE INDEX IF NOT EXISTS idx_contacts_org_lifecycle ON crm.contacts(org_id, lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_org_updated ON crm.contacts(org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_touchpoints_org_contact ON crm.touchpoints(org_id, contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_queue_org_status ON crm.task_queue(org_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON bdr.leads(org_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_org ON bdr.campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_org ON bdr.email_sends(org_id);
```

---

## Step 2: Create Tenant Middleware Helper

Create `src/lib/require-tenant.ts`:
```typescript
import { getTenantFromSession } from './tenant';

export async function requireTenant(): Promise<{ orgId: number; userId: number; role: string }> {
  const tenant = await getTenantFromSession();
  if (!tenant?.org_id) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return {
    orgId: tenant.org_id,
    userId: tenant.user_id,
    role: tenant.role,
  };
}

export async function requireAdmin(): Promise<{ orgId: number; userId: number }> {
  const tenant = await requireTenant();
  if (tenant.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  return tenant;
}
```

---

## Step 3: Add org_id Filtering to All API Routes

### Pattern for Every Route

**Before:**
```typescript
const { rows } = await query('SELECT * FROM crm.contacts WHERE lifecycle_stage = $1', [stage]);
```

**After:**
```typescript
const { orgId } = await requireTenant();
const { rows } = await query('SELECT * FROM crm.contacts WHERE org_id = $1 AND lifecycle_stage = $2', [orgId, stage]);
```

### Routes to Update (Complete List)

**Contacts (6 routes):**
- `src/app/api/contacts/route.ts` — GET (list) and POST (create)
- `src/app/api/contacts/[id]/route.ts` — GET (detail) and PATCH (update)
- `src/app/api/contacts/bulk/route.ts` — POST (bulk operations)
- `src/app/api/contacts/duplicates/route.ts` — GET (find duplicates)
- `src/app/api/contacts/enrich/route.ts` — POST (enrich contact)
- `src/app/api/contacts/export/route.ts` — GET (CSV export)
- `src/app/api/contacts/import/route.ts` — POST (CSV import — set org_id on new contacts)
- `src/app/api/contacts/merge/route.ts` — POST (merge contacts)

**Sequences (7 routes):**
- `src/app/api/sequences/route.ts` — GET and POST
- `src/app/api/sequences/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/api/sequences/[id]/enroll/route.ts` — POST
- `src/app/api/sequences/[id]/enrollments/route.ts` — GET
- `src/app/api/sequences/[id]/clone/route.ts` — POST
- `src/app/api/sequences/execute/route.ts` — POST (webhook — scope by send's org_id)
- `src/app/api/sequences/generate/route.ts` — POST
- `src/app/api/sequences/regenerate-step/route.ts` — POST

**Tasks (4 routes):**
- `src/app/api/tasks/route.ts` — GET and PATCH
- `src/app/api/tasks/batch/route.ts` — POST
- `src/app/api/tasks/daily-plan/route.ts` — POST
- `src/app/api/tasks/snooze/route.ts` — PATCH

**Dashboard & Analytics (5 routes):**
- `src/app/api/dashboard/route.ts` — GET
- `src/app/api/analytics/route.ts` — GET
- `src/app/api/attribution/route.ts` — GET
- `src/app/api/activity/route.ts` — GET
- `src/app/api/pipeline/route.ts` — GET

**BDR / Outbound (~20 routes):**
- `src/app/api/bdr/campaigns/route.ts` — GET and POST
- `src/app/api/bdr/campaigns/action/route.ts` — POST
- `src/app/api/bdr/campaigns/edit/route.ts` — PATCH
- `src/app/api/bdr/campaigns/ab-test/route.ts`
- `src/app/api/bdr/campaigns/status/route.ts`
- `src/app/api/bdr/campaigns/performance/route.ts`
- `src/app/api/bdr/campaigns/calendar/route.ts`
- `src/app/api/bdr/campaigns/sends/route.ts`
- `src/app/api/bdr/campaigns/test-send/route.ts`
- `src/app/api/bdr/campaigns/regenerate/route.ts`
- `src/app/api/bdr/campaigns/bulk-regenerate/route.ts`
- `src/app/api/bdr/campaigns/generate-sequence/route.ts`
- `src/app/api/bdr/campaigns/process-scheduled/route.ts`
- `src/app/api/bdr/leads/route.ts`
- `src/app/api/bdr/scraping/route.ts`
- `src/app/api/bdr/templates/route.ts`
- `src/app/api/bdr/campaign-templates/route.ts`
- `src/app/api/bdr/email-templates/route.ts`
- `src/app/api/bdr/enrich/route.ts`
- `src/app/api/bdr/stats/route.ts`
- `src/app/api/bdr/activity/route.ts`
- `src/app/api/bdr/briefing/route.ts`
- `src/app/api/bdr/tracker/route.ts`
- `src/app/api/bdr/chat/route.ts`
- `src/app/api/bdr/chat/history/route.ts`
- `src/app/api/bdr/send-times/route.ts`

**Followups (~10 routes):**
- `src/app/api/followups/route.ts`
- `src/app/api/followups/deals/route.ts`
- `src/app/api/followups/deals/[id]/route.ts`
- `src/app/api/followups/deals/bulk-archive/route.ts`
- `src/app/api/followups/drafts/[id]/route.ts`
- `src/app/api/followups/generate/route.ts`
- `src/app/api/followups/regenerate/route.ts`
- `src/app/api/followups/approve/route.ts`
- `src/app/api/followups/add-touch/route.ts`
- `src/app/api/followups/email-context/route.ts`
- `src/app/api/followups/test-send/route.ts`
- `src/app/api/followups/analytics/route.ts`

**Phone (6 routes):**
- `src/app/api/phone/calls/route.ts`
- `src/app/api/phone/queue/route.ts`
- `src/app/api/phone/brief/route.ts`
- `src/app/api/phone/outcome/route.ts`
- `src/app/api/phone/analytics/route.ts`
- `src/app/api/phone/email-bridge/route.ts`
- `src/app/api/phone/sms-templates/route.ts`

**Brain (7 routes):**
- `src/app/api/brain/route.ts`
- `src/app/api/brain/learn/route.ts`
- `src/app/api/brain/learned/route.ts`
- `src/app/api/brain/sync/route.ts`
- `src/app/api/brain/import/route.ts`
- `src/app/api/brain/industry/route.ts`
- `src/app/api/brain/tags/route.ts`

**Coaching (4 routes):**
- `src/app/api/coaching/route.ts`
- `src/app/api/coaching/ai-coach/route.ts`
- `src/app/api/coaching/benchmarks/route.ts`
- `src/app/api/coaching/velocity/route.ts`
- `src/app/api/coaching/winloss/route.ts`

**Other:**
- `src/app/api/inbox/route.ts`
- `src/app/api/segments/route.ts`
- `src/app/api/lifecycle-rules/route.ts`
- `src/app/api/signature/route.ts`
- `src/app/api/signups/route.ts`
- `src/app/api/signups/convert/route.ts`
- `src/app/api/signups/cohorts/route.ts`
- `src/app/api/linkedin/route.ts`
- `src/app/api/linkedin/activity/route.ts`
- `src/app/api/linkedin/enrich/route.ts`

---

## Step 4: Row-Level Security (Defense in Depth)

After all application-level filtering is in place, add PostgreSQL RLS as a safety net:

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE crm.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.task_queue ENABLE ROW LEVEL SECURITY;
-- ... for every table

-- Create policy (application sets current_setting on each connection)
CREATE POLICY tenant_isolation ON crm.contacts
  USING (org_id = current_setting('app.current_org_id')::integer);
```

Update `src/lib/db.ts` to set `app.current_org_id` on each query:
```typescript
export async function queryTenant<T>(orgId: number, sql: string, params: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL app.current_org_id = '${orgId}'`);
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}
```

---

## Step 5: Rewrite Auth Flow for Multi-Tenant

### Login Page Update
**File:** `src/app/login/page.tsx`
- Add email field to login form
- Change from single-password auth to email+password auth
- Call `/api/auth` with `{ email, password }` instead of just `{ password }`

### Auth API Update
**File:** `src/app/api/auth/route.ts`
- If request has `email` field: use `validateUserCredentials()` from tenant.ts (multi-tenant path)
- If request has only `password` field: use legacy auth (restrict to org_id = 1 only, deprecation warning)
- Return JWT with `{ user_id, org_id, role, email }` payload

### Remove org_id Fallback to 1
In every route that currently does `const orgId = tenant?.org_id || 1`:
- Replace with `requireTenant()` from Step 2
- If no tenant, return 401 — never fall back to a default org

---

## Step 6: Fix Webhook Routes for Multi-Tenancy

Public webhook routes (tracking, Twilio, n8n) don't have session context. They need to resolve org_id from the data:

- `/api/track/o/[id]` and `/api/track/c/[id]` — look up the email_send record, get org_id from the send's lead/contact
- `/api/track/sent` and `/api/track/replies` — include org_id in the webhook payload from n8n
- `/api/sequences/execute` — look up enrollment, get org_id from the enrollment
- `/api/twilio/*` — look up the phone number, resolve to contact's org_id
- `/api/webhooks/engagement` — include org_id in the pixel URL or look up from contact_id

---

## Step 7: Connection Pool Improvements

**File:** `src/lib/db.ts`
```typescript
const pool = new Pool({
  connectionString: cleanConnString(raw),
  ssl: { ca: process.env.DB_CA_CERT, rejectUnauthorized: true },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: '30000', // 30 second query timeout
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err);
});
```

---

## Validation Checklist

After all changes:
- [ ] Migration script runs cleanly on a fresh database
- [ ] Migration script runs cleanly on existing database (with backfill)
- [ ] Every table has a non-nullable org_id column with foreign key to crm.organizations
- [ ] Every API route includes `AND org_id = $N` in all SQL queries
- [ ] Creating a second org and logging in as org 2 user shows zero data from org 1
- [ ] Org 2 user cannot access org 1 contact by guessing contact_id
- [ ] Webhook routes correctly resolve org_id from data (not session)
- [ ] Legacy single-password login either blocked or restricted to org 1
- [ ] Pool error handler is active; connection timeouts work
- [ ] RLS policies are active and prevent cross-tenant access even if application code has a bug

---

## New Files to Create

- `migrations/001-add-org-id-everywhere.sql`
- `migrations/002-add-composite-indexes.sql`
- `migrations/003-enable-rls.sql`
- `src/lib/require-tenant.ts`

## Files to Modify

- Every API route file listed in Step 3 (~82 files)
- `src/lib/db.ts` (pool config + tenant query helper)
- `src/app/login/page.tsx` (add email field)
- `src/app/api/auth/route.ts` (multi-tenant login)

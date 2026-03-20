# SalesHub Tab Audit & Fix Handoff

**Date**: 2026-03-11
**App**: https://saleshub.mikegrowsgreens.com
**Server**: root@167.172.119.28 `/var/www/saleshub/`
**Local project**: `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/`

## Login Status: FIXED

Login page now sends `{ email, password }` to `/api/auth`, which produces a multi-tenant JWT with `user_id`/`org_id`. Login with `mike@mikegrowsgreens.com` / `[REDACTED]`.

---

## Tab-by-Tab Results

### WORKING (200 OK)

| Tab | API Route | Notes |
|-----|-----------|-------|
| Dashboard | `/api/dashboard` | Returns CRM + BDR stats, 1,990b response |
| Inbox | `/api/inbox` | 26KB of data, working |
| Contacts | `/api/contacts` | 29KB, 1,090 contacts loaded |
| Queue | `/api/tasks` | Working, low data (645b) |
| Activity | `/api/activity` | 14KB activity feed |
| Sequences | `/api/sequences` | Working (389b) |
| BDR Leads | `/api/bdr/leads` | 26KB, 2,622 leads |
| BDR Stats | `/api/bdr/stats` | 2.8KB |
| Analytics | `/api/analytics` | 2.1KB |
| Brain Learned | `/api/brain/learned` | Empty but working |
| Brain Tags | `/api/brain/tags` | Empty but working |
| Coaching Benchmarks | `/api/coaching/benchmarks` | Working |
| Coaching Win/Loss | `/api/coaching/winloss` | Working |
| Signature | `/api/signature` | Working |

---

### BROKEN — 500 Errors (13 endpoints)

#### Category A: Missing `org_id` columns on tables

These tables exist but the code queries `WHERE org_id = $1` on them, and they don't have an `org_id` column:

| Endpoint | Table Missing `org_id` | File |
|----------|----------------------|------|
| `/api/brain` | `brain.internal_content`, `brain.performance_insights`, `brain.external_intelligence` | `src/app/api/brain/route.ts` |
| `/api/calls` | `public.calls` | `src/app/api/calls/route.ts` |
| `/api/segments` | `crm.saved_segments` | `src/app/api/segments/route.ts` |
| `/api/lifecycle-rules` | `crm.lifecycle_rules` | `src/app/api/lifecycle-rules/route.ts` |
| `/api/bdr/email-templates` | `bdr.email_templates` | `src/app/api/bdr/email-templates/route.ts` |
| `/api/bdr/campaign-templates` | `bdr.campaign_templates` | `src/app/api/bdr/campaign-templates/route.ts` |
| `/api/settings/org-config` | `crm.organizations` missing `config` column (has `settings` instead) | `src/app/api/settings/org-config/route.ts` |

**Fix**: Run ALTER TABLE to add `org_id` columns with DEFAULT 1:
```sql
-- wincall_brain database
ALTER TABLE brain.internal_content ADD COLUMN org_id INT DEFAULT 1;
ALTER TABLE brain.performance_insights ADD COLUMN org_id INT DEFAULT 1;
ALTER TABLE brain.external_intelligence ADD COLUMN org_id INT DEFAULT 1;
ALTER TABLE public.calls ADD COLUMN org_id INT DEFAULT 1;
ALTER TABLE crm.saved_segments ADD COLUMN org_id INT DEFAULT 1;
ALTER TABLE crm.lifecycle_rules ADD COLUMN org_id INT DEFAULT 1;
ALTER TABLE bdr.email_templates ADD COLUMN org_id INT DEFAULT 1;
ALTER TABLE bdr.campaign_templates ADD COLUMN org_id INT DEFAULT 1;
```

**Fix for org-config**: The API queries `SELECT config FROM crm.organizations` but the column is actually named `settings`. Either:
- Rename: `ALTER TABLE crm.organizations RENAME COLUMN settings TO config;`
- Or fix the query in `src/app/api/settings/org-config/route.ts` to use `settings` instead of `config`

#### Category B: Missing tables entirely

| Endpoint | Missing Table | File |
|----------|--------------|------|
| `/api/signups` | `crm.inbound_leads` | `src/app/api/signups/route.ts` |
| `/api/signups/cohorts` | `crm.inbound_leads` | `src/app/api/signups/route.ts` |
| `/api/settings/usage` | `crm.usage_events` | `src/app/api/settings/usage/route.ts` |
| `/api/followups/deals` | `deals.activity_log` (defaultdb) | `src/app/api/followups/deals/route.ts` |
| `/api/followups/analytics` | `deals.activity_log` (defaultdb) | `src/app/api/followups/analytics/route.ts` |

**Fix**: Create missing tables:
```sql
-- wincall_brain database
CREATE TABLE IF NOT EXISTS crm.inbound_leads (
  signup_id SERIAL PRIMARY KEY,
  org_id INT DEFAULT 1,
  business_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_id INT REFERENCES crm.contacts(contact_id),
  territory_match TEXT,
  funnel_stage TEXT DEFAULT 'signup',
  attribution_channel TEXT,
  attribution_source TEXT,
  signup_date TIMESTAMPTZ DEFAULT NOW(),
  converted_to_lead BOOLEAN DEFAULT FALSE,
  activated_at TIMESTAMPTZ,
  first_delivery_at TIMESTAMPTZ,
  retained_at TIMESTAMPTZ,
  churned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm.usage_events (
  id SERIAL PRIMARY KEY,
  org_id INT DEFAULT 1,
  event_type TEXT NOT NULL,
  resource_type TEXT,
  quantity INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- defaultdb database
CREATE TABLE IF NOT EXISTS deals.activity_log (
  id SERIAL PRIMARY KEY,
  deal_id INT REFERENCES deals.deals(deal_id),
  org_id INT DEFAULT 1,
  action_type TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Category C: Pipeline route — multiple issues

**File**: `src/app/api/pipeline/route.ts`

The pipeline route queries `public.deals` which lacks `org_id`. It also does a LEFT JOIN from `crm.contacts` to `public.deals` which may fail.

**Fix**: Add `org_id` to `public.deals`:
```sql
ALTER TABLE public.deals ADD COLUMN org_id INT DEFAULT 1;
```

---

### GATED — 403 Plan Upgrade Required (7 endpoints)

These endpoints return 403 with `PLAN_UPGRADE_REQUIRED`. The app has plan-gating logic that blocks features based on the org's `plan` field.

| Endpoint | Required Plan | Current Plan |
|----------|--------------|--------------|
| `/api/bdr/campaigns` | Starter | (check crm.organizations.plan) |
| `/api/coaching` | Starter | |
| `/api/coaching/velocity` | Starter | |
| `/api/phone/calls` | Pro | |
| `/api/phone/queue` | Pro | |
| `/api/phone/analytics` | Pro | |
| `/api/settings/api-keys` | Pro | |

**Fix**: Update the org's plan to unlock features:
```sql
-- Check current plan
SELECT org_id, name, plan FROM crm.organizations WHERE org_id = 1;

-- Upgrade to unlock all features
UPDATE crm.organizations SET plan = 'pro' WHERE org_id = 1;
```

Or if you want to keep the free plan, find and modify the plan-gating middleware. Look for `PLAN_UPGRADE_REQUIRED` in the codebase — likely in `src/lib/plans.ts` or similar.

---

### OTHER ISSUES

| Endpoint | Status | Issue |
|----------|--------|-------|
| `/api/analytics/attribution` | 404 | Route file likely missing or not matching path |
| `/api/linkedin` | 405 | GET not allowed — may only support POST |

---

## Additional org_id Gaps (Lower Priority)

These tables also lack `org_id` but may not be actively queried yet:

**wincall_brain:**
- `brain.*` (all 8 tables) — `auto_learned`, `content_tag_map`, `content_tags`, `effectiveness_log`, `industry_snippets`
- `bdr.*` — `ab_test_results`, `ab_tests`, `briefings`, `campaign_emails`, `chat_messages`, `chat_sessions`, `email_events`, `orchestrator_log`, `pipeline_snapshots`, `prompt_templates`, `reply_log`, `scoring_outcomes`, `scraping_jobs`, `suppression_list`
- `crm.*` — `contact_merges`, `deal_attribution`, `linkedin_activity`, `linkedin_profiles`, `performance_goals`, `signup_funnel_events`
- `public.*` — `deals`, `extracted_features`, `phrase_stats`, `rep_stats`, `scoring_feedback`, `scoring_rubric`

Batch fix:
```sql
-- Add org_id to all remaining tables (run in wincall_brain)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.tables t
    WHERE t.table_schema IN ('brain','bdr','crm','public')
      AND t.table_type = 'BASE TABLE'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = t.table_schema
          AND c.table_name = t.table_name
          AND c.column_name = 'org_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN org_id INT DEFAULT 1', r.table_schema, r.table_name);
    RAISE NOTICE 'Added org_id to %.%', r.table_schema, r.table_name;
  END LOOP;
END $$;
```

---

## Recommended Fix Order

1. **Run the batch `org_id` ALTER** — fixes Brain, Calls, Segments, Lifecycle Rules, Email Templates, Campaign Templates, Pipeline, and future routes
2. **Create 3 missing tables** — `crm.inbound_leads`, `crm.usage_events`, `deals.activity_log`
3. **Fix org-config column name** — rename `settings` → `config` or fix the query
4. **Upgrade plan to `pro`** — unlocks 7 gated features
5. **Rebuild + restart** after any code changes

## Deploy Workflow
```bash
# From local project root:
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' --exclude '.env*' ./ root@167.172.119.28:/var/www/saleshub/
ssh root@167.172.119.28 "cd /var/www/saleshub && npm run build && pm2 restart saleshub"
```

## Database Access
```bash
# wincall_brain (primary — brain.*, bdr.*, crm.*, public.*)
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p 25060 -U doadmin -d wincall_brain --set=sslmode=require

# defaultdb (deals.*)
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p 25060 -U doadmin -d defaultdb --set=sslmode=require
```

## PM2 Logs
```bash
ssh root@167.172.119.28 "pm2 logs saleshub --lines 50 --nostream 2>&1"
```

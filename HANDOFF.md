# SalesHub Deployment Handoff — Session Continuation

## Current State
- **App is deployed** at `https://saleshub.mikegrowsgreens.com` on DigitalOcean droplet 167.172.119.28
- **PM2 process** `saleshub` running on port 3005, Caddy reverse proxy active, SSL working
- **Server path**: `/var/www/saleshub/`
- **Database**: PostgreSQL on DigitalOcean managed DB (`wincall_brain` + `defaultdb`)
- **Data imported**: 2,616 leads in `bdr.leads`, 630 rows in `bdr.email_sends`, 1,151 contacts in `crm.contacts`, 519 touchpoints in `crm.touchpoints`, 150 Shipday customers

## Two Bugs to Fix

### Bug 1: Login page uses legacy password-only auth
**Symptom**: Login screen only shows a password field, no email field.

**Root cause**: `src/app/login/page.tsx` is the legacy single-tenant login. It sends `{ password }` to `/api/auth`, which creates a JWT **without** `user_id`/`org_id`. But every API route uses `requireTenantSession()` (in `src/lib/tenant.ts`), which requires `user_id` in the JWT payload (line 31: `if (!payload.user_id) return null`). So the legacy login produces a token that gets rejected by all API routes.

**Fix options** (pick one):
1. **Update login page** to include email + password fields and POST `{ email, password }` to `/api/auth`. The auth route already handles multi-tenant login at line 16-50 of `src/app/api/auth/route.ts`. The user account exists:
   - Email: `mike@mikegrowsgreens.com`
   - Password: `[REDACTED]` (bcrypt hash already set in `crm.users`)
   - org_id: 1, role: admin

2. **Or** modify `requireTenantSession()` to fall back to a default org when legacy token is detected (less clean but faster).

**Key files**:
- `src/app/login/page.tsx` — login UI (needs email field added)
- `src/app/api/auth/route.ts` — auth endpoint (already supports both flows)
- `src/lib/tenant.ts` — `requireTenantSession()` rejects tokens without user_id
- `src/lib/auth.ts` — `createSession()` (legacy) vs `createUserSession()` (multi-tenant)

### Bug 2: Dashboard API returns 500
**Symptom**: `API error 500: {"error":"Failed to load dashboard"}`

**Root cause**: All API route SQL queries use `WHERE org_id = $1` to scope data. The `org_id` columns were missing from all data tables until this session added them. Columns have been added and backfilled with `DEFAULT 1`:
- `crm.contacts`, `crm.touchpoints`, `crm.sequences`, `crm.sequence_enrollments`, `crm.task_queue`, `crm.calendly_events`, `crm.sms_messages`, `crm.shipday_signups`, `crm.phone_calls`, `crm.sequence_steps`, `crm.sequence_step_executions`
- `bdr.leads`, `bdr.email_sends`

**However**, the 500 error may persist because:
1. The login still produces a legacy token (Bug 1), so `requireTenantSession()` throws 401 before any SQL runs
2. Some queries reference tables/columns that may not exist (e.g., `deals.deals` and `deals.email_drafts` were just created as empty stubs in defaultdb)
3. The `crm.sequence_enrollments` table might not have `org_id` if the column wasn't added correctly

**To verify after fixing login**: Log in with email+password, then check PM2 error logs:
```bash
ssh root@167.172.119.28 "pm2 logs saleshub --lines 50 --nostream 2>&1"
```

## Database Access
```
# wincall_brain (primary — bdr.*, crm.*, public.*)
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p 25060 -U doadmin -d wincall_brain --set=sslmode=require

# defaultdb (deals.*)
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p 25060 -U doadmin -d defaultdb --set=sslmode=require
```

## Key Database State
```sql
-- User account (password is bcrypt-hashed, set via env var)
SELECT user_id, org_id, email, role, display_name FROM crm.users;
-- 1 | 1 | mike@mikegrowsgreens.com | admin | Mike Paulus

-- Organization
SELECT org_id, name, slug FROM crm.organizations;
-- 1 | MikeGrowsGreens | mikegrowsgreens

-- Data counts
SELECT 'bdr.leads' as tbl, COUNT(*) FROM bdr.leads
UNION ALL SELECT 'bdr.email_sends', COUNT(*) FROM bdr.email_sends
UNION ALL SELECT 'crm.contacts', COUNT(*) FROM crm.contacts
UNION ALL SELECT 'crm.touchpoints', COUNT(*) FROM crm.touchpoints;
```

## Server .env.local
Located at `/var/www/saleshub/.env.local` with:
- `DATABASE_URL_WINCALL` — wincall_brain connection (has `?sslmode=require`, stripped by `src/lib/db.ts`)
- `DATABASE_URL_DEFAULTDB` — defaultdb connection
- `AUTH_SECRET` — JWT signing key
- `DASHBOARD_PASSWORD` — legacy password (`[REDACTED]`)

## Deploy Workflow
```bash
# From local project root:
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' --exclude '.env*' ./ root@167.172.119.28:/var/www/saleshub/
ssh root@167.172.119.28 "cd /var/www/saleshub && npm install && npm run build && pm2 restart saleshub"
```

## Architecture Notes
- `src/lib/db.ts` — DB pool creation, strips sslmode from URL, sets `rejectUnauthorized: false` for DigitalOcean
- `src/lib/tenant.ts` — Multi-tenant session extraction from JWT
- `src/lib/route-auth.ts` — `withAuth()` wrapper used by most API routes
- `src/middleware.ts` — Edge middleware, validates JWT, redirects unauthenticated to /login
- All API routes expect `org_id` in JWT payload and use it to scope every SQL query

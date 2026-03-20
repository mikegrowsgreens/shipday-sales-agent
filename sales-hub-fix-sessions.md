# Sales Hub: Fix Sessions

## How to Use This Document
Each section below is a self-contained Claude Code session. Open a new Claude Code session at the Sales Hub project root, paste the full session block as your first message, and work through the fix before closing the session.

---

## Session 1: Agent Analytics — High

**Problem**
The Agent Analytics page (/agent-analytics) fails to load with "API error loading analytics". The page calls three API endpoints (/api/analytics/chatbot, /api/analytics/voice, /api/analytics/brain-health) which all query tables that do not exist in the database: `brain.conversation_outcomes` and `crm.voice_agent_calls`. These tables need to be created via a migration script.

**File Reference**
`src/app/api/analytics/chatbot/route.ts:36` and `src/app/api/analytics/voice/route.ts:37`

**Session Starter Prompt**
> The Sales Hub CRM at /Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub uses PostgreSQL on DigitalOcean with two databases. The agent analytics page fails because `brain.conversation_outcomes` and `crm.voice_agent_calls` tables are missing from the wincall_brain database. The API route handlers are at src/app/api/analytics/chatbot/route.ts and src/app/api/analytics/voice/route.ts. Here is the specific issue: The Agent Analytics page (/agent-analytics) fails to load with "API error loading analytics" because the tables it queries don't exist. Review both route files plus src/app/api/analytics/brain-health/route.ts to determine the full column schema needed, then create migration 020-agent-analytics-tables.sql and run it against the wincall_brain database. Please fix this issue, test the fix, and confirm the feature works correctly before closing the session.

**Acceptance Criteria**
- [x] Migration file `migrations/021-agent-analytics-tables.sql` exists with correct CREATE TABLE statements
- [x] Tables `brain.conversation_outcomes` and `crm.voice_agent_calls` exist in the database
- [x] The `/agent-analytics` page loads without errors (shows zero data for chatbot/voice, real data for brain health)
- [x] The `/api/analytics/chatbot`, `/api/analytics/voice`, and `/api/analytics/brain-health` endpoints return 200 with valid JSON

**Status**
- [x] In Progress
- [x] Fixed
- [x] Verified

---

## Session 2: Auth Secret — High

**Problem**
The AUTH_SECRET environment variable is set to `saleshub-secret-change-in-production-2026` in both .env.local and .env.production. This is a weak, predictable secret used to sign JWT session tokens. If an attacker guesses this value, they can forge valid session tokens and bypass authentication entirely.

**File Reference**
`.env.local:3` and `.env.production:3`

**Session Starter Prompt**
> The Sales Hub CRM uses JWT session tokens signed with AUTH_SECRET (via jose library, see src/lib/auth.ts). The current secret is weak and predictable: "saleshub-secret-change-in-production-2026". Here is the specific issue: Generate a new 128-character hex secret, update AUTH_SECRET in .env.local and .env.production, and if you have server access, update it on the DigitalOcean droplet (167.172.119.28) and restart PM2. Verify login still works after the change. The relevant files are .env.local:3, .env.production:3, and src/lib/auth.ts.

**Acceptance Criteria**
- [x] AUTH_SECRET in .env.local and .env.production is a cryptographically random 128-character hex string
- [x] The login flow works correctly with the new secret
- [x] If server access is available, the production env is updated and PM2 restarted

**Status**
- [x] In Progress
- [x] Fixed
- [x] Verified

---

## Session 3: n8n Email Send Webhook — High

**Problem**
The n8n webhook endpoint `https://automation.mikegrowsgreens.com/webhook/dashboard-send-approved` returns HTTP 404. This webhook is called by multiple API routes when emails are approved for sending. If this workflow is not active in n8n, outbound email delivery will fail.

**File Reference**
`src/app/api/bdr/campaigns/process-scheduled/route.ts` and `src/lib/test-send.ts`

**Session Starter Prompt**
> The Sales Hub CRM triggers email sends by POSTing to an n8n webhook at `{N8N_BASE_URL}/webhook/dashboard-send-approved`. This webhook currently returns 404 when tested. Here is the specific issue: The primary email sending workflow in n8n is not active or doesn't exist, which means outbound email delivery from the CRM will fail. Check the n8n instance at automation.mikegrowsgreens.com to verify the workflow exists and is active. Search for "dashboard-send-approved" in the saleshub codebase to understand the expected payload format. If the workflow needs to be created, build it in n8n to accept the email payload and send via SMTP or API.

**Acceptance Criteria**
- [x] The n8n workflow for `dashboard-send-approved` exists and is active
- [x] POST to `https://automation.mikegrowsgreens.com/webhook/dashboard-send-approved` returns 200 (not 404)
- [x] A test email can be sent successfully from the CRM

**Status**
- [x] In Progress
- [x] Fixed
- [x] Verified

---

## Session 4: Dashboard Password — Medium

**Problem**
The DASHBOARD_PASSWORD is set to `[REDACTED]`, which is easily guessable. The login page is exposed to the public internet.

**File Reference**
`.env.local:4` and `.env.production:4`

**Session Starter Prompt**
> The Sales Hub CRM uses a simple password-based login (DASHBOARD_PASSWORD env var, validated in src/lib/auth.ts). The current password is "[REDACTED]" which is weak. Here is the specific issue: Change the password in .env.local and .env.production to a strong random password (20+ chars with mixed case, numbers, symbols). Update on the server if accessible and restart PM2. The relevant file is .env.production:4. Please fix this issue, test the fix, and confirm login works correctly before closing the session.

**Acceptance Criteria**
- [x] DASHBOARD_PASSWORD is a strong random password (20+ characters)
- [x] Login works with the new password
- [x] Old password no longer works

**Status**
- [x] In Progress
- [x] Fixed
- [x] Verified

---

## Session 5: Duplicate Migration Prefix — Medium

**Problem**
There are two migration files with prefix 016: `016-customer-hub.sql` and `016-scheduling.sql`. This creates ambiguity about migration ordering.

**File Reference**
`migrations/016-customer-hub.sql` and `migrations/016-scheduling.sql`

**Session Starter Prompt**
> The Sales Hub CRM has SQL migrations in the migrations/ directory numbered 001 through 019. There are two files with prefix 016 (016-customer-hub.sql and 016-scheduling.sql). Here is the specific issue: Rename the scheduling migration to 017 and renumber all subsequent files. These are just SQL files applied manually — no migration framework to update. The relevant files are in the migrations/ directory. Please fix this issue and confirm the numbering is sequential with no gaps or duplicates.

**Acceptance Criteria**
- [x] No duplicate migration numbers exist
- [x] All migrations are numbered sequentially without gaps
- [x] File contents are unchanged (only filenames change)

**Status**
- [x] In Progress
- [x] Fixed
- [x] Verified

---

## Session 6: Remove .cookies File — Low

**Problem**
An empty `.cookies` file exists in the project root, likely from a curl command during development.

**File Reference**
`.cookies` (project root)

**Session Starter Prompt**
> Delete the empty .cookies file from the Sales Hub project root at /Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/.cookies and add ".cookies" to the .gitignore file. Please fix this issue and confirm the file is removed and gitignored.

**Acceptance Criteria**
- [x] `.cookies` file is deleted from project root
- [x] `.cookies` is added to `.gitignore`

**Status**
- [x] In Progress
- [x] Fixed
- [x] Verified

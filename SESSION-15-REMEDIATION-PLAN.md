# Session 15: Post-Audit Remediation Plan

**Prerequisite:** Session 14g audit complete (AUDIT-COMPARISON.md)
**Overall Score:** 56/100 → Target: 80+/100
**Verdict:** NOT READY — Critical gaps in multi-tenancy, testing, observability, and security

---

## Session 15a: Multi-Tenancy — Fix Data Isolation (CRITICAL)

**Current Score:** 35/100 → **Target:** 90/100
**Estimated Scope:** ~40 route files + 3 lib files

### Priority 1: Fix `withTenant()` to reject instead of degrade
- [ ] `src/lib/tenant.ts:52-57` — When `orgId` is undefined, throw 401 instead of stripping `org_id` filters
- [ ] Add `requireTenant()` wrapper that calls `getTenantFromSession()` and throws 401 if no session

### Priority 2: Remove all `org_id || 1` fallbacks (16 locations)
- [ ] `src/lib/org-config.ts` — `getOrgConfigFromSession()` uses `org_id || 1`
- [ ] All settings routes — grep for `org_id || 1` and `orgId || 1` across `src/`
- [ ] Replace every fallback with `requireTenant()` that returns 401

### Priority 3: Add org_id scoping to ALL routes (0% currently pass)
The following core routes have ZERO org_id in any SQL query:
- [ ] `src/app/api/pipeline/route.ts`
- [ ] `src/app/api/dashboard/route.ts`
- [ ] `src/app/api/analytics/route.ts`
- [ ] `src/app/api/tasks/route.ts`
- [ ] `src/app/api/inbox/route.ts`
- [ ] `src/app/api/segments/route.ts`
- [ ] `src/app/api/signups/route.ts`
- [ ] `src/app/api/brain/route.ts`
- [ ] `src/app/api/followups/deals/route.ts`
- [ ] ALL remaining ~30+ routes — every SQL query must include `AND org_id = $N` using the session org_id

### Priority 4: Add auth check to every route handler
- [ ] Every GET/POST/PUT/PATCH/DELETE handler must call `getTenantFromSession()` at the top
- [ ] 15 of 20 sampled routes were missing auth on at least one handler — fix all

### Priority 5: Database-level safety net
- [ ] Add PostgreSQL Row-Level Security (RLS) policies on all tenant-scoped tables
- [ ] Create migration SQL script for RLS: `ALTER TABLE crm.contacts ENABLE ROW LEVEL SECURITY; CREATE POLICY ...`
- [ ] Apply RLS to: contacts, sequences, campaigns, tasks, calls, emails, segments, pipeline/deals, brain entries, inbound_leads, audit_log, api_keys, tracking events

### Priority 6: Add composite indexes
- [ ] Create indexes for high-traffic org-scoped queries: `(org_id, created_at)`, `(org_id, email)`, `(org_id, status)` on contacts, sequences, campaigns tables

### Verification
- [ ] Create Org A with test data, create Org B, login as Org B → verify zero Org A data on every page
- [ ] Direct API calls with Org A resource IDs as Org B user → verify 403/404 on all endpoints

---

## Session 15b: Security Hardening (CRITICAL + HIGH)

**Current Score:** 72/100 → **Target:** 85/100

### Priority 1: Fix SQL injection (CRITICAL)
- [ ] `src/app/api/pipeline/route.ts:19` — Replace `stageList` string interpolation with parameterized query
- [ ] `src/app/api/pipeline/route.ts:52` — Replace `ownerName` string interpolation with `$N` parameter
- [ ] `src/app/api/pipeline/route.ts:72` — Same fix for second `ownerName` usage
- [ ] Audit all routes for any other `${variable}` patterns inside SQL strings

### Priority 2: Add Content-Security-Policy header
- [ ] `next.config.ts` — Add CSP header: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.anthropic.com`
- [ ] Test that CSP doesn't break existing functionality

### Priority 3: Extend rate limiting
- [ ] `src/app/api/bdr/*/route.ts` — Add rate limiting to all AI generation endpoints (cost protection)
- [ ] `src/app/api/brain/route.ts` — Add rate limiting
- [ ] `src/app/api/contacts/import/route.ts` — Add rate limiting (abuse prevention)
- [ ] Consider per-org rate limits instead of just IP-based

### Priority 4: Add Zod validation to remaining routes
Currently only auth routes have Zod. Add to:
- [ ] `src/app/api/contacts/route.ts` POST — validate contact fields
- [ ] `src/app/api/sequences/route.ts` POST — validate sequence creation
- [ ] `src/app/api/campaigns/route.ts` POST — validate campaign creation
- [ ] `src/app/api/tasks/route.ts` POST/PUT — validate task fields
- [ ] `src/app/api/pipeline/route.ts` POST/PUT — validate deal fields
- [ ] `src/app/api/brain/route.ts` POST — validate brain entries
- [ ] `src/app/api/settings/*/route.ts` — validate all settings updates
- [ ] All remaining routes that accept request body input

---

## Session 15c: Reliability & Observability (CRITICAL)

**Current Score:** 30/100 → **Target:** 80/100

### Priority 1: Install and configure Sentry (CRITICAL)
- [ ] `npm install @sentry/nextjs`
- [ ] Create `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- [ ] Add `SENTRY_DSN` to `src/lib/config.ts`
- [ ] Wrap `next.config.ts` with `withSentryConfig()`
- [ ] Add `instrumentation.ts` for server-side init
- [ ] Test: trigger an error and verify it appears in Sentry dashboard

### Priority 2: Replace console.log with structured logging (CRITICAL)
- [ ] `npm install pino pino-http`
- [ ] Create `src/lib/logger.ts` — configure pino with JSON output, log levels, request context
- [ ] Replace all 70+ `console.log/error/warn` calls in `src/` with `logger.info/error/warn`
- [ ] Add request correlation IDs via middleware (`X-Request-Id` header)
- [ ] Ensure structured logs include: timestamp, level, message, requestId, org_id, user_id, route

### Priority 3: Database pool hardening
- [ ] `src/lib/db.ts` — Add `pool.on('error', handler)` to both pools
- [ ] Add `idleTimeoutMillis: 30000` and `connectionTimeoutMillis: 5000`
- [ ] Add `max: 20` (increase from 10)
- [ ] Rename `wincallPool` → `primaryPool` (remove legacy branding)
- [ ] Rename `DATABASE_URL_WINCALL` env var → `DATABASE_URL` (update config.ts)

### Priority 4: Add API call timeouts
- [ ] `src/lib/ai.ts` — Add `AbortController` with 60s timeout to all Anthropic API calls
- [ ] All n8n webhook fire-and-forget calls — Add 10s timeout via `AbortController`
- [ ] All Twilio API calls — Add timeout
- [ ] Add timeout wrapper utility: `fetchWithTimeout(url, options, timeoutMs)`

### Priority 5: Add database transactions
- [ ] Contact import (multi-row insert) — wrap in `BEGIN`/`COMMIT`/`ROLLBACK`
- [ ] Signup flow (org + user creation) — wrap in transaction
- [ ] Account deletion — wrap in transaction
- [ ] Bulk operations (contacts/bulk) — wrap in transaction
- [ ] Any route with 2+ sequential writes — wrap in transaction

### Priority 6: Add health endpoint
- [ ] Create `src/app/api/health/route.ts` — return 200 with DB connectivity check, pool stats, uptime

### Priority 7: Engagement tracking deduplication
- [ ] Add idempotency check to tracking routes (opens, clicks) — deduplicate by contact_id + event_type + time window

---

## Session 15d: Testing Infrastructure (CRITICAL)

**Current Score:** 0% test coverage → **Target:** Core paths covered

### Priority 1: Install test framework
- [ ] `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom`
- [ ] Create `vitest.config.ts` with path aliases matching `tsconfig.json`
- [ ] Add `"test": "vitest", "test:run": "vitest run"` to `package.json` scripts

### Priority 2: Unit tests for critical lib modules
- [ ] `src/lib/tenant.ts` — test `requireTenant()` throws 401 on missing session, returns org_id on valid session
- [ ] `src/lib/auth.ts` — test JWT creation/verification, password hashing
- [ ] `src/lib/hmac.ts` — test token signing and verification
- [ ] `src/lib/feature-gate.ts` — test plan enforcement, upgrade errors
- [ ] `src/lib/usage.ts` — test limit checking
- [ ] `src/lib/org-config.ts` — test config loading and defaults
- [ ] `src/lib/rate-limit.ts` — test rate limit enforcement
- [ ] `src/lib/ssrf.ts` — test private IP blocking
- [ ] `src/lib/validators/*.ts` — test Zod schemas accept valid/reject invalid input

### Priority 3: API route integration tests
- [ ] Auth routes: signup, login, logout, forgot-password, reset-password
- [ ] Contacts: CRUD + import + bulk operations
- [ ] Multi-tenancy isolation: Org A data invisible to Org B
- [ ] Feature gating: free plan blocked from pro features
- [ ] Rate limiting: verify 429 responses

### Priority 4: E2E smoke test
- [ ] Install Playwright or Cypress
- [ ] Signup → login → create contact → create sequence → verify data appears
- [ ] Mobile viewport test

---

## Session 15e: Design System & Accessibility

**Current Score:** 48/100 → **Target:** 75/100

### Priority 1: Create shared UI component library
- [ ] `src/components/ui/Button.tsx` — variants (primary, secondary, danger, ghost), sizes, loading state, disabled state, ARIA attributes
- [ ] `src/components/ui/Input.tsx` — label, error state, helper text, proper htmlFor
- [ ] `src/components/ui/Modal.tsx` — focus trap, Escape key close, backdrop click, `role="dialog"`, `aria-modal="true"`
- [ ] `src/components/ui/Table.tsx` — sortable headers, responsive scroll wrapper
- [ ] `src/components/ui/Badge.tsx` — color variants for status indicators
- [ ] `src/components/ui/Pagination.tsx` — page numbers, prev/next, aria-labels
- [ ] `src/components/ui/EmptyState.tsx` — icon, title, description, CTA button
- [ ] `src/components/ui/ConfirmDialog.tsx` — replace all `window.confirm()` usage

### Priority 2: Fix accessibility violations (30+ locations)
- [ ] Replace all `focus:outline-none` with `focus-visible:ring-2 focus-visible:ring-blue-500` across:
  - calls, assistant, settings, pipeline, inbox, chat, followups, signup, contacts pages
- [ ] Add `aria-label` to all icon-only buttons
- [ ] Ensure all `<label>` elements have `htmlFor` or wrap their input
- [ ] Add `aria-live="polite"` and `role="status"` to Toast component
- [ ] Settings tabs: add `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`

### Priority 3: Mobile responsive layout
- [ ] Sidebar: add collapse/hamburger menu for < 768px viewport
- [ ] Mobile header component with menu toggle
- [ ] Pipeline: add list view alternative for mobile
- [ ] Tables: horizontal scroll wrapper on small screens
- [ ] Test at 375px (iPhone SE) viewport

### Priority 4: Empty states
- [ ] Dashboard: Getting Started checklist when no data
- [ ] Contacts list: empty state with import CTA
- [ ] Sequences list: empty state with create CTA
- [ ] Followups: empty state
- [ ] Pipeline: empty state

### Priority 5: Break up god components
- [ ] `src/app/settings/page.tsx` (1,299 lines) → Split into 7 tab components
- [ ] `src/app/calls/page.tsx` (1,216 lines) → Split into 3 sub-view components
- [ ] `src/app/contacts/page.tsx` (771 lines) → Extract table, filters, import modal
- [ ] `src/app/signups/page.tsx` (769 lines) → Extract table, filters

---

## Session 15f: Architecture & Code Quality

**Current Score:** 58/100 → **Target:** 75/100

### Priority 1: Centralized API error handling
- [ ] Create `src/lib/api-error.ts` — `ApiError` class with `status`, `code`, `message`
- [ ] Create `handleApiError()` utility that returns consistent `{ error, code }` JSON response
- [ ] Update all routes to use `handleApiError()` in catch blocks

### Priority 2: Code quality tooling
- [ ] Create `.prettierrc` config
- [ ] Create `eslint.config.mjs` (referenced in package.json but missing)
- [ ] `npm install -D prettier eslint husky lint-staged`
- [ ] Configure husky pre-commit hook: `npx lint-staged` running prettier + eslint
- [ ] Run prettier on entire codebase

### Priority 3: Database migration framework
- [ ] Install Drizzle ORM or a migration runner
- [ ] Create initial migration from current schema
- [ ] Add migration scripts to package.json
- [ ] Document migration workflow

### Priority 4: Shared React hooks directory
- [ ] Create `src/hooks/` directory
- [ ] Extract common patterns: `useDebounce`, `usePagination`, `useMediaQuery`, `useTenant`

### Priority 5: Clean up legacy branding
- [ ] `src/lib/db.ts` — Rename `wincallPool` → `primaryPool`, update all references
- [ ] `src/lib/config.ts` — Rename `DATABASE_URL_WINCALL` → `DATABASE_URL`

---

## Session 15g: MicroSaaS Readiness

**Current Score:** 65/100 → **Target:** 75/100

### Priority 1: Create Terms & Privacy pages
- [ ] `src/app/terms/page.tsx` — Terms of Service page (template content, configurable per-org)
- [ ] `src/app/privacy/page.tsx` — Privacy Policy page (template content, configurable per-org)
- [ ] Verify signup page links work

### Priority 2: Create health endpoint
- [ ] `src/app/api/health/route.ts` — Returns 200 with: DB connectivity, pool stats, uptime, version
- [ ] Verify admin dashboard health link works

### Priority 3: Verify admin API routes
- [ ] Test `src/app/api/admin/tenants/route.ts` — verify it returns tenant list
- [ ] Test `src/app/api/admin/system-stats/route.ts` — verify it returns stats
- [ ] Fix any broken admin endpoints

### Priority 4: CI/CD pipeline
- [ ] Create `.github/workflows/ci.yml` — lint, type-check, test on push
- [ ] Create `.github/workflows/deploy.yml` — deploy to DigitalOcean on main push (uses existing `scripts/deploy.sh`)

---

## Execution Order

| Order | Session | Focus | Severity | Est. Routes/Files |
|-------|---------|-------|----------|-------------------|
| 1 | **15a** | Multi-Tenancy Data Isolation | CRITICAL | ~40 routes + 3 libs |
| 2 | **15b** | Security (SQLi, CSP, rate limits, Zod) | CRITICAL+HIGH | ~30 routes + config |
| 3 | **15c** | Reliability (Sentry, pino, timeouts, txns) | CRITICAL | ~70 files + 5 libs |
| 4 | **15d** | Testing Infrastructure | CRITICAL | new test files |
| 5 | **15e** | Design System & Accessibility | HIGH | ~20 components + pages |
| 6 | **15f** | Architecture & Code Quality | MEDIUM | ~10 libs + config |
| 7 | **15g** | MicroSaaS Readiness | HIGH | ~5 new files + CI |
| 8 | **15h** | Full Stakeholder Review | GATE | audit + walkthrough |

**Sessions 15a and 15b should be done FIRST** — they address the critical security and data isolation issues that make the app unsuitable for any production use. Session 15c (observability) is next so you can monitor the fixes. Session 15d (testing) should follow so future changes are verified.

---

## Session 15h: Full Stakeholder Review (LAUNCH GATE)

**Prerequisite:** Sessions 15a–15g all complete
**Attendees:** Engineer (you), Founder, Sales Leadership
**Purpose:** Final sign-off before production deployment
**Rule:** Nothing ships until this session produces a GO decision

### Part 1: Re-run the 8-Dimension Audit
- [ ] Execute the full Session 14g audit checklist against the remediated codebase
- [ ] Generate updated AUDIT-COMPARISON-v2.md with before/after/after-v2 scores
- [ ] Confirm all 8 dimensions meet target thresholds (80+ overall)
- [ ] Document any remaining issues with severity and accepted-risk justification

### Part 2: Engineering Walkthrough
- [ ] Live demo: Create Org A → add data → Create Org B → prove complete data isolation
- [ ] Live demo: Attempt SQL injection on pipeline route → show it's blocked
- [ ] Live demo: Trigger an error → show it appears in Sentry with structured context
- [ ] Live demo: Run `npm run test:run` → show all tests passing
- [ ] Live demo: Run `npm run build` → show clean build with zero warnings
- [ ] Review rate limiting: hit AI generation endpoint rapidly → show 429 responses
- [ ] Review CSP headers in browser DevTools → confirm no policy violations
- [ ] Review database: show RLS policies active, composite indexes in place

### Part 3: Founder Review
- [ ] Product walkthrough: Full signup → onboarding → first contact → first sequence → first campaign flow
- [ ] Verify branding: no Shipday/wincall/mikegrowsgreens references visible anywhere in UI
- [ ] Verify org config: change company name, persona, value props → see changes reflected in AI output and sidebar
- [ ] Verify feature gating: demo free plan limits, upgrade prompts, plan comparison
- [ ] Verify GDPR: export data → inspect export file completeness; test delete account flow
- [ ] Verify admin panel: super-admin can see all tenants, system stats, health status
- [ ] Review Terms of Service and Privacy Policy pages for content accuracy

### Part 4: Sales Leadership Review
- [ ] Onboarding experience: Is the signup → first-value flow under 5 minutes?
- [ ] Demo readiness: Can you demo the full product to a prospect without hitting bugs?
- [ ] Competitive positioning: Do plan tiers (free/starter/pro) make sense for target market?
- [ ] Feature completeness: Are there any "table stakes" features missing that prospects will ask about?
- [ ] Integration story: Twilio, SMTP, n8n — are these easy to configure per-customer?
- [ ] Data story: Is the analytics/dashboard view compelling enough for a sales conversation?
- [ ] Mobile experience: Can a sales rep use this on their phone between meetings?

### Part 5: Launch Decision

| Verdict | Criteria |
|---------|----------|
| **GO** | All dimensions 75+, no CRITICAL issues, all stakeholders approve |
| **CONDITIONAL GO** | All dimensions 70+, remaining issues are LOW/MEDIUM with documented timeline |
| **NO GO** | Any CRITICAL issue remains, any dimension below 60, or stakeholder veto |

### Deliverables
- [ ] `AUDIT-COMPARISON-v2.md` — Final audit scores
- [ ] `LAUNCH-DECISION.md` — GO/NO-GO verdict with stakeholder signatures, accepted risks, and post-launch monitoring plan
- [ ] `POST-LAUNCH-BACKLOG.md` — Any deferred LOW/MEDIUM items with owners and target dates

---

## Success Criteria

After all Session 15 sub-sessions are complete, re-run the Session 14g audit. Target scores:

| Dimension | Current | Target |
|-----------|---------|--------|
| Code Quality | 62 | 80+ |
| Security | 72 | 85+ |
| Multi-Tenancy | 35 | 90+ |
| Design & UX | 48 | 75+ |
| Usefulness | 78 | 85+ |
| Reliability | 30 | 80+ |
| Architecture | 58 | 75+ |
| MicroSaaS | 65 | 75+ |
| **Overall** | **56** | **80+** |

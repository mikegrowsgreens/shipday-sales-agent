# SalesHub Founder Review — Engineering & Product Audit Report

**Date:** 2026-03-10
**Codebase:** `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub`
**Stack:** Next.js 16.1.6, React 19, Tailwind CSS 4, PostgreSQL, Anthropic Claude API, Twilio, n8n
**Scope:** 43,225 lines TypeScript/TSX, 115 API routes, 35 components, 6 schema files
**Verdict:** NOT production-ready for multi-tenant deployment. Significant work required across all 8 dimensions.

---

## OVERALL SCORECARD

| Dimension | Score | Grade | Launch Blocker? |
|-----------|-------|-------|-----------------|
| 1. Code Quality & Standards | 45/100 | D+ | Yes |
| 2. Security | 15/100 | F | **YES — CRITICAL** |
| 3. Multi-Tenancy & Scalability | 10/100 | F | **YES — CRITICAL** |
| 4. Design & UX | 40/100 | D | Yes |
| 5. Usefulness & Pain Points | 55/100 | C- | Yes |
| 6. Reliability & Observability | 10/100 | F | **YES — CRITICAL** |
| 7. Architecture & Structure | 50/100 | C- | No |
| 8. MicroSaaS Readiness | 12/100 | F | **YES — CRITICAL** |

**Total Issues Found: 160+**
- CRITICAL: 42
- HIGH: 38
- MEDIUM: 51
- LOW: 29+

---

## DIMENSION 1: CODE QUALITY & STANDARDS (45/100)

### What's Good
- TypeScript strict mode is ON (`strict: true` in tsconfig)
- Zero `any` types, zero `@ts-ignore` directives
- Well-structured types file (663 lines, 100+ interfaces)
- Typed generics on database queries (`query<Contact>(...)`)

### CRITICAL Issues

| ID | File | Line | Issue |
|----|------|------|-------|
| CQ-1 | `src/app/api/dashboard/route.ts` | 34-40 | **SQL injection**: `from` and `to` query params interpolated directly into SQL strings |
| CQ-2 | Entire project | — | **Zero test files**. No Jest, Vitest, or any test framework installed |
| CQ-3 | `src/lib/auth.ts` | 4, 29 | Hardcoded JWT secret `'dev-secret-change-me'` and password `'[REDACTED]'` |
| CQ-4 | `src/middleware.ts`, `src/lib/tenant.ts` | 4, 5 | Same hardcoded JWT secret duplicated in 3 files |

### HIGH Issues

| ID | File | Line | Issue |
|----|------|------|-------|
| CQ-5 | `src/app/api/auth/route.ts` | 4-23 | No try/catch — malformed JSON body crashes the route |
| CQ-6 | `src/app/api/contacts/route.ts` | 6-92 | No try/catch on GET or POST handlers |
| CQ-7 | `src/app/api/contacts/[id]/route.ts` | 6-131 | No try/catch on GET or PATCH handlers |
| CQ-8 | `src/app/api/tasks/route.ts` | 5-101 | No try/catch on GET or PATCH handlers |
| CQ-9 | `src/app/api/sequences/route.ts` | 5-133 | No try/catch; POST does multi-insert with no DB transaction |
| CQ-10 | Entire codebase | — | No schema validation library (no Zod, Joi, Yup). Request bodies are destructured raw |
| CQ-11 | Entire codebase | — | 230+ `console.error`/`console.log` calls. No structured logging (no pino/winston) |
| CQ-12 | Root SQL files | — | No migration tool. 6 manual SQL files applied by hand. No version tracking or rollback |
| CQ-13 | `src/app/api/followups/approve/route.ts` | 112 | Hardcoded email `mike@mikegrowsgreens.com` |
| CQ-14 | 12 files | Various | `N8N_BASE_URL` fallback `automation.mikegrowsgreens.com` repeated in 12 files |
| CQ-15 | `src/lib/email-tracking.ts` | 12 | Hardcoded fallback `saleshub.mikegrowsgreens.com` |

### MEDIUM Issues

| ID | Issue |
|----|-------|
| CQ-16 | No Prettier config, no pre-commit hooks (husky/lint-staged) |
| CQ-17 | ~20 INTERVAL interpolation instances (`INTERVAL '${days} days'`) — parseInt mitigated but pattern is fragile |
| CQ-18 | Inconsistent error response format across routes (`{error: msg}` vs `{error: error.message}`) |
| CQ-19 | ~18 silent catch blocks that swallow errors completely |
| CQ-20 | `ApiResponse<T>` and `ApiError` types defined but unused by most routes |
| CQ-21 | ESLint config is minimal (only `eslint-config-next` defaults) |

---

## DIMENSION 2: SECURITY (15/100)

### CRITICAL Issues (5)

| ID | File | Line | Issue | Impact |
|----|------|------|-------|--------|
| SEC-1 | `src/lib/tenant.ts` | 121 | **Plaintext password storage/comparison**. Variable named `bcryptMatch` but does `password_hash === password` | All passwords exposed if DB is breached |
| SEC-2 | `src/lib/auth.ts` | 29 | **Hardcoded fallback password** `'[REDACTED]'` if env var unset | Known password grants full access |
| SEC-3 | `src/lib/auth.ts`, `src/middleware.ts`, `src/lib/tenant.ts` | 4, 4, 5 | **Hardcoded JWT secret** `'dev-secret-change-me'` in 3 files | Anyone can forge valid JWTs |
| SEC-4 | `src/app/api/dashboard/route.ts` | 34-40 | **SQL injection** via `from`/`to` query params interpolated into SQL | Full database compromise possible |
| SEC-5 | `.env.local`, `.env.production` | — | **Live secrets in source**: DB credentials, Anthropic API key `sk-ant-api03-...`, weak AUTH_SECRET. **No .gitignore file exists** | Credential exposure |

### HIGH Issues (11)

| ID | File | Issue |
|----|------|-------|
| SEC-6 | `src/lib/auth.ts` | No session invalidation, no logout endpoint. Compromised JWT valid for 7 days |
| SEC-7 | `src/app/api/admin/users/route.ts` | RBAC bypass: legacy mode (`tenant === null`) skips admin check, granting full admin access |
| SEC-8 | `src/app/api/admin/users/route.ts` | GET handler (user list) has NO role check — any user can list all org users |
| SEC-9 | `src/middleware.ts` | Broad public paths: `/api/track/sent`, `/api/track/replies`, `/api/brain/sync`, `/api/chat/prospect` all unauthenticated |
| SEC-10 | `src/app/api/track/replies/route.ts` | Public endpoint creates contacts, changes lead status, triggers AI generation — no auth |
| SEC-11 | `src/app/api/track/sent/route.ts` | Public endpoint modifies data — no auth |
| SEC-12 | `src/app/api/twilio/status/route.ts` | No Twilio signature verification on callback |
| SEC-13 | `src/app/api/chat/prospect/route.ts` | Public AI chat: unbounded input, no rate limiting, triggers expensive Claude API calls |
| SEC-14 | `src/app/api/settings/page.tsx` | 666 | `dangerouslySetInnerHTML` with user-editable signature content (stored XSS) |
| SEC-15 | `src/app/api/settings/webhooks/route.ts` | SSRF: webhook test fetches any user-supplied URL including internal/cloud metadata |
| SEC-16 | Entire codebase | Zero rate limiting on any endpoint |

### MEDIUM Issues (11)

| ID | Issue |
|----|-------|
| SEC-17 | No CSRF protection (state-changing via GET in engagement webhook) |
| SEC-18 | TwiML injection via unescaped `contact.phone` in XML |
| SEC-19 | SMTP password stored/returned in plaintext (not admin-restricted) |
| SEC-20 | Tracking IDs are bare database IDs (enumerable) |
| SEC-21 | Weak webhook key auth with hardcoded fallback `'saleshub-n8n-2026'` |
| SEC-22 | SSL certificate verification disabled (`rejectUnauthorized: false`) on DB |
| SEC-23 | No Content-Security-Policy headers |
| SEC-24 | No X-Frame-Options, X-Content-Type-Options, HSTS headers |
| SEC-25 | No CORS configuration |
| SEC-26 | Error messages leak internal details to clients |
| SEC-27 | Engagement pixel modifies state via GET request |

---

## DIMENSION 3: MULTI-TENANCY & SCALABILITY (10/100)

### CRITICAL Issues

| ID | Issue |
|----|-------|
| MT-1 | **107 of 115 API routes (93%) have NO tenant filtering**. All core data routes (contacts, sequences, tasks, pipeline, brain, campaigns, analytics) query globally with no `org_id` filter |
| MT-2 | **15+ tables missing `org_id` column**: `sequence_steps`, `sequence_enrollments`, `sequence_step_executions`, `calendly_events`, `sms_messages`, `phone_calls`, `saved_segments`, `contact_merges`, `lifecycle_rules`, `deal_attribution`, `performance_goals`, `signup_funnel_events`, `linkedin_profiles`, `linkedin_activity` |
| MT-3 | **Entire `bdr.*` schema has zero org_id columns** (campaigns, leads, email_sends, templates, scraping_jobs) |
| MT-4 | **Entire `brain.*` schema has zero org_id columns** |
| MT-5 | **Synchronous AI generation in HTTP handlers**: bulk-regenerate loops through leads calling Claude sequentially (2-5 min for 20 leads, guaranteed timeout) |
| MT-6 | `org_id` is **NULLABLE** on key tables — new rows without explicit org_id bypass all filters |
| MT-7 | Plaintext passwords (duplicate of SEC-1) |
| MT-8 | Hardcoded secrets (duplicate of SEC-3, SEC-5) |

### HIGH Issues

| ID | Issue |
|----|-------|
| MT-9 | `withTenant()` helper was built but is **never called anywhere** |
| MT-10 | All tenant-aware routes fall back to `org_id = 1` when session lacks tenant info — broken session = access to org 1's data |
| MT-11 | N+1 queries in 8+ routes: contact import (row-by-row INSERT), bulk operations, segment counts, signup conversion |
| MT-12 | Pool size of 10 shared across all tenants. No idle timeout, no connection lifecycle management, no `pool.on('error')` handler |
| MT-13 | **Zero application-level caching** — no Redis, no in-memory cache, no SWR/React Query staleTime. Brain content re-queried on every AI call |
| MT-14 | Contact import processes rows one-by-one (500 rows = 15-30s, 5000 rows = guaranteed timeout) |
| MT-15 | Legacy auth path bypasses multi-tenancy entirely |

### MEDIUM Issues

| ID | Issue |
|----|-------|
| MT-16 | Multiple unbounded SELECTs (no LIMIT on segments, brain content, pipeline, contacts export) |
| MT-17 | Missing composite indexes for `(org_id, ...)` queries |
| MT-18 | No PostgreSQL Row-Level Security policies as defense-in-depth |
| MT-19 | Missing indexes on `task_queue.org_id` and `touchpoints.org_id` |
| MT-20 | `CREATE TABLE IF NOT EXISTS` anti-pattern silently ignores schema drift |

---

## DIMENSION 4: DESIGN & UX (40/100)

### CRITICAL Issues

| ID | Issue |
|----|-------|
| UX-1 | **Zero accessibility**: No `aria-*` attributes, no `role` attributes, no `htmlFor` on labels, no focus management, no screen reader support in entire codebase |
| UX-2 | `focus:outline-none` used 114 times with no visible replacement — keyboard users cannot see focus position |
| UX-3 | **No mobile responsiveness**: Sidebar is fixed `w-64` with no collapse. Layout forces side-by-side at all breakpoints. App is unusable on screens < 768px |
| UX-4 | **No shared component library**: No Button, Input, Modal, Badge, or Table component. Every page reinvents styling with raw Tailwind |
| UX-5 | **No onboarding flow**: New users face empty dashboard with zero guidance |

### HIGH Issues

| ID | Issue |
|----|-------|
| UX-6 | No shared Modal component — 8+ ad-hoc implementations with different backdrop opacity, z-index, close behavior |
| UX-7 | Pipeline Kanban: 6 fixed-width columns (1536px min), no mobile alternative |
| UX-8 | Contacts table: 8 columns, no responsive wrapper, no column hiding on small screens |
| UX-9 | Chat panel: `fixed w-96` covers entire screen on mobile |
| UX-10 | No focus trapping in modals/overlays — keyboard users can tab behind panels |
| UX-11 | No Escape key handling on modals (only 1 of 8+ modals handles Escape) |
| UX-12 | Dashboard sections disappear entirely when empty (no empty state) |
| UX-13 | 10+ page directories lack `loading.tsx` — inconsistent loading experience |
| UX-14 | 17 nav items in sidebar with no progressive disclosure — overwhelming for new users |

### MEDIUM Issues

| ID | Issue |
|----|-------|
| UX-15 | No CSS design tokens/custom properties. Colors hardcoded throughout (`gray-800`, `blue-600`) |
| UX-16 | Inconsistent font sizing: `text-[10px]` (custom) mixed with `text-xs`/`text-sm` with no clear hierarchy |
| UX-17 | Inconsistent loading states: root uses skeleton, sub-pages use spinners |
| UX-18 | Inconsistent empty states: contacts page has a good one, calls page has bare text |
| UX-19 | Toasts have no `aria-live` region — screen readers not notified |
| UX-20 | No Suspense boundaries anywhere |
| UX-21 | Modals and panels appear/disappear instantly — no enter/exit animations |

---

## DIMENSION 5: USEFULNESS & PAIN POINT RESOLUTION (55/100)

### What's Good
- Comprehensive feature set: contacts, sequences, campaigns, pipeline, tasks, calls, analytics, AI generation, brain/knowledge base
- Strong AI integration (Claude-powered email generation, coaching, briefings)
- Email open/click tracking with pixel and link rewriting
- Multi-channel support (email, phone, SMS, LinkedIn)
- Contact deduplication and merge
- Lead scoring and engagement signals

### CRITICAL Issues

| ID | Issue |
|----|-------|
| USE-1 | **Deeply coupled to Shipday**: "Shipday" appears in 30+ source files. AI prompts reference "Shipday", "Mike Paulus", "restaurant delivery", and specific Shipday pricing. The ROI calculator is Shipday-specific. The `shipday` database schema is a separate vertical |
| USE-2 | **Brain/Knowledge Base is Shipday-specific**: All AI context, system prompts, and knowledge base content references Shipday's products, pricing, and value propositions |

### HIGH Issues

| ID | Issue |
|----|-------|
| USE-3 | AI prompts hardcode persona ("You are Mike Paulus, BDR at Shipday") — must be configurable per-tenant |
| USE-4 | Email angles are Shipday-specific: `missed_calls`, `commission_savings`, `delivery_ops`, `tech_consolidation`, `customer_experience` |
| USE-5 | Integration credentials use `process.env` not per-tenant DB config — Settings UI is a facade |
| USE-6 | No CRM integrations (Salesforce, HubSpot, Pipedrive) |
| USE-7 | No email provider integrations (SendGrid, Mailgun, AWS SES) — relies on SMTP only |
| USE-8 | No calendar integrations beyond Calendly event listening |

### MEDIUM Issues

| ID | Issue |
|----|-------|
| USE-9 | `wincall` database name throughout code is Shipday-specific |
| USE-10 | Territory validation uses Shipday's area codes (Georgia territory) |
| USE-11 | No Zapier/webhook marketplace for customer integrations |
| USE-12 | No email template marketplace or pre-built templates for different industries |

---

## DIMENSION 6: RELIABILITY & OBSERVABILITY (10/100)

### CRITICAL Issues

| ID | Issue |
|----|-------|
| REL-1 | **Zero error monitoring** — no Sentry, Datadog, or any APM across 100+ API routes |
| REL-2 | **No health check endpoint** — cannot monitor DB connectivity or service health |
| REL-3 | **Fire-and-forget webhooks**: emails marked "approved" in DB before n8n confirms delivery. If n8n is down, emails recorded as sent but never delivered |
| REL-4 | **No DB reconnection logic**: Two `pg.Pool` instances with no `pool.on('error')` handler. Network blip kills the app |
| REL-5 | **`.env.production` contains live secrets in source** (duplicate of SEC-5) |

### HIGH Issues

| ID | Issue |
|----|-------|
| REL-6 | No timeouts on Anthropic API calls (can hang indefinitely) |
| REL-7 | No timeouts on Twilio API calls |
| REL-8 | No retry logic on any external HTTP call (webhooks, AI, Twilio) |
| REL-9 | Engagement tracking pixel creates duplicate touchpoints on every email open (no idempotency) |
| REL-10 | `engagement_score` incremented without bounds on every open/click |
| REL-11 | Non-transactional delete+insert in campaign draft generation |
| REL-12 | No deployment scripts, no PM2 config, no Dockerfile, no CI/CD |
| REL-13 | No database backup verification scripts |

### MEDIUM Issues

| ID | Issue |
|----|-------|
| REL-14 | No structured logging (console.error only), no correlation IDs for request tracing |
| REL-15 | No rate limiting (duplicate of SEC-16) |
| REL-16 | No database connection timeout or idle timeout configured |

---

## DIMENSION 7: ARCHITECTURE & STRUCTURE (50/100)

### What's Good
- Clean Next.js App Router structure with proper route organization
- Centralized type definitions in `src/lib/types.ts`
- Proper path aliases configured (`@/*`)
- Consistent API route file naming (kebab-case directories)
- `pg` external package config correct for server-side usage

### HIGH Issues

| ID | Issue |
|----|-------|
| ARCH-1 | **5 components over 1,000 lines** each (god components): `outbound/page.tsx` ~1200 lines, `contacts/page.tsx` ~600 lines, `pipeline/page.tsx` ~500 lines, `settings/page.tsx` ~1200 lines, `CampaignEditor.tsx` ~800 lines |
| ARCH-2 | **No shared data fetching pattern**: Raw `fetch()` in `useEffect` everywhere. No SWR, React Query, or standardized fetching hooks. No caching, no revalidation, no optimistic updates |
| ARCH-3 | **No API documentation**: No OpenAPI/Swagger spec for 115 endpoints |
| ARCH-4 | **No shared hooks directory**: Custom hooks are inline in components (fetching, state management). No `src/hooks/` |
| ARCH-5 | **No environment variable validation at startup**: Missing env vars produce runtime errors deep in request handlers instead of failing fast |

### MEDIUM Issues

| ID | Issue |
|----|-------|
| ARCH-6 | Dual database pool strategy (`wincallPool` + `defaultdbPool`) adds complexity — consider consolidating |
| ARCH-7 | No code splitting or lazy loading for large components |
| ARCH-8 | No bundle analysis configured |
| ARCH-9 | Mixed lib file naming: `email-tracking.ts` (kebab) vs `ai.ts` (single word) |
| ARCH-10 | `Providers.tsx` wraps context but there's no state management library — all state is local `useState` |

---

## DIMENSION 8: MICROSAAS READINESS (12/100)

### CRITICAL Issues (22)

| Category | Issue |
|----------|-------|
| **Billing** | No Stripe, no payment processing, no subscription management |
| **Billing** | No usage tracking/metering (per seat, per email, per lead) |
| **Signup** | No registration/signup flow — login is single shared password |
| **Signup** | No email verification |
| **Signup** | No password reset flow |
| **Signup** | No org self-provisioning |
| **Plans** | Zero feature gating — `plan` column exists but never checked |
| **Plans** | No usage limits enforced anywhere |
| **Admin** | No super-admin / platform-level administration |
| **Legal** | No Terms of Service or Privacy Policy |
| **Legal** | No security audit logging |
| **Legal** | No GDPR data deletion / right to be forgotten |
| **Legal** | No compliance framework (SOC 2, GDPR, CCPA) |
| **API** | No customer-facing API (`crm.api_keys` table exists but zero code uses it) |
| **API** | No API documentation |
| **Onboarding** | No post-signup onboarding flow |
| **Ops** | No automated deployment (no Dockerfile, no CI/CD, no PM2 config) |
| **Ops** | No monitoring/alerting |
| **Ops** | No test suite |
| **Ops** | Secrets exposed in env files without .gitignore |
| **Ops** | Plaintext password storage |
| **Tenancy** | 93% of API routes lack tenant isolation |

### HIGH Issues (10)

| Issue |
|-------|
| Multi-tenant login scaffolded but not wired to UI |
| No platform usage metrics dashboard |
| Brand "Shipday" hardcoded in 30+ locations |
| Logo hardcoded to Shipday's CDN URL |
| No custom domain support |
| Integrations use env vars instead of per-tenant DB config |
| Weak/default auth secrets |
| No runbook/operations documentation |
| No database migration tooling |
| RBAC minimal (admin role checked in only 4 of 115 routes) |

---

## PRIORITIZED PUNCH LIST

### Phase 0: Emergency Security Fixes (Do NOW)

| Priority | Task | Est. Hours |
|----------|------|------------|
| P0-1 | Create `.gitignore`, exclude `.env*` files | 0.5 |
| P0-2 | Rotate all secrets: DB password, Anthropic API key, AUTH_SECRET | 1 |
| P0-3 | Remove all hardcoded secret fallbacks from auth.ts, middleware.ts, tenant.ts | 1 |
| P0-4 | Fix SQL injection in dashboard/route.ts (parameterize `from`/`to`) | 1 |
| P0-5 | Install bcryptjs, hash passwords on creation, compare with bcrypt on login | 2 |
| P0-6 | Add try/catch to the 5 core API routes missing error handling | 2 |

### Phase 1: Security Hardening (Week 1)

| Priority | Task | Est. Hours |
|----------|------|------------|
| P1-1 | Add rate limiting middleware (`@upstash/ratelimit` or similar) | 4 |
| P1-2 | Add security headers (CSP, HSTS, X-Frame-Options, etc.) in next.config.ts | 2 |
| P1-3 | Add Twilio signature verification on callback endpoints | 2 |
| P1-4 | Add webhook key verification to `/api/track/sent` and `/api/track/replies` | 2 |
| P1-5 | Implement HMAC-signed tracking tokens (replace bare DB IDs) | 4 |
| P1-6 | Sanitize `dangerouslySetInnerHTML` with DOMPurify for email signatures | 1 |
| P1-7 | Add input validation (Zod) to all POST/PUT endpoints | 8 |
| P1-8 | Narrow public paths list in middleware — require auth on `/api/brain/sync` | 1 |
| P1-9 | Fix RBAC: require tenant non-null AND admin role for admin routes | 2 |
| P1-10 | Add logout endpoint, session cookie clearing | 1 |

### Phase 2: Multi-Tenancy (Weeks 2-3)

| Priority | Task | Est. Hours |
|----------|------|------------|
| P2-1 | Add `org_id` column to all 15+ tables missing it | 4 |
| P2-2 | Make `org_id` NOT NULL on all tenant-scoped tables | 2 |
| P2-3 | Add `org_id` to entire `bdr.*` schema | 4 |
| P2-4 | Add `org_id` to entire `brain.*` schema | 2 |
| P2-5 | Add `WHERE org_id = $N` to all 107 unscoped API routes | 24 |
| P2-6 | Add composite indexes: `(org_id, lifecycle_stage)`, `(org_id, updated_at)`, etc. | 2 |
| P2-7 | Implement PostgreSQL Row-Level Security as defense-in-depth | 4 |
| P2-8 | Remove org_id fallback to 1 — fail closed (401) on missing tenant | 2 |
| P2-9 | Wire login page to `validateUserCredentials()` (email+password auth) | 4 |
| P2-10 | Build signup flow with org creation | 8 |

### Phase 3: Reliability & Observability (Week 3)

| Priority | Task | Est. Hours |
|----------|------|------------|
| P3-1 | Install `@sentry/nextjs` for error tracking | 3 |
| P3-2 | Add `/api/health` endpoint (check both DB pools, external services) | 2 |
| P3-3 | Add `pool.on('error')` handler and connection timeouts to db.ts | 1 |
| P3-4 | Add `AbortController` timeouts to all Anthropic API calls (30s) | 2 |
| P3-5 | Add `AbortController` timeouts to all webhook/Twilio calls (10s) | 2 |
| P3-6 | Fix fire-and-forget webhook pattern — check response before marking sent | 4 |
| P3-7 | Add idempotency to engagement tracking (prevent duplicate touchpoints) | 2 |
| P3-8 | Replace `console.*` with pino structured logging | 6 |
| P3-9 | Add request correlation IDs via middleware | 2 |
| P3-10 | Set up uptime monitoring (UptimeRobot or BetterStack) | 1 |

### Phase 4: Code Quality (Week 4)

| Priority | Task | Est. Hours |
|----------|------|------------|
| P4-1 | Install Vitest, write integration tests for auth, contacts CRUD, sequence enrollment | 12 |
| P4-2 | Adopt migration tool (Drizzle), convert 6 schema files to versioned migrations | 8 |
| P4-3 | Create shared error handling utility for standardized API responses | 4 |
| P4-4 | Move all hardcoded values (emails, URLs, webhook IDs) to centralized config module | 4 |
| P4-5 | Parameterize all remaining INTERVAL interpolation patterns | 3 |
| P4-6 | Set up Prettier + husky + lint-staged for pre-commit enforcement | 2 |
| P4-7 | Move AI generation to background job queue (BullMQ or n8n) | 12 |
| P4-8 | Batch all N+1 query patterns (contact import, segments, bulk ops) | 8 |

### Phase 5: Design & UX (Weeks 5-6)

| Priority | Task | Est. Hours |
|----------|------|------------|
| P5-1 | Create shared components: Button, Input, Modal, Badge, Table, EmptyState | 16 |
| P5-2 | Add mobile sidebar collapse (hamburger menu + drawer pattern) | 6 |
| P5-3 | Add responsive table wrappers + column hiding for mobile | 4 |
| P5-4 | Add ARIA labels, roles, and focus-visible rings throughout | 8 |
| P5-5 | Build first-run onboarding checklist on dashboard | 8 |
| P5-6 | Add focus trapping + Escape key handling to all modals | 4 |
| P5-7 | Standardize loading states (skeletons matching each page's layout) | 4 |
| P5-8 | Add CSS design tokens / theme configuration | 4 |

### Phase 6: Generalization & De-Shipdaying (Weeks 6-7)

| Priority | Task | Est. Hours |
|----------|------|------------|
| P6-1 | Make AI prompts tenant-configurable (company name, persona, value props stored per org) | 8 |
| P6-2 | Replace all hardcoded "Shipday" references with dynamic org name | 4 |
| P6-3 | Make email angles configurable per campaign (not hardcoded to delivery industry) | 6 |
| P6-4 | Move integration credentials from `process.env` to per-org database lookups | 8 |
| P6-5 | Generalize territory validation (remove hardcoded Georgia area codes) | 2 |
| P6-6 | Remove Shipday-specific ROI calculator or make it a plugin | 2 |
| P6-7 | Rename `wincall` database references to neutral name | 2 |

### Phase 7: MicroSaaS Infrastructure (Weeks 7-10)

| Priority | Task | Est. Hours |
|----------|------|------------|
| P7-1 | Stripe integration: plans, checkout, webhooks, customer portal | 20 |
| P7-2 | Usage metering middleware (contacts, emails, AI tokens per org) | 8 |
| P7-3 | Plan enforcement middleware (check limits before resource creation) | 6 |
| P7-4 | Build email verification and password reset flows | 8 |
| P7-5 | Build super-admin dashboard (all tenants, usage, billing) | 12 |
| P7-6 | Build customer API with API key auth (wire up `crm.api_keys`) | 8 |
| P7-7 | Generate OpenAPI/Swagger documentation | 6 |
| P7-8 | Create Terms of Service and Privacy Policy pages | 4 |
| P7-9 | Build security audit logging for all state-changing operations | 8 |
| P7-10 | Build GDPR data export/deletion endpoint | 6 |
| P7-11 | Create Dockerfile + CI/CD pipeline (GitHub Actions) | 8 |
| P7-12 | White-labeling: dynamic branding from org settings | 8 |

---

## TOTAL ESTIMATED EFFORT

| Phase | Scope | Hours | Calendar |
|-------|-------|-------|----------|
| Phase 0 | Emergency Security | 7.5 | Day 1 |
| Phase 1 | Security Hardening | 27 | Week 1 |
| Phase 2 | Multi-Tenancy | 56 | Weeks 2-3 |
| Phase 3 | Reliability | 25 | Week 3 |
| Phase 4 | Code Quality | 53 | Week 4 |
| Phase 5 | Design & UX | 54 | Weeks 5-6 |
| Phase 6 | Generalization | 32 | Weeks 6-7 |
| Phase 7 | MicroSaaS Infra | 102 | Weeks 7-10 |
| **Total** | | **~357 hours** | **~10 weeks** |

---

## BOTTOM LINE

SalesHub has impressive feature breadth for a single-tenant tool built by one person. The AI integration, multi-channel outreach, and email tracking are genuinely differentiated. However, the gap between "works for Mike" and "safe for paying customers" is significant.

**The three hardest problems to solve are:**
1. **Multi-tenancy** (107 routes to scope, 15+ tables to modify, RLS to implement)
2. **Security** (5 critical vulnerabilities that would be immediate deal-breakers for any security-conscious customer)
3. **Billing infrastructure** (Stripe integration, usage metering, plan enforcement from scratch)

**The highest ROI quick wins are:**
1. Fix the 5 critical security issues (Phase 0) — 7.5 hours, eliminates existential risk
2. Add Sentry + health check + DB timeouts (Phase 3) — 6 hours, gives you production visibility
3. Create shared UI components (Phase 5) — 16 hours, eliminates 50% of design inconsistency

**Would I trust this with a paying customer's data today?** No. After Phases 0-3 (~115 hours of work), yes — with appropriate beta disclaimers.

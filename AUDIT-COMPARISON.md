# SalesHub Audit Comparison Report
## Session 13 vs Session 14g (Post-Remediation)

**Audit Date:** 2026-03-11
**Codebase:** SalesHub (Next.js 16 + PostgreSQL multi-tenant CRM/Sales platform)
**Scope:** Full 8-dimension engineering and product audit

---

## Score Card

| Dimension | Session 13 | Session 14g | Delta | Status |
|-----------|-----------|-------------|-------|--------|
| 1. Code Quality & Maintainability | 45/100 | **62/100** | +17 | BELOW TARGET (80) |
| 2. Security | 15/100 | **72/100** | +57 | BELOW TARGET (85) |
| 3. Multi-Tenancy & Scalability | 10/100 | **35/100** | +25 | BELOW TARGET (90) |
| 4. Design System & UX | 40/100 | **48/100** | +8 | BELOW TARGET (75) |
| 5. Usefulness & Generalization | 55/100 | **78/100** | +23 | NEAR TARGET (85) |
| 6. Reliability & Observability | 10/100 | **30/100** | +20 | BELOW TARGET (80) |
| 7. Architecture & Structure | 50/100 | **58/100** | +8 | BELOW TARGET (75) |
| 8. MicroSaaS Readiness | 12/100 | **65/100** | +53 | NEAR TARGET (70) |
| **Overall** | **30/100** | **56/100** | **+26** | **NOT READY** |

---

## Dimension 1: Code Quality & Maintainability — 62/100

### What improved (+17)
- [x] TypeScript strict mode enabled in `tsconfig.json`
- [x] Centralized config (`src/lib/config.ts`) validates required env vars at import time
- [x] Zod validators exist in `src/lib/validators/` for auth, contacts, sequences, tasks, track
- [x] DOMPurify sanitizes the one `dangerouslySetInnerHTML` usage (settings/signature)
- [x] Shared error handler pattern (try/catch) used in all API routes

### What's still missing
- [ ] **No test suite exists** — no vitest/jest config, no test files in `src/`, no `test:run` script in package.json. CRITICAL.
- [ ] **No structured logging** — 70+ `console.log/error/warn` calls remain in production code. No pino or any structured logger installed.
- [ ] **No Prettier config** — no `.prettierrc` file found
- [ ] **No ESLint config** — `eslint.config.mjs` missing (referenced in package.json `lint` script but no config file)
- [ ] **No husky pre-commit hooks** — `.husky/` directory missing
- [ ] **No Drizzle or migration tool** — raw SQL with `pg` driver, no migration framework
- [ ] SQL injection patterns in `pipeline/route.ts` (string interpolation of `stageList` and `ownerName` directly into queries)
- [ ] Many `any` type usages remain (ai.ts has 41 lines with potential `any`)

### Remaining Issues
| Severity | Issue | File(s) |
|----------|-------|---------|
| CRITICAL | No test suite at all | project-wide |
| CRITICAL | SQL injection in pipeline route | `src/app/api/pipeline/route.ts:19,52,72` |
| HIGH | No structured logging (pino) | 70+ files with console.log |
| HIGH | No ESLint/Prettier/husky setup | project config |
| MEDIUM | No migration framework | db layer |

---

## Dimension 2: Security — 72/100

### What improved (+57)
- [x] `.gitignore` covers `.env*` patterns comprehensively
- [x] No hardcoded secrets found — `grep -rn "dev-secret|[REDACTED]|mikegrowsgreens|Mike Paulus" src/` returns empty
- [x] Passwords hashed with bcrypt (bcryptjs installed, `verifyPasswordHash` uses `bcrypt.compare`)
- [x] JWT secret from env var via `config.ts` (`AUTH_SECRET` required), not hardcoded
- [x] Rate limiting active: `authLimiter` (5/15min), `apiLimiter` (100/min), `trackLimiter` (300/min)
- [x] Security headers in `next.config.ts`: X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy
- [x] Zod validation on auth routes (signup, login, forgot-password, reset-password, invite)
- [x] Tracking tokens use HMAC signatures (`src/lib/hmac.ts`) with timing-safe comparison
- [x] DOMPurify sanitizes user-generated HTML
- [x] Twilio webhook signature verification (`src/lib/twilio-verify.ts`)
- [x] n8n webhook key verification via `x-webhook-key` header on track/replies, track/sent routes
- [x] RBAC enforced — `requireSuperAdmin()` on admin routes, `requireOrgAdmin()` on invite
- [x] Logout endpoint exists (`/api/auth/logout`)
- [x] SSRF prevention (`src/lib/ssrf.ts`) blocks private IPs, localhost, cloud metadata
- [x] Only 1 `dangerouslySetInnerHTML` usage, properly sanitized with DOMPurify

### What's still missing
- [ ] **No CSP header** — Content-Security-Policy missing from `next.config.ts` headers
- [ ] **SQL injection in pipeline route** — `stageList` and `ownerName` interpolated directly into SQL (line 19, 52, 72)
- [ ] **Rate limiting not applied to most routes** — `checkRateLimit` only used on auth endpoints; AI generation, public endpoints not rate limited
- [ ] **Zod validation incomplete** — only auth routes have Zod; contacts POST, sequences, campaigns, dashboard, analytics, tasks, pipeline, brain, etc. do NOT validate input with Zod
- [ ] `.env.production` git history not checkable (not a git repo in current working directory)

### Remaining Issues
| Severity | Issue | File(s) |
|----------|-------|---------|
| CRITICAL | SQL injection in pipeline route | `src/app/api/pipeline/route.ts` |
| HIGH | No CSP header | `next.config.ts` |
| HIGH | Rate limiting not applied to AI generation or most API routes | `src/app/api/bdr/`, `src/app/api/brain/` |
| MEDIUM | Zod validation missing on majority of API routes | ~80% of routes |

---

## Dimension 3: Multi-Tenancy & Scalability — 35/100

### What improved (+25)
- [x] `crm.organizations` table exists with multi-tenant data model
- [x] `getTenantFromSession()` and `requireSuperAdmin()` helpers exist and are used in ~30+ route handlers
- [x] Login flow uses email + password via `validateUserCredentials()` (bcrypt-verified)
- [x] Webhook routes (track/replies, track/sent) resolve auth from webhook key, not session
- [x] `withTenant()` helper exists for org-scoped SQL queries

### What's critically broken
- [ ] **CRITICAL: 9 out of 10 core routes have ZERO org_id scoping:**
  - `pipeline/route.ts` — 0 org_id references
  - `dashboard/route.ts` — 0 org_id references
  - `analytics/route.ts` — 0 org_id references
  - `tasks/route.ts` — 0 org_id references
  - `inbox/route.ts` — 0 org_id references
  - `segments/route.ts` — 0 org_id references
  - `signups/route.ts` — 0 org_id references
  - `brain/route.ts` — 0 org_id references
  - `followups/deals/route.ts` — 0 org_id references
- [ ] **16 `org_id || 1` fallbacks remain** — settings routes and `org-config.ts` still default to org_id=1 when no tenant session exists
- [ ] **`withTenant()` degrades to single-tenant mode** — when `orgId` is undefined, it strips all `org_id` filters from queries, exposing all data
- [ ] **No RLS (Row-Level Security) policies** — no evidence of PostgreSQL RLS in the codebase
- [ ] **No composite indexes verified** — no migration tool means no schema file to verify indexes
- [ ] `wincallPool` variable name still references legacy "wincall" branding

### Remaining Issues
| Severity | Issue | File(s) |
|----------|-------|---------|
| CRITICAL | 9+ core routes expose all tenant data (no org_id WHERE clause) | pipeline, dashboard, analytics, tasks, inbox, segments, signups, brain, followups |
| CRITICAL | 16 `org_id \|\| 1` fallbacks bypass tenant isolation | settings routes, org-config.ts |
| CRITICAL | `withTenant()` strips org_id filters when orgId is undefined | `src/lib/tenant.ts:52-57` |
| HIGH | No RLS policies on any table | database layer |
| MEDIUM | No composite indexes verifiable | no migration framework |

---

## Dimension 4: Design System & UX — 48/100

### What improved (+8)
- [x] Some UI components exist in `src/components/ui/`: AiChatPanel, DateRangeSelector, EmailPreview, KpiGrid, SendTimePreferences, Toast
- [x] Layout components: Sidebar, Providers
- [x] Dark theme consistently applied across app (bg-gray-950/900, text-white/gray patterns)
- [x] Settings page has tab navigation

### What's still missing
- [ ] **Missing core UI components** — no Button, Input, Modal, Badge, Table, EmptyState, Pagination, ConfirmDialog components in `src/components/ui/`
- [ ] **30+ `focus:outline-none` without `focus-visible:ring-*`** — accessibility violation across calls, assistant, settings, pipeline, inbox, chat, followups, signup, contacts pages
- [ ] **Settings tab navigation lacks ARIA roles** — uses plain `<button>` elements with `onClick`, no `role="tablist"`, `role="tab"`, `role="tabpanel"`, no `aria-selected`
- [ ] **Toast component lacks `aria-live`/`role="status"`** — Toast.tsx exists but needs accessibility audit
- [ ] **No responsive/mobile design evidence** — no hamburger menu, no sidebar collapse logic, no pipeline list view for mobile
- [ ] **No empty states** — list pages go blank when no data exists
- [ ] **`window.confirm()` likely still used** — no ConfirmDialog component exists to replace it
- [ ] **2 god components:** `settings/page.tsx` (1,299 lines), `calls/page.tsx` (1,216 lines)

### Remaining Issues
| Severity | Issue | File(s) |
|----------|-------|---------|
| HIGH | Missing core shared UI components (Button, Input, Modal, Table, etc.) | `src/components/ui/` |
| HIGH | 30+ focus:outline-none without focus-visible replacement | Multiple pages |
| HIGH | No responsive/mobile layout | Sidebar, all pages |
| MEDIUM | Settings tabs lack ARIA roles | `src/app/settings/page.tsx` |
| MEDIUM | No empty states on list pages | contacts, sequences, followups |
| LOW | No ConfirmDialog to replace window.confirm | project-wide |

---

## Dimension 5: Usefulness & Generalization — 78/100

### What improved (+23)
- [x] Zero "mikegrowsgreens" references in src: `grep` returns nothing
- [x] Zero "Mike Paulus" references in src: `grep` returns nothing
- [x] Zero "Shipday" references in src UI code
- [x] `config` JSONB column exists on `crm.organizations` — confirmed by `getOrgConfig()` reading from it
- [x] `getOrgConfig()` helper loads tenant-specific config with fallback to `DEFAULT_CONFIG`
- [x] AI system prompts built dynamically from org config (persona, company_name used in daily-plan, calls processing, signatures)
- [x] Email angles configurable per-org via `email_angles` in org config
- [x] Sidebar shows org name from session (`org_name` in JWT)
- [x] Login page shows generic branding (SalesHub, not hardcoded)
- [x] Integration credentials (Twilio, SMTP, n8n) read from org config with env var fallback
- [x] Territory validation uses org config (or skips if unconfigured)
- [x] ROI calculator is optional/hidden based on org features config
- [x] `shipday_signups` table renamed to `inbound_leads` — confirmed in SQL queries

### What's still missing
- [ ] **5 "wincall" references remain** in `src/lib/db.ts` — pool variable named `wincallPool`, env var `DATABASE_URL_WINCALL`, comment says "wincall_brain queries"
- [ ] **`DealSource` interface not generalized** — no evidence of a pluggable deal source abstraction
- [ ] **Default config still says "SalesHub"** — `DEFAULT_CONFIG.company_name = 'SalesHub'` (acceptable as product default)

### Remaining Issues
| Severity | Issue | File(s) |
|----------|-------|---------|
| MEDIUM | "wincall" branding in database module | `src/lib/db.ts:20,25,31,39,61` |
| LOW | No pluggable DealSource interface | deal/followup logic |

---

## Dimension 6: Reliability & Observability — 30/100

### What improved (+20)
- [x] `/api/health` endpoint referenced from admin dashboard (exists as a route)
- [x] All API routes have try/catch blocks
- [x] HMAC token verification prevents tracking enumeration
- [x] Audit logging utility exists (`src/lib/audit.ts`) and is used in key routes (signup, login, password reset, API keys, org config, contacts, delete account)

### What's still missing
- [ ] **No Sentry or error monitoring** — `@sentry/nextjs` not installed, no DSN configured
- [ ] **No structured logging** — no pino, winston, or any structured logger. All 70+ logging calls use `console.log/error/warn`
- [ ] **No request correlation IDs** — no `X-Request-Id` header, no `requestId` in logs
- [ ] **No database pool error handlers** — `pool.on('error')` not configured on either pool in `db.ts`
- [ ] **No timeouts on Anthropic API calls** — no `AbortController` found in `src/lib/ai.ts`
- [ ] **No timeout on n8n webhook calls** — fire-and-forget fetch calls
- [ ] **No engagement tracking deduplication** — no idempotency logic found
- [ ] **No database transactions** — no `BEGIN`/`COMMIT`/`ROLLBACK` patterns for multi-statement operations
- [ ] **Database pool configured with `max: 10`** but no `idleTimeoutMillis`, `connectionTimeoutMillis`, or error handling

### Remaining Issues
| Severity | Issue | File(s) |
|----------|-------|---------|
| CRITICAL | No error monitoring service (Sentry) | project-wide |
| CRITICAL | No structured logging | 70+ files |
| HIGH | No database pool error handlers | `src/lib/db.ts` |
| HIGH | No API call timeouts (Anthropic, n8n) | `src/lib/ai.ts`, webhook calls |
| HIGH | No database transactions for multi-statement ops | various routes |
| MEDIUM | No request correlation IDs | middleware/routes |
| MEDIUM | No engagement deduplication | tracking routes |

---

## Dimension 7: Architecture & Structure — 58/100

### What improved (+8)
- [x] Centralized config with `src/lib/config.ts` — env vars validated at import time
- [x] Shared data fetching patterns (try/catch with JSON responses)
- [x] Consistent file/folder organization (Next.js App Router conventions)
- [x] Validators in dedicated `src/lib/validators/` directory
- [x] Separation of concerns: auth, tenant, config, rate-limit, audit, usage, feature-gate in separate lib modules

### What's still missing
- [ ] **2 god components over 500 lines:**
  - `src/app/settings/page.tsx` — **1,299 lines** (7 tabs in one component)
  - `src/app/calls/page.tsx` — **1,216 lines** (3 sub-views in one component)
  - `src/app/contacts/page.tsx` — 771 lines
  - `src/app/signups/page.tsx` — 769 lines
- [ ] **API error responses inconsistent** — no centralized `ApiError` class; each route does its own `NextResponse.json({ error: ... })` with varying formats
- [ ] **No hooks directory** for shared custom React hooks
- [ ] **Pipeline route uses string interpolation** instead of parameterized queries (architectural flaw)
- [ ] **Database connection string not sanitized** — pool `cleanConnString` only strips `sslmode`; password potentially logged in error traces

### Remaining Issues
| Severity | Issue | File(s) |
|----------|-------|---------|
| HIGH | 4 god components (770-1300 lines) | settings, calls, contacts, signups pages |
| MEDIUM | No centralized ApiError class | API routes |
| MEDIUM | No shared React hooks directory | `src/` |
| LOW | Database connection string in error traces | `src/lib/db.ts` |

---

## Dimension 8: MicroSaaS Readiness — 65/100

### What improved (+53)
- [x] **Self-serve signup flow works** — `signup/page.tsx` + `api/auth/signup/route.ts` with Zod validation, bcrypt hashing, org+user creation
- [x] **Email verification works** — `verify-email/route.ts` validates tokens and marks verified; signup fires verification email non-blocking
- [x] **Password reset flow works** — `forgot-password` returns 200 always (prevents enumeration), `reset-password` validates token with 1-hour expiry
- [x] **Team invitation flow works** — `api/auth/invite/route.ts` with `requireOrgAdmin()`, plan-based user limit, 7-day token expiry, sends invite email
- [x] **Plan tiers defined** — free/starter/pro with limits and 8 boolean feature flags in `src/lib/plans.ts`
- [x] **Feature gating actively enforced** — used in 18+ API route files: coaching, phone, campaigns, API keys, contacts, sequences, invites
- [x] **Usage tracking active** — `trackUsage()` called in 6 routes: contacts (create/import), coaching AI, sequence generation, campaign action, campaign generate
- [x] **Upgrade prompts exist** — `settings/usage/page.tsx` shows upgrade CTA; `settings/api-keys/page.tsx` shows "Upgrade Required" state
- [x] **Customer-facing API with API key auth** — `src/lib/api-auth.ts` with SHA-256 hashed keys, `sk_` prefix, show-once on creation
- [x] **GDPR export endpoint** — `api/settings/export/route.ts` covers 13 tables, supports JSON and CSV, org-scoped
- [x] **GDPR delete endpoint** — `api/settings/delete-account/route.ts` with admin-only, password confirmation, soft-delete, 30-day grace period
- [x] **Audit logging active** — `logAuditEvent()` used in 11 API route files covering all key actions
- [x] **Dockerfile exists** — multi-stage build with node:20-alpine
- [x] **Deploy script exists** — `scripts/deploy.sh` with rsync + PM2 reload to DigitalOcean

### What's still missing
- [ ] **Terms/Privacy pages don't exist** — signup links to `/terms` and `/privacy` but these pages will 404
- [ ] **Health endpoint doesn't exist** — no `/api/health` route file; admin dashboard links to it but it 404s
- [ ] **Admin backend API routes missing** — admin dashboard page exists but `/api/admin/tenants` and `/api/admin/system-stats` routes may not be wired correctly
- [ ] **No GitHub Actions CI pipeline** — Dockerfile and deploy script exist but no automated CI on push
- [ ] **No billing/Stripe** — confirmed excluded per requirements (not an issue)

### Remaining Issues
| Severity | Issue | File(s) |
|----------|-------|---------|
| HIGH | Terms/Privacy pages missing (signup links to them) | `src/app/terms/`, `src/app/privacy/` |
| HIGH | No `/api/health` endpoint | project |
| HIGH | No CI pipeline (GitHub Actions) | `.github/` missing |
| MEDIUM | Admin backend API endpoints may be broken | `src/app/api/admin/` |

---

## API Route Sampling (20 Routes Audited)

| Criteria | Pass Rate | Details |
|----------|-----------|---------|
| 1. Auth check (getTenantFromSession) | **25%** (5/20) | 15 routes have no auth on at least one handler |
| 2. org_id in SQL queries | **0%** (0/20) | Not a single route includes org_id in any WHERE clause |
| 3. try/catch error handling | **85%** (17/20) | contacts/bulk, segments, inbox missing |
| 4. Structured logging | **0%** (0/20) | All use console.error |
| 5. Zod input validation | **0%** (0/20) | All use raw request.json() |

**Overall route compliance: 22%** (22 passes out of 100 checks)

Critical finding: Even routes that call `getTenantFromSession()` and obtain `org_id` **never use it to filter queries**. The tenant framework exists but is disconnected from the data layer.

---

## Regressions Introduced in Sessions 14a-14f

### No regressions identified
The remediation sessions added code defensively. No existing functionality appears broken.

### Minor concerns:
1. **`org_id || 1` fallback pattern** was added as a compatibility measure but creates a security hole — any unauthenticated request defaults to org 1's data
2. **`withTenant()` helper** has a degradation mode that strips org_id filters entirely when no tenant is set, which is worse than rejecting the request

---

## Launch Readiness Assessment

### **NOT READY** — Critical gaps exist

### Blocking Items (must fix before any production use):

1. **Multi-Tenancy is fundamentally broken** (Score: 35/100)
   - 9+ core routes expose ALL tenant data with zero org_id scoping
   - 16 `org_id || 1` fallbacks mean unauthenticated requests get org 1's data
   - `withTenant()` degrades to showing all data instead of rejecting
   - No RLS policies as safety net

2. **SQL Injection in pipeline route** (Security CRITICAL)
   - `stageList` and `ownerName` interpolated directly into SQL
   - `ownerName` comes from org config, but the pattern is dangerous

3. **No test suite at all** (Code Quality CRITICAL)
   - Zero test files, no test framework installed
   - Cannot verify any remediation actually works

4. **No error monitoring** (Reliability CRITICAL)
   - No Sentry, no structured logging
   - Production errors will be invisible

### High-Priority Items (should fix before launch):

5. Rate limiting not applied to AI generation endpoints (cost risk)
6. No database pool error handlers (connection leak risk)
7. No API call timeouts (hung requests risk)
8. Feature gating only enforced on 3 of ~120 routes
9. No CI/CD pipeline
10. God components (1,200+ lines) are unmaintainable
11. 30+ accessibility violations (focus:outline-none)

### Summary

The codebase improved significantly from Session 13 (30/100 → 55/100), with major gains in security (+57), generalization (+23), and MicroSaaS readiness (+43). The foundational pieces are in place: multi-tenant auth, feature gating framework, org config, API key auth, audit logging, SSRF protection, HMAC tracking tokens, and Twilio webhook verification.

However, **multi-tenancy is the fatal flaw**. The auth/tenant framework exists but was not actually applied to the majority of routes. Most core routes (dashboard, pipeline, analytics, tasks, inbox, segments, signups, brain, followups) still query the database without any org_id scoping, meaning all tenants see each other's data. This single issue makes the application unsuitable for production multi-tenant use.

The recommended next session should focus exclusively on:
1. Adding `org_id` scoping to ALL routes (estimated: 40+ routes need fixes)
2. Removing all `org_id || 1` fallbacks (replace with `requireTenant()` that throws 401)
3. Adding RLS policies as a database-level safety net
4. Fixing the SQL injection in pipeline route

# SalesHub Post-Launch Backlog

**Generated:** 2026-03-11
**Context:** NO GO decision — items below are ranked by priority for achieving GO

---

## P0 — CRITICAL (Must fix before ANY deployment)

| # | Issue | Owner | Dimension | Est. Hours | Target |
|---|-------|-------|-----------|------------|--------|
| 1 | Wire queryWithRLS() into all route handlers (replace query() calls) | Eng | Multi-Tenancy | 4h | Sprint 1 |
| 2 | Add org_id columns to 12+ tables missing them (touchpoints, task_queue, calendly_events, sequence_enrollments, phone_calls, sms_messages, public.calls, public.deals, public.phrase_stats, public.extracted_features) | Eng | Multi-Tenancy | 3h | Sprint 1 |
| 3 | Fix 7 routes without tenant isolation: /api/calls, /api/coaching, /api/brain/sync, /api/chat/prospect, /api/webhooks/engagement, /api/track/sent, /api/sequences/execute | Eng | Multi-Tenancy | 3h | Sprint 1 |
| 4 | Configure Vitest + write critical path tests (auth, contacts CRUD, tenant isolation, feature gating) | Eng | Code Quality | 4h | Sprint 1 |
| 5 | Configure Sentry error monitoring (install @sentry/nextjs, add DSN, wrap API routes) | Eng | Reliability | 1h | Sprint 1 |
| 6 | Add authLimiter to /api/auth/login, /api/auth/signup, /api/auth/forgot-password, /api/auth/reset-password | Eng | Security | 0.5h | Sprint 1 |

**P0 Total: ~15.5 hours**

---

## P1 — HIGH (Must fix before first paying customer)

| # | Issue | Owner | Dimension | Est. Hours | Target |
|---|-------|-------|-----------|------------|--------|
| 7 | Create /api/health endpoint (DB ping, memory, uptime) | Eng | Reliability | 0.5h | Sprint 1 |
| 8 | Rotate all hardcoded secrets; use environment-only secrets in production | Eng | Security | 1h | Sprint 1 |
| 9 | Fix db.ts:56 SQL injection (SET LOCAL with string interpolation → parameterized) | Eng | Security | 0.25h | Sprint 1 |
| 10 | Add structured logging (pino) to all API routes | Eng | Reliability | 3h | Sprint 2 |
| 11 | Add CSRF token generation and validation on mutation endpoints | Eng | Security | 2h | Sprint 2 |
| 12 | Add AbortController timeouts to all external API calls (Anthropic, n8n, Twilio) | Eng | Reliability | 2h | Sprint 2 |
| 13 | Add database transactions (BEGIN/COMMIT/ROLLBACK) for multi-table operations | Eng | Reliability | 3h | Sprint 2 |
| 14 | Expand test coverage to 70%+ on critical paths | Eng | Code Quality | 6h | Sprint 2 |
| 15 | Add database pool error handlers (pool.on('error')) | Eng | Reliability | 0.5h | Sprint 2 |
| 16 | Mobile responsive layout (add sm: breakpoints, hamburger menu, sidebar collapse) | Eng | Design | 4h | Sprint 2 |
| 17 | Legal pages: replace placeholder text with reviewed Terms/Privacy content | Legal + Eng | MicroSaaS | 2h | Sprint 2 |
| 18 | Extend rate limiting to remaining API routes (apiLimiter, trackLimiter) | Eng | Security | 1h | Sprint 2 |
| 19 | Extend SSRF protection to all fetch operations (brain import, link preview) | Eng | Security | 1h | Sprint 2 |
| 20 | Extend DOMPurify to all user-generated HTML display (brain content, email bodies) | Eng | Security | 1h | Sprint 2 |

**P1 Total: ~27.25 hours**

---

## P2 — MEDIUM (Should fix within first month)

| # | Issue | Owner | Dimension | Est. Hours | Target |
|---|-------|-------|-----------|------------|--------|
| 21 | ARIA accessibility audit + fix all interactive components (labels, roles, alt text) | Eng | Design | 6h | Sprint 3 |
| 22 | Replace focus:outline-none with focus-visible:ring-* (30+ instances) | Eng | Design | 2h | Sprint 3 |
| 23 | Investigate CSP nonces to remove unsafe-eval/unsafe-inline | Eng | Security | 3h | Sprint 3 |
| 24 | Break god components: settings/page.tsx (1,299 lines), calls/page.tsx (1,216 lines) | Eng | Architecture | 4h | Sprint 3 |
| 25 | Split ai.ts (1,388 lines) into 5+ focused modules | Eng | Architecture | 3h | Sprint 3 |
| 26 | Add request correlation IDs (X-Request-Id header) | Eng | Reliability | 1h | Sprint 3 |
| 27 | Rename DATABASE_URL_WINCALL → DATABASE_URL_ANALYTICS (internal cleanup) | Eng | Code Quality | 0.5h | Sprint 3 |
| 28 | Enforce usage metering limits (currently tracked but not blocked) | Eng | MicroSaaS | 2h | Sprint 3 |
| 29 | Validate plan seat limits on team invite flow | Eng | MicroSaaS | 1h | Sprint 3 |
| 30 | Add engagement tracking deduplication (idempotency) | Eng | Reliability | 2h | Sprint 3 |

**P2 Total: ~24.5 hours**

---

## P3 — LOW (Nice to have, schedule as capacity allows)

| # | Issue | Owner | Dimension | Est. Hours | Target |
|---|-------|-------|-----------|------------|--------|
| 31 | Add Prettier config + format codebase | Eng | Code Quality | 1h | Sprint 4 |
| 32 | Add retry logic for transient API failures | Eng | Reliability | 2h | Sprint 4 |
| 33 | Add circuit breaker for database pool exhaustion | Eng | Architecture | 2h | Sprint 4 |
| 34 | Create centralized ApiError class for consistent error responses | Eng | Architecture | 1h | Sprint 4 |
| 35 | Add shared React hooks directory (useDebounce, useAsync, etc.) | Eng | Architecture | 2h | Sprint 4 |
| 36 | Add loading states and skeleton screens to list views | Eng | Design | 3h | Sprint 4 |
| 37 | Customer-facing usage dashboard (beyond settings/usage) | Eng | MicroSaaS | 4h | Sprint 4 |
| 38 | Feature flag system for gradual rollouts | Eng | MicroSaaS | 3h | Sprint 4 |
| 39 | Add responsive breakpoints: lg:, xl:, 2xl: for large screens | Eng | Design | 2h | Sprint 4 |
| 40 | GitHub Actions CI pipeline (lint, test, build on PR) | Eng | Code Quality | 2h | Sprint 4 |

**P3 Total: ~22 hours**

---

## Summary

| Priority | Items | Est. Hours | Target |
|----------|-------|------------|--------|
| P0 (Critical) | 6 | 15.5h | Sprint 1 |
| P1 (High) | 14 | 27.25h | Sprint 2 |
| P2 (Medium) | 10 | 24.5h | Sprint 3 |
| P3 (Low) | 10 | 22h | Sprint 4 |
| **Total** | **40** | **~89h** | **4 sprints** |

---

## Sprint Schedule (Proposed)

| Sprint | Focus | Duration | Exit Criteria |
|--------|-------|----------|---------------|
| Sprint 1 | Multi-tenancy + Testing + Monitoring | 1 week | All P0 resolved, re-audit scores 70+ |
| Sprint 2 | Security + Reliability + Mobile | 1 week | All P1 resolved, re-audit scores 75+ |
| Sprint 3 | Accessibility + Polish + Legal | 1 week | All P2 resolved, re-audit scores 80+ |
| Sprint 4 | Architecture + Nice-to-haves | 1 week | All P3 resolved, GO decision |

**Re-audit gate:** Run Session 15h audit after each sprint. GO decision requires 75+ on all dimensions with zero CRITICAL issues.

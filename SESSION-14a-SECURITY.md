# Session 14a: Emergency Security Fixes + Hardening

**Prerequisite:** Session 13 audit complete (AUDIT-REPORT.md)
**Scope:** Phase 0 + Phase 1 from audit punch list
**Goal:** Eliminate all 5 CRITICAL and 11 HIGH security vulnerabilities
**Rule:** Do NOT deploy. Commit all changes for review.

---

## Phase 0: Emergency Fixes (Do First)

### P0-1: Create .gitignore
- Add `.gitignore` excluding `.env*`, `node_modules/`, `.next/`, `*.log`
- Verify `.env.local` and `.env.production` are not tracked

### P0-2: Remove All Hardcoded Secret Fallbacks
**Files to modify:**
- `src/lib/auth.ts` line 4 — remove `|| 'dev-secret-change-me'` fallback for JWT secret
- `src/lib/auth.ts` line 29 — remove `|| '[REDACTED]'` fallback password
- `src/lib/tenant.ts` line 5 — remove `|| 'dev-secret-change-me'` fallback
- `src/middleware.ts` line 4 — remove `|| 'dev-secret-change-me'` fallback
- `src/app/api/sequences/execute/route.ts` line 22 — remove `|| 'saleshub-n8n-2026'` fallback
- `src/app/api/bdr/campaigns/process-scheduled/route.ts` line 62 — remove `|| 'saleshub-n8n-2026'` fallback

**Pattern:** Centralize secrets into a single `src/lib/config.ts` module that reads env vars and throws at import time if any are missing. Import from there everywhere.

```typescript
// src/lib/config.ts
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const AUTH_SECRET = requireEnv('AUTH_SECRET');
export const DASHBOARD_PASSWORD = requireEnv('DASHBOARD_PASSWORD');
export const WEBHOOK_KEY = requireEnv('WEBHOOK_KEY');
export const N8N_BASE_URL = requireEnv('N8N_BASE_URL');
export const TRACKING_BASE_URL = requireEnv('TRACKING_BASE_URL');
// ... etc
```

### P0-3: Fix SQL Injection in Dashboard
**File:** `src/app/api/dashboard/route.ts` lines 34-40
- Replace string interpolation of `from` and `to` query params with parameterized queries (`$1`, `$2`)
- Also fix `src/app/api/bdr/tracker/route.ts` lines 19-20 (same pattern)

### P0-4: Install bcryptjs and Hash Passwords
- `npm install bcryptjs @types/bcryptjs`
- **`src/lib/tenant.ts` line 121:** Replace `user.password_hash === password` with `await bcrypt.compare(password, user.password_hash)`
- **`src/app/api/admin/users/route.ts` lines 61-65:** Hash password on user creation with `await bcrypt.hash(password, 12)`
- Write a one-time migration script to hash existing plaintext passwords in `crm.users`

### P0-5: Add try/catch to Unprotected API Routes
Add try/catch with standardized error responses to:
- `src/app/api/auth/route.ts` (POST handler)
- `src/app/api/contacts/route.ts` (GET and POST handlers)
- `src/app/api/contacts/[id]/route.ts` (GET and PATCH handlers)
- `src/app/api/tasks/route.ts` (GET and PATCH handlers)
- `src/app/api/sequences/route.ts` (GET and POST handlers — POST also needs a DB transaction)

---

## Phase 1: Security Hardening

### P1-1: Add Rate Limiting
- Install `@upstash/ratelimit` and `@upstash/redis` (or use an in-memory alternative like `rate-limiter-flexible` if Redis is not available)
- Create rate limiting middleware in `src/lib/rate-limit.ts`
- Apply limits:
  - `/api/auth` — 5 requests/minute per IP (brute force protection)
  - `/api/chat/prospect` — 10 requests/minute per IP (expensive AI calls)
  - `/api/track/*` — 100 requests/minute per IP (tracking flood protection)
  - All authenticated routes — 100 requests/minute per user

### P1-2: Add Security Headers
**File:** `next.config.ts` — add `headers()` config:
```typescript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  }];
}
```

### P1-3: Add Twilio Signature Verification
- Install `twilio` package (or use the existing one if present)
- In `/api/twilio/status/route.ts` and `/api/twilio/sms/route.ts`, verify `X-Twilio-Signature` header using `twilio.validateRequest()`
- Read `TWILIO_AUTH_TOKEN` from env (add to config.ts)

### P1-4: Add Webhook Key Verification to Track Endpoints
**Files:**
- `src/app/api/track/sent/route.ts`
- `src/app/api/track/replies/route.ts`

Add `x-webhook-key` header check matching the pattern already used in `src/app/api/sequences/execute/route.ts` (but using the centralized config instead of hardcoded fallback).

### P1-5: Implement HMAC-Signed Tracking Tokens
**File:** `src/lib/email-tracking.ts`
- Replace bare database IDs in tracking URLs with HMAC-signed tokens
- Pattern: `token = hmac(sendId, TRACKING_SECRET)` → URL includes both `id` and `sig`
- In `/api/track/o/[id]/route.ts` and `/api/track/c/[id]/route.ts`, verify signature before recording events

### P1-6: Sanitize dangerouslySetInnerHTML
- `npm install dompurify @types/dompurify`
- **File:** `src/app/settings/page.tsx` line 666 — sanitize signature HTML before rendering:
  ```typescript
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signature) }}
  ```

### P1-7: Add Zod Input Validation
- `npm install zod`
- Create validation schemas in `src/lib/validators/` for each major entity:
  - `contact.ts` — validate contact creation/update fields
  - `sequence.ts` — validate sequence creation fields
  - `campaign.ts` — validate campaign creation/update fields
  - `auth.ts` — validate login payload
  - `chat.ts` — validate chat message (max 5000 chars, history max 20 entries)
- Apply validation at the top of every POST/PUT/PATCH handler

### P1-8: Narrow Public Paths in Middleware
**File:** `src/middleware.ts` line 6
- Remove `/api/brain/sync` from public paths (require auth)
- Keep tracking/webhook paths public but ensure they have webhook key verification (P1-4)
- Audit `/api/chat/prospect` — ensure rate limiting is applied (P1-1)

### P1-9: Fix RBAC on Admin Routes
**Files:**
- `src/app/api/admin/users/route.ts` — add role check to GET handler (line 5-31)
- `src/app/api/admin/org/route.ts` — fix bypass: change `if (tenant && tenant.role !== 'admin')` to require tenant non-null AND admin role. Reject requests without valid tenant session.
- `src/app/api/admin/users/route.ts` — same RBAC fix for POST handler

### P1-10: Add Logout Endpoint
- Create `src/app/api/auth/logout/route.ts` with POST handler that clears the session cookie
- Add "Sign out" button to the sidebar or settings page
- Set cookie with `maxAge: 0` or `expires: new Date(0)`

### P1-11: Parameterize All INTERVAL Interpolations
Search the entire codebase for `INTERVAL '${` and replace with parameterized equivalents:
- Pattern: `INTERVAL '${days} days'` → `INTERVAL '1 day' * $N`
- Affected files (~20 instances): dashboard, linkedin/activity, coaching/winloss, bdr/activity, bdr/chat, bdr/tracker, bdr/campaigns/performance, attribution, signups/cohorts, phone/calls, sequences/execute, sequences/[id]/enroll, bdr/campaigns/action, bdr/campaigns/process-scheduled

### P1-12: Fix SSRF in Webhook Test
**File:** `src/app/api/settings/webhooks/route.ts` lines 59-77
- Before fetching the user-supplied URL, validate it:
  - Must be http:// or https://
  - Resolve DNS and block private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x, 127.x, ::1)
  - Block cloud metadata endpoints (169.254.169.254)

---

## Validation Checklist

After all changes:
- [ ] App starts without errors when all env vars are set
- [ ] App crashes with clear error message when any required env var is missing
- [ ] Login works with bcrypt-hashed password
- [ ] Admin routes reject non-admin users
- [ ] Legacy single-tenant auth path is blocked or restricted
- [ ] `/api/track/sent` and `/api/track/replies` reject requests without webhook key
- [ ] SQL injection attempt on `/api/dashboard?range=custom&from='; DROP TABLE--` returns error, not execution
- [ ] Rate limiting blocks excessive requests to `/api/auth`
- [ ] Security headers present on all responses (check with `curl -I`)
- [ ] Tracking URLs contain HMAC signature, not bare IDs
- [ ] Email signature preview sanitizes script tags
- [ ] Logout clears session cookie and redirects to login
- [ ] Zod validation rejects malformed request bodies with 400 status

---

## New Dependencies

```
npm install bcryptjs @types/bcryptjs zod dompurify @types/dompurify rate-limiter-flexible
```

## New Files to Create

- `src/lib/config.ts` — centralized env var validation
- `src/lib/rate-limit.ts` — rate limiting middleware
- `src/lib/validators/contact.ts` — Zod schemas for contacts
- `src/lib/validators/sequence.ts` — Zod schemas for sequences
- `src/lib/validators/campaign.ts` — Zod schemas for campaigns
- `src/lib/validators/auth.ts` — Zod schemas for auth
- `src/lib/validators/chat.ts` — Zod schemas for chat
- `src/app/api/auth/logout/route.ts` — logout endpoint
- `scripts/hash-existing-passwords.ts` — one-time migration script
- `.gitignore`

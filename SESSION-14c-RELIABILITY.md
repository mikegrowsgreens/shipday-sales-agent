# Session 14c: Reliability, Observability & Code Quality

**Prerequisite:** Session 14b (multi-tenancy) complete and tested
**Scope:** Phase 3 + Phase 4 from audit punch list
**Goal:** Production-grade error tracking, structured logging, test coverage, and migration tooling
**Rule:** Do NOT deploy. Commit all changes for review.

---

## Part A: Reliability & Observability

### R-1: Install and Configure Sentry
- `npm install @sentry/nextjs`
- Run `npx @sentry/wizard@latest -i nextjs`
- Configure `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Add `SENTRY_DSN` to `src/lib/config.ts` (required env var)
- Wrap `next.config.ts` with `withSentryConfig()`
- Verify errors are captured in Sentry dashboard after deployment

### R-2: Add Health Check Endpoint
Create `src/app/api/health/route.ts`:
```typescript
export async function GET() {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'unknown' },
      shipday_db: { status: 'unknown' },
    }
  };

  try {
    await query('SELECT 1');
    checks.checks.database = { status: 'ok' };
  } catch (e) {
    checks.checks.database = { status: 'error', message: e.message };
    checks.status = 'degraded';
  }

  try {
    await queryShipday('SELECT 1');
    checks.checks.shipday_db = { status: 'ok' };
  } catch (e) {
    checks.checks.shipday_db = { status: 'error', message: e.message };
    checks.status = 'degraded';
  }

  return NextResponse.json(checks, {
    status: checks.status === 'ok' ? 200 : 503
  });
}
```

Add `/api/health` to the public paths list in middleware.ts.

### R-3: Add Database Pool Error Handling
**File:** `src/lib/db.ts`
- Add `pool.on('error', ...)` handler to both pools
- Add `connectionTimeoutMillis: 5000`
- Add `idleTimeoutMillis: 30000`
- Add `statement_timeout: '30000'` (30 seconds)
- Log pool errors to Sentry

### R-4: Add Timeouts to External API Calls

**Anthropic API calls** — add AbortController with 60s timeout:
- `src/lib/ai.ts` — all `anthropic.messages.create()` calls
- `src/app/api/coaching/ai-coach/route.ts`
- `src/app/api/bdr/briefing/route.ts`
- `src/app/api/bdr/chat/route.ts`
- `src/app/api/tasks/daily-plan/route.ts`
- `src/app/api/phone/brief/route.ts`
- `src/app/api/sequences/generate/route.ts`
- `src/app/api/chat/prospect/route.ts`

Pattern:
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 60000);
try {
  const response = await anthropic.messages.create({ ... }, { signal: controller.signal });
} finally {
  clearTimeout(timeout);
}
```

**n8n webhook calls** — add AbortController with 10s timeout:
- All `fetch()` calls to `N8N_BASE_URL + '/webhook/...'`
- ~12 files that call n8n webhooks

**Twilio calls** — add timeout to Twilio API calls (10s)

### R-5: Fix Fire-and-Forget Webhook Pattern
**Files:**
- `src/app/api/followups/approve/route.ts`
- `src/app/api/bdr/campaigns/action/route.ts`

Currently: mark email as approved → fire webhook → don't check response.

Fix:
1. Add `delivery_status` column to relevant tables (`pending`, `sent`, `failed`)
2. Mark as `pending` before webhook call
3. Check webhook response status
4. Mark as `sent` only on 2xx response
5. Mark as `failed` on error, log to Sentry
6. Consider a retry queue for failed deliveries

### R-6: Add Idempotency to Engagement Tracking
**File:** `src/app/api/track/o/[id]/route.ts`
- Before inserting touchpoint, check if one already exists for this send_id + type within last 5 minutes
- Use `INSERT ... ON CONFLICT DO NOTHING` pattern
- Cap `engagement_score` increments (e.g., max +1 per email per day for opens)

**File:** `src/app/api/webhooks/engagement/route.ts`
- Same pattern: deduplicate engagement events

### R-7: Replace console.* with Structured Logging
- `npm install pino pino-pretty`
- Create `src/lib/logger.ts`:
```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty' }
  }),
});

export function createRequestLogger(module: string, requestId?: string) {
  return logger.child({ module, requestId });
}
```
- Replace all `console.log`, `console.error`, `console.warn` calls with structured `logger.info()`, `logger.error()`, `logger.warn()` calls
- Each log call should include: module name, operation, relevant IDs (org_id, contact_id, etc.)
- ~230 replacements across the codebase

### R-8: Add Request Correlation IDs
**File:** `src/middleware.ts`
- Generate a UUID for each request
- Set it as a response header (`X-Request-Id`)
- Pass it through to API routes via a header
- Include in all log entries for that request

### R-9: Add Database Transaction Support
Create `src/lib/db-transaction.ts`:
```typescript
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

Apply to multi-statement operations:
- `src/app/api/sequences/route.ts` POST (multi-step insert)
- `src/app/api/contacts/merge/route.ts`
- `src/app/api/bdr/campaigns/action/route.ts`
- `src/app/api/signups/convert/route.ts`
- Any route that does multiple related INSERT/UPDATE calls

---

## Part B: Code Quality

### Q-1: Install and Configure Vitest
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

Add to `package.json`:
```json
"scripts": {
  "test": "vitest",
  "test:run": "vitest run",
  "test:coverage": "vitest run --coverage"
}
```

### Q-2: Write Critical Path Tests

**Auth tests** (`src/__tests__/api/auth.test.ts`):
- Login with correct password returns 200 + session cookie
- Login with wrong password returns 401
- Login with missing fields returns 400
- Logout clears session cookie
- Protected route rejects without session
- Admin route rejects non-admin user

**Contacts tests** (`src/__tests__/api/contacts.test.ts`):
- GET returns only contacts for current org
- POST creates contact with correct org_id
- PATCH updates only own org's contact
- Cannot access other org's contact by ID
- Import sets org_id on new contacts
- Export only includes own org's contacts

**Sequences tests** (`src/__tests__/api/sequences.test.ts`):
- GET returns only sequences for current org
- POST creates sequence with correct org_id
- Enrollment scoped to org

**Tenant isolation tests** (`src/__tests__/tenant-isolation.test.ts`):
- Create two orgs with different data
- Verify org A cannot see org B's contacts/sequences/tasks
- Verify org B cannot see org A's data
- Verify webhook routes resolve correct org_id

### Q-3: Create Shared Error Handler
Create `src/lib/api-error.ts`:
```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }

  // Log full error to Sentry/logger, return generic message to client
  logger.error({ error }, 'Unhandled API error');
  Sentry.captureException(error);

  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}
```

Apply to all API routes as standardized catch handler.

### Q-4: Adopt Database Migration Tool
- `npm install drizzle-kit drizzle-orm`
- Create `drizzle.config.ts` pointing to the PostgreSQL database
- Convert existing 6 SQL schema files into numbered Drizzle migrations
- Add migration scripts to package.json:
  ```json
  "db:migrate": "drizzle-kit migrate",
  "db:generate": "drizzle-kit generate",
  "db:studio": "drizzle-kit studio"
  ```
- **Note:** This does NOT mean rewriting all queries to use Drizzle ORM. Use Drizzle only for migrations. Raw `pg` queries stay.

### Q-5: Centralize Configuration
Create `src/lib/config.ts` (if not already done in 14a):
- All env vars read in one place with validation
- All hardcoded values (emails, URLs, model names, webhook IDs) moved here
- All 12 files with `N8N_BASE_URL` fallback updated to import from config
- All 11 files with `CLAUDE_MODEL` fallback updated to import from config
- Hardcoded `mike@mikegrowsgreens.com` in 4 files replaced with `config.DEFAULT_SENDER_EMAIL`

### Q-6: Set Up Prettier + Pre-Commit Hooks
```bash
npm install -D prettier husky lint-staged
npx husky init
```

Create `.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

Create `.lintstagedrc`:
```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css}": ["prettier --write"]
}
```

Add pre-commit hook: `echo "npx lint-staged" > .husky/pre-commit`

### Q-7: Batch N+1 Query Patterns
**Contact import** (`src/app/api/contacts/import/route.ts`):
- Replace individual INSERTs with multi-row `INSERT INTO ... VALUES ($1,$2,$3), ($4,$5,$6), ...`
- Process in batches of 100 rows

**Segments count** (`src/app/api/segments/route.ts`):
- Replace individual COUNT queries per segment with a single query using LATERAL join or subquery

**Bulk operations** (`src/app/api/contacts/bulk/route.ts`):
- Replace individual INSERTs in loop with batch insert using `unnest()`

**Sequence step creation** (`src/app/api/sequences/route.ts` POST):
- Replace sequential INSERT + UPDATE loop with batch operations

---

## Validation Checklist

- [ ] Sentry captures errors from API routes (test with intentional error)
- [ ] `/api/health` returns 200 when DB is up, 503 when DB is down
- [ ] Pool error handler logs and recovers from connection drops
- [ ] Anthropic API calls timeout after 60s (test with network block)
- [ ] n8n webhook calls timeout after 10s
- [ ] Engagement tracking does not create duplicate touchpoints on repeated opens
- [ ] `vitest run` passes all tests
- [ ] Auth tests verify tenant isolation
- [ ] Structured logs output JSON in production, pretty-print in development
- [ ] Request correlation IDs appear in logs and response headers
- [ ] Database transactions rollback on failure (test with intentional mid-transaction error)
- [ ] `npm run db:migrate` applies migrations cleanly
- [ ] Pre-commit hooks run ESLint + Prettier on staged files

---

## New Dependencies

```bash
# Reliability
npm install @sentry/nextjs pino pino-pretty

# Testing
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom

# Code Quality
npm install drizzle-kit drizzle-orm
npm install -D prettier husky lint-staged
```

## New Files to Create

- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `src/app/api/health/route.ts`
- `src/lib/logger.ts`
- `src/lib/api-error.ts`
- `src/lib/db-transaction.ts`
- `vitest.config.ts`
- `src/test/setup.ts`
- `src/__tests__/api/auth.test.ts`
- `src/__tests__/api/contacts.test.ts`
- `src/__tests__/api/sequences.test.ts`
- `src/__tests__/tenant-isolation.test.ts`
- `drizzle.config.ts`
- `.prettierrc`
- `.lintstagedrc`
- `.husky/pre-commit`

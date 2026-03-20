# Session 14f: SaaS Infrastructure (No Payment Integration)

**Prerequisite:** Session 14e (generalization) complete and tested
**Scope:** Phase 7 from audit punch list — minus Stripe/billing (deferred per founder decision)
**Goal:** Self-serve signup, plan tiers with feature gating, admin panel, customer API, compliance basics, CI/CD
**Rule:** Do NOT deploy. Commit all changes for review.

**Note:** Payment/billing integration (Stripe) is explicitly deferred. This session builds everything else needed for multi-tenant SaaS operation. Plan enforcement uses soft limits (UI warnings) without payment gates.

---

## Part A: Self-Serve Signup Flow

### S-1: Build Signup Page
**File:** `src/app/signup/page.tsx`

Fields:
- Company name (required)
- Full name (required)
- Email (required)
- Password (required, min 8 chars)
- Password confirmation

Validation:
- Email format validation
- Password strength requirements (8+ chars, at least 1 number)
- Company name uniqueness check

On submit: POST `/api/auth/signup`

### S-2: Build Signup API
**File:** `src/app/api/auth/signup/route.ts`

Steps:
1. Validate input with Zod schema
2. Check email doesn't already exist in `crm.users`
3. Check company name doesn't already exist in `crm.organizations`
4. Hash password with bcrypt
5. Create org in `crm.organizations` with `plan: 'free'`
6. Create user in `crm.users` with `role: 'admin'`
7. Set default org config (from template)
8. Create session JWT with user/org info
9. Set session cookie
10. Return success + redirect to `/onboarding`

### S-3: Build Email Verification
**Schema:** Add `crm.email_verifications` table:
```sql
CREATE TABLE crm.email_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES crm.users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Files:**
- `src/app/api/auth/verify-email/route.ts` — POST (send verification email), GET (verify token)
- `src/lib/email.ts` — email sending utility (use org's SMTP or a system SMTP for transactional emails)

Flow:
1. After signup, send verification email with token link
2. Token expires in 24 hours
3. User clicks link → token verified → `users.email_verified = true`
4. Unverified users can log in but see a banner: "Please verify your email"
5. Some features gated behind email verification (sending emails, API keys)

### S-4: Build Password Reset Flow
**Schema:** Add `crm.password_resets` table:
```sql
CREATE TABLE crm.password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES crm.users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Files:**
- `src/app/forgot-password/page.tsx` — email input form
- `src/app/reset-password/page.tsx` — new password form (with token in URL)
- `src/app/api/auth/forgot-password/route.ts` — POST (send reset email)
- `src/app/api/auth/reset-password/route.ts` — POST (validate token, update password)

Flow:
1. User enters email on forgot-password page
2. If email exists, send reset email with token link (always return 200 to prevent enumeration)
3. Token expires in 1 hour
4. User clicks link → enters new password → password updated with bcrypt
5. Invalidate all existing sessions for this user

### S-5: Build Onboarding Wizard
**File:** `src/app/onboarding/page.tsx`

Multi-step wizard shown after first signup:

**Step 1: Company Info**
- Company name (pre-filled from signup)
- Industry (dropdown: SaaS, E-commerce, Services, Real Estate, Other)
- Website URL
- Company description (for AI context)

**Step 2: Your Role**
- Your name (pre-filled)
- Your title
- Your email (pre-filled, for sending)

**Step 3: Value Proposition**
- What does your product/service do? (textarea)
- Key value propositions (add up to 5)
- Common pain points you solve (add up to 5)

**Step 4: Email Setup**
- SMTP configuration (host, port, username, password)
- "Test connection" button
- Or: "Skip for now" option

**Step 5: Import Contacts (Optional)**
- CSV upload
- Or: "Skip and add contacts later"

On completion: save all data to org config, redirect to dashboard with Getting Started checklist.

### S-6: Invite Team Members
**File:** `src/app/api/auth/invite/route.ts`

- Admin-only endpoint
- POST with `{ email, role }` (role: admin, manager, member)
- Creates invitation record in `crm.invitations` table
- Sends invite email with signup link + invitation token
- Invited user signs up with pre-associated org (skips org creation step)

**Schema:**
```sql
CREATE TABLE crm.invitations (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES crm.organizations(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  invited_by INTEGER REFERENCES crm.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Part B: Plan Tiers & Feature Gating (Without Billing)

### P-1: Define Plan Configuration
**File:** `src/lib/plans.ts`

```typescript
export interface PlanLimits {
  maxContacts: number;
  maxSequences: number;
  maxCampaigns: number;
  maxEmailsPerMonth: number;
  maxAiGenerationsPerMonth: number;
  maxUsers: number;
  features: {
    sequences: boolean;
    campaigns: boolean;
    aiGeneration: boolean;
    phoneDialer: boolean;
    coaching: boolean;
    customBranding: boolean;
    apiAccess: boolean;
    linkedinIntegration: boolean;
  };
}

export const PLANS: Record<string, PlanLimits> = {
  free: {
    maxContacts: 100,
    maxSequences: 2,
    maxCampaigns: 1,
    maxEmailsPerMonth: 200,
    maxAiGenerationsPerMonth: 50,
    maxUsers: 1,
    features: {
      sequences: true,
      campaigns: false,
      aiGeneration: true,
      phoneDialer: false,
      coaching: false,
      customBranding: false,
      apiAccess: false,
      linkedinIntegration: false,
    },
  },
  starter: {
    maxContacts: 1000,
    maxSequences: 10,
    maxCampaigns: 5,
    maxEmailsPerMonth: 2000,
    maxAiGenerationsPerMonth: 500,
    maxUsers: 3,
    features: {
      sequences: true,
      campaigns: true,
      aiGeneration: true,
      phoneDialer: false,
      coaching: true,
      customBranding: false,
      apiAccess: false,
      linkedinIntegration: true,
    },
  },
  pro: {
    maxContacts: 10000,
    maxSequences: -1, // unlimited
    maxCampaigns: -1,
    maxEmailsPerMonth: 20000,
    maxAiGenerationsPerMonth: 5000,
    maxUsers: 10,
    features: {
      sequences: true,
      campaigns: true,
      aiGeneration: true,
      phoneDialer: true,
      coaching: true,
      customBranding: true,
      apiAccess: true,
      linkedinIntegration: true,
    },
  },
};
```

### P-2: Usage Tracking
**Schema:**
```sql
CREATE TABLE crm.usage_events (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES crm.organizations(id),
  event_type TEXT NOT NULL, -- 'email_sent', 'ai_generation', 'contact_created'
  count INTEGER DEFAULT 1,
  period TEXT NOT NULL, -- '2026-03' (monthly)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_org_period ON crm.usage_events(org_id, period, event_type);
```

**File:** `src/lib/usage.ts`
```typescript
export async function trackUsage(orgId: number, eventType: string, count = 1) {
  const period = new Date().toISOString().slice(0, 7); // '2026-03'
  await query(`
    INSERT INTO crm.usage_events (org_id, event_type, count, period)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (org_id, event_type, period)
    DO UPDATE SET count = usage_events.count + $3
  `, [orgId, eventType, count, period]);
}

export async function getUsage(orgId: number, period?: string) {
  const p = period || new Date().toISOString().slice(0, 7);
  return query('SELECT event_type, SUM(count) as total FROM crm.usage_events WHERE org_id = $1 AND period = $2 GROUP BY event_type', [orgId, p]);
}

export async function checkLimit(orgId: number, eventType: string, plan: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limits = PLANS[plan];
  const usage = await getUsage(orgId);
  // ... check against plan limits
}
```

### P-3: Feature Gating Middleware
**File:** `src/lib/feature-gate.ts`

```typescript
export async function requireFeature(orgId: number, plan: string, feature: keyof PlanLimits['features']): Promise<void> {
  const limits = PLANS[plan];
  if (!limits?.features[feature]) {
    throw new ApiError(`This feature requires a ${getMinimumPlan(feature)} plan or higher`, 403, 'PLAN_UPGRADE_REQUIRED');
  }
}

export async function checkResourceLimit(orgId: number, plan: string, resource: string): Promise<void> {
  const limits = PLANS[plan];
  const usage = await getUsage(orgId);
  // Check if limit exceeded, throw 403 if so
}
```

### P-4: Apply Feature Gates to Routes
- Campaigns routes: `requireFeature(orgId, plan, 'campaigns')`
- Phone routes: `requireFeature(orgId, plan, 'phoneDialer')`
- Coaching routes: `requireFeature(orgId, plan, 'coaching')`
- LinkedIn routes: `requireFeature(orgId, plan, 'linkedinIntegration')`
- API key routes: `requireFeature(orgId, plan, 'apiAccess')`

### P-5: Apply Usage Limits
Track usage on:
- Contact creation: `trackUsage(orgId, 'contact_created')` → check `maxContacts`
- Email sending: `trackUsage(orgId, 'email_sent')` → check `maxEmailsPerMonth`
- AI generation: `trackUsage(orgId, 'ai_generation')` → check `maxAiGenerationsPerMonth`
- Sequence creation: check total count against `maxSequences`
- Campaign creation: check total count against `maxCampaigns`
- User invitation: check total count against `maxUsers`

### P-6: Usage Dashboard UI
**File:** `src/app/settings/usage/page.tsx` (or add as tab in settings)

Show:
- Current plan name
- Usage bars for each metered resource (contacts, emails, AI generations)
- Feature availability matrix
- "Upgrade" CTA (placeholder — links to contact form until billing is implemented)

---

## Part C: Admin Panel (Super-Admin)

### A-1: Super-Admin Flag
Add `is_super_admin BOOLEAN DEFAULT FALSE` to `crm.users` table.
Set to true for Mike's user account.

### A-2: Super-Admin Middleware
**File:** `src/lib/require-super-admin.ts`
```typescript
export async function requireSuperAdmin() {
  const tenant = await requireTenant();
  const user = await queryOne('SELECT is_super_admin FROM crm.users WHERE id = $1', [tenant.userId]);
  if (!user?.is_super_admin) {
    throw new ApiError('Forbidden', 403);
  }
  return tenant;
}
```

### A-3: Super-Admin Dashboard
**File:** `src/app/admin/dashboard/page.tsx`

Show:
- Total orgs, total users, total contacts across all orgs
- Org list with: name, plan, user count, contact count, last activity
- Click into org to see details
- Usage metrics per org (emails sent, AI tokens used)
- System health (link to /api/health)

### A-4: Super-Admin API Routes
- `GET /api/admin/tenants` — list all orgs (super-admin only)
- `GET /api/admin/tenants/[id]` — org detail with usage stats
- `PATCH /api/admin/tenants/[id]` — update org plan, toggle features
- `GET /api/admin/tenants/[id]/users` — list users in org
- `GET /api/admin/system-stats` — aggregate metrics

---

## Part D: Customer-Facing API

### API-1: Wire Up API Key Management
The `crm.api_keys` table already exists. Build the application layer:

**File:** `src/app/api/settings/api-keys/route.ts`
- GET: list active API keys for current org (show last 4 chars only)
- POST: generate new API key (return full key ONCE, store hashed)
- DELETE: revoke API key

**File:** `src/lib/api-auth.ts`
```typescript
export async function authenticateApiKey(request: Request): Promise<{ orgId: number; keyId: number } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer sk_')) return null;

  const key = authHeader.slice(7);
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const result = await queryOne(`
    SELECT ak.id, ak.org_id, ak.permissions
    FROM crm.api_keys ak
    WHERE ak.key_hash = $1 AND ak.is_active = true
    AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
  `, [keyHash]);

  return result ? { orgId: result.org_id, keyId: result.id } : null;
}
```

### API-2: Update Middleware for API Key Auth
**File:** `src/middleware.ts`
- Check for `Authorization: Bearer sk_...` header first
- If present, validate API key (bypass JWT check)
- If not present, fall through to JWT/session auth
- API key auth skips CSRF checks (stateless)

### API-3: API Key Settings UI
**File:** Add "API Keys" tab to settings page
- List existing keys (masked)
- "Generate New Key" button → shows full key once with copy button
- Revoke button per key
- Gated behind `requireFeature(orgId, plan, 'apiAccess')`

---

## Part E: Data Export & GDPR Basics

### G-1: Complete Data Export
**File:** `src/app/api/settings/export/route.ts`

Expand to export ALL user data:
- contacts, touchpoints, sequences, sequence_enrollments, sequence_step_executions
- task_queue, phone_calls, sms_messages, calendly_events
- campaigns, leads, email_sends, templates
- brain content, tags
- saved_segments, lifecycle_rules
- All scoped by org_id

Format: ZIP file containing one CSV per table.

### G-2: Data Deletion Endpoint
**File:** `src/app/api/settings/delete-account/route.ts`

- Admin-only endpoint
- Requires password confirmation
- Soft-deletes org: sets `crm.organizations.deleted_at = NOW()`
- Schedules hard deletion after 30-day grace period
- Returns confirmation with grace period info
- During grace period, org data is inaccessible but recoverable

### G-3: Audit Logging
**Schema:**
```sql
CREATE TABLE crm.audit_log (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL, -- 'login', 'contact.create', 'sequence.delete', 'settings.update', 'export.data'
  resource_type TEXT, -- 'contact', 'sequence', 'campaign'
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org ON crm.audit_log(org_id, created_at DESC);
```

**File:** `src/lib/audit.ts`
```typescript
export async function logAuditEvent(event: {
  orgId: number;
  userId?: number;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  request?: Request;
}) {
  await query(`
    INSERT INTO crm.audit_log (org_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [event.orgId, event.userId, event.action, event.resourceType, event.resourceId,
      JSON.stringify(event.details), getIpFromRequest(event.request), getUserAgent(event.request)]);
}
```

Apply audit logging to:
- Login/logout
- Contact create/update/delete
- Sequence create/update/delete
- Campaign create/send
- Settings changes
- Data export
- API key generation/revocation
- User invite/remove

### G-4: Terms & Privacy Pages
**Files:**
- `src/app/terms/page.tsx` — Terms of Service page
- `src/app/privacy/page.tsx` — Privacy Policy page

Create placeholder pages with standard SaaS terms. Flag for legal review before launch.

Add links to:
- Signup page footer
- App footer/sidebar
- Settings page

---

## Part F: CI/CD & Deployment

### CI-1: Dockerfile
**File:** `Dockerfile`
```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS build
COPY . .
RUN npm ci
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["npm", "start"]
```

### CI-2: PM2 Ecosystem File
**File:** `ecosystem.config.js`
```javascript
module.exports = {
  apps: [{
    name: 'saleshub',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
  }],
};
```

### CI-3: Deploy Script
**File:** `scripts/deploy.sh`
```bash
#!/bin/bash
set -e
echo "Building..."
npm run build
echo "Deploying to server..."
rsync -avz --delete .next/ root@167.172.119.28:/var/www/saleshub/.next/
rsync -avz node_modules/ root@167.172.119.28:/var/www/saleshub/node_modules/
rsync -avz public/ root@167.172.119.28:/var/www/saleshub/public/
scp package.json root@167.172.119.28:/var/www/saleshub/
scp ecosystem.config.js root@167.172.119.28:/var/www/saleshub/
ssh root@167.172.119.28 "cd /var/www/saleshub && pm2 reload saleshub"
echo "Deploy complete!"
```

### CI-4: GitHub Actions (Optional)
**File:** `.github/workflows/ci.yml`
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run test:run
      - run: npm run build
```

---

## Validation Checklist

- [ ] New user can sign up with company name, email, password
- [ ] Email verification email is sent and token works
- [ ] Password reset flow works end-to-end
- [ ] Onboarding wizard collects company info and saves to org config
- [ ] Team member invitation creates invitation email with working link
- [ ] Invited user signs up and lands in the correct org
- [ ] Free plan user cannot access campaign features (403 with upgrade prompt)
- [ ] Usage tracking records contact creations, email sends, AI generations
- [ ] Usage dashboard shows accurate numbers with plan limits
- [ ] Super-admin can see all tenants and their usage
- [ ] API key generation returns key once, stores hash
- [ ] API key auth works on API routes (Bearer sk_...)
- [ ] Full data export downloads ZIP with all user data
- [ ] Account deletion soft-deletes and blocks access
- [ ] Audit log captures login, CRUD operations, settings changes
- [ ] Terms and Privacy pages render correctly
- [ ] Docker build succeeds
- [ ] PM2 ecosystem file works for production process management
- [ ] Deploy script successfully deploys to server

---

## New Database Tables

- `crm.email_verifications`
- `crm.password_resets`
- `crm.invitations`
- `crm.usage_events`
- `crm.audit_log`

## New Files to Create

**Auth & Signup:**
- `src/app/signup/page.tsx`
- `src/app/api/auth/signup/route.ts`
- `src/app/api/auth/verify-email/route.ts`
- `src/app/forgot-password/page.tsx`
- `src/app/reset-password/page.tsx`
- `src/app/api/auth/forgot-password/route.ts`
- `src/app/api/auth/reset-password/route.ts`
- `src/app/api/auth/invite/route.ts`
- `src/app/onboarding/page.tsx`
- `src/lib/email.ts` (transactional email sending)

**Plans & Usage:**
- `src/lib/plans.ts`
- `src/lib/usage.ts`
- `src/lib/feature-gate.ts`
- `src/app/settings/usage/page.tsx` (or tab)

**Admin:**
- `src/lib/require-super-admin.ts`
- `src/app/admin/dashboard/page.tsx`
- `src/app/api/admin/tenants/route.ts`
- `src/app/api/admin/tenants/[id]/route.ts`
- `src/app/api/admin/system-stats/route.ts`

**API:**
- `src/lib/api-auth.ts`
- `src/app/api/settings/api-keys/route.ts`

**Compliance:**
- `src/lib/audit.ts`
- `src/app/api/settings/delete-account/route.ts`
- `src/app/terms/page.tsx`
- `src/app/privacy/page.tsx`

**Deployment:**
- `Dockerfile`
- `ecosystem.config.js`
- `scripts/deploy.sh`
- `.github/workflows/ci.yml`

**Migrations:**
- `migrations/XXX-auth-tables.sql`
- `migrations/XXX-usage-tables.sql`
- `migrations/XXX-audit-log.sql`
- `migrations/XXX-super-admin.sql`

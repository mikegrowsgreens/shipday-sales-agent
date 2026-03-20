# Session 14e: De-Shipday Generalization

**Prerequisite:** Session 14d (design/UX) complete and tested
**Scope:** Phase 6 from audit punch list
**Goal:** Transform SalesHub from a Shipday-specific tool into a general-purpose sales automation platform configurable for any industry
**Rule:** Do NOT deploy. Commit all changes for review.

---

## Overview

SalesHub currently has "Shipday" hardcoded in 30+ source files, AI prompts reference "Mike Paulus" and "restaurant delivery" by name, and several features are industry-specific. This session makes everything dynamic and configurable per-tenant.

---

## Step 1: Org-Level Configuration Schema

### 1.1 Add Configuration Fields to Organizations Table

Create migration `migrations/XXX-org-configuration.sql`:

```sql
ALTER TABLE crm.organizations ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- Config structure:
-- {
--   "company_name": "Acme Corp",
--   "product_name": "Acme Platform",
--   "industry": "SaaS",
--   "persona": {
--     "sender_name": "Jane Smith",
--     "sender_title": "Business Development Representative",
--     "sender_email": "jane@acme.com"
--   },
--   "value_props": [
--     "Reduce churn by 30%",
--     "Automate onboarding in 2 days"
--   ],
--   "pain_points": [
--     "Manual onboarding taking 2 weeks",
--     "High customer churn in first 90 days"
--   ],
--   "competitors": ["Competitor A", "Competitor B"],
--   "email_angles": [
--     { "id": "pain_point_1", "name": "Manual Processes", "description": "..." },
--     { "id": "roi_savings", "name": "ROI & Cost Savings", "description": "..." }
--   ],
--   "branding": {
--     "logo_url": "https://...",
--     "primary_color": "#2563eb",
--     "app_name": "SalesHub"
--   },
--   "integrations": {
--     "twilio_account_sid": "...",
--     "twilio_auth_token": "...",
--     "smtp_host": "...",
--     "smtp_user": "...",
--     "smtp_pass": "...",
--     "n8n_base_url": "...",
--     "n8n_webhook_key": "..."
--   }
-- }
```

### 1.2 Create Config API
**File:** `src/app/api/settings/org-config/route.ts`
- GET: return org config (admin only)
- PATCH: update org config fields (admin only)
- Include a setup wizard endpoint that validates required fields

### 1.3 Create Config Helper
**File:** `src/lib/org-config.ts`
```typescript
export interface OrgConfig {
  company_name: string;
  product_name: string;
  industry: string;
  persona: {
    sender_name: string;
    sender_title: string;
    sender_email: string;
  };
  value_props: string[];
  pain_points: string[];
  competitors: string[];
  email_angles: Array<{ id: string; name: string; description: string }>;
  branding: {
    logo_url: string;
    primary_color: string;
    app_name: string;
  };
  integrations: Record<string, string>;
}

export async function getOrgConfig(orgId: number): Promise<OrgConfig> {
  const result = await queryOne<{ config: OrgConfig }>(
    'SELECT config FROM crm.organizations WHERE id = $1',
    [orgId]
  );
  return result?.config || DEFAULT_CONFIG;
}
```

---

## Step 2: Remove Hardcoded "Shipday" References

### 2.1 UI References

| File | Line | Current | Replace With |
|------|------|---------|-------------|
| `src/app/layout.tsx` | 10 | `<title>Shipday Sales Hub</title>` | Dynamic from org config: `<title>{config.branding.app_name}</title>` |
| `src/app/login/page.tsx` | 40 | `"Shipday Sales Hub"` | Dynamic from org config (or generic "SalesHub" for login) |
| `src/components/layout/Sidebar.tsx` | 94-95 | `"Shipday"` + Zap icon | Dynamic from org config: `{config.company_name}` + logo |
| `src/app/chat/page.tsx` | 74 | Hardcoded Shipday logo URL | Dynamic from org config: `config.branding.logo_url` |
| `src/app/chat/page.tsx` | 75 | `alt="Shipday"` | Dynamic: `alt={config.company_name}` |

### 2.2 Backend References

| File | Line | Current | Replace With |
|------|------|---------|-------------|
| `src/app/api/followups/approve/route.ts` | 112 | `'mike@mikegrowsgreens.com'` | `config.persona.sender_email` |
| `src/app/api/bdr/campaigns/process-scheduled/route.ts` | 380, 731 | `'mike@mikegrowsgreens.com'` | `config.persona.sender_email` |
| `src/app/api/bdr/campaigns/action/route.ts` | 89 | `'mike@mikegrowsgreens.com'` | `config.persona.sender_email` |
| `src/lib/email-tracking.ts` | 12 | `'https://saleshub.mikegrowsgreens.com'` | `config.tracking_base_url` or env var |
| `src/app/api/twilio/call/route.ts` | 40 | `'https://saleshub.mikegrowsgreens.com/...'` | Dynamic from env var |
| `src/app/api/track/c/[id]/route.ts` | 18, 24, 27 | `'https://mikegrowsgreens.com'` | `config.default_redirect_url` or env var |

### 2.3 Database References
| Reference | Current | Action |
|-----------|---------|--------|
| `wincall_brain` database | Shipday-specific name | Keep as-is (database name is infrastructure, not user-facing). Document in ops guide |
| `shipday.*` schema | Shipday-specific schema | Rename to `deals.*` or `external.*` in a future migration. For now, add org_id and document |
| `shipday_signups` table | Shipday-specific | Rename to `crm.signups` or `crm.inbound_leads`. Add migration |

---

## Step 3: Make AI Prompts Dynamic

### 3.1 Rewrite System Prompts in ai.ts

**File:** `src/lib/ai.ts`

Current system prompt (hardcoded):
```
You are Mike Paulus, a BDR at Shipday. Shipday is a delivery management platform...
```

New pattern:
```typescript
function buildSystemPrompt(config: OrgConfig, brainContext: string): string {
  return `You are ${config.persona.sender_name}, ${config.persona.sender_title} at ${config.company_name}.

${config.company_name} offers ${config.product_name}: ${config.value_props.join('. ')}.

Key pain points you address:
${config.pain_points.map(p => `- ${p}`).join('\n')}

${brainContext ? `\nAdditional context from knowledge base:\n${brainContext}` : ''}

Write in a professional, conversational tone. Be specific about value.`;
}
```

### 3.2 Update All AI-Calling Routes
Every route that calls `anthropic.messages.create()` must:
1. Get org_id from session
2. Load org config: `const config = await getOrgConfig(orgId)`
3. Load brain context: `const brain = await loadBrainContext(orgId)`
4. Build dynamic system prompt: `buildSystemPrompt(config, brain)`

Routes to update:
- `src/lib/ai.ts` — `generateEmail()`, all generation functions
- `src/app/api/sequences/generate/route.ts`
- `src/app/api/sequences/regenerate-step/route.ts`
- `src/app/api/bdr/campaigns/regenerate/route.ts`
- `src/app/api/bdr/campaigns/bulk-regenerate/route.ts`
- `src/app/api/bdr/campaigns/generate-sequence/route.ts`
- `src/app/api/bdr/chat/route.ts`
- `src/app/api/bdr/briefing/route.ts`
- `src/app/api/followups/generate/route.ts`
- `src/app/api/followups/regenerate/route.ts`
- `src/app/api/coaching/ai-coach/route.ts`
- `src/app/api/tasks/daily-plan/route.ts`
- `src/app/api/phone/brief/route.ts`
- `src/app/api/chat/prospect/route.ts`

### 3.3 Make Email Angles Configurable

**Current:** Hardcoded in `src/lib/types.ts`:
```typescript
type EmailAngle = 'missed_calls' | 'commission_savings' | 'delivery_ops' | 'tech_consolidation' | 'customer_experience';
```

**New:** Email angles come from org config:
```typescript
// Angles are now dynamic per org
interface EmailAngle {
  id: string;
  name: string;
  description: string;
}
```

Update the campaign creation UI to load angles from org config instead of a hardcoded list.

### 3.4 Make ANGLE_DESCRIPTIONS Dynamic
**File:** `src/lib/ai.ts`

Current: `ANGLE_DESCRIPTIONS` is a hardcoded object with Shipday-specific angles.

New: Load angle descriptions from `config.email_angles` and build the prompt dynamically.

---

## Step 4: Generalize Industry-Specific Features

### 4.1 Territory Validation
**File:** `src/lib/utils.ts`

Current: `TERRITORY_AREA_CODES` is hardcoded to Georgia area codes.

Fix:
- Move territory config to org config: `config.territory.area_codes` (optional)
- Make `isInTerritory()` check against org-specific territory config
- If no territory configured, all contacts are "in territory"

### 4.2 ROI Calculator
**File:** `src/lib/roi.ts`

Current: Entirely Shipday-specific (plans, pricing, delivery fee calculations).

Fix:
- Make ROI calculator optional/pluggable
- Move to `src/lib/plugins/roi-calculator.ts`
- Only show in UI if org config has `roi_calculator` settings
- For the default SalesHub product, remove the ROI calculator from the main UI
- Keep it available as an optional plugin for orgs that configure it

### 4.3 Shipday Deals / Followups
**File:** `src/app/api/followups/deals/route.ts` and related

Currently queries `shipday.*` schema for Shipday-specific deal data.

Fix:
- Abstract the deal source — create a `DealSource` interface
- Shipday becomes one implementation
- Other tenants can have different deal sources (or use the CRM pipeline directly)
- For tenants without a custom deal source, hide the "Follow-Ups" nav item

### 4.4 Signup Tracking
**File:** `src/app/api/signups/route.ts` and related

Currently tracks Shipday signups specifically.

Fix:
- Rename `crm.shipday_signups` to `crm.inbound_leads` or `crm.signups`
- Generalize the schema to work for any product signup tracking
- Make the webhook that receives signups configurable per-org

---

## Step 5: Move Integration Credentials to Per-Org Config

### 5.1 Current Problem
Integration credentials are read from `process.env`:
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
- Various `N8N_*` webhook URLs

This means all tenants share the same integrations.

### 5.2 Fix: Read from Org Config
For each integration, check org config first, fall back to env var:

```typescript
function getTwilioConfig(orgConfig: OrgConfig) {
  return {
    accountSid: orgConfig.integrations?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID,
    authToken: orgConfig.integrations?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN,
  };
}
```

Update these routes:
- `src/app/api/twilio/call/route.ts` — use per-org Twilio config
- `src/app/api/twilio/sms/route.ts` — use per-org Twilio config
- All routes that send emails via SMTP — use per-org SMTP config
- All routes that call n8n webhooks — use per-org n8n config

### 5.3 Settings UI Update
The Settings page already has UI for SMTP, Twilio, etc. Make sure it:
- Reads from org config (database), not from env vars
- Writes to org config on save
- Encrypts sensitive values (API keys, passwords) before storing

---

## Step 6: Database Naming Cleanup

### 6.1 Rename Shipday-Specific Tables
Create migration:
```sql
-- Rename shipday_signups to inbound_leads
ALTER TABLE crm.shipday_signups RENAME TO crm.inbound_leads;

-- Or if using separate schema:
ALTER SCHEMA shipday RENAME TO deals;
```

### 6.2 Update All Code References
Search and replace across the codebase:
- `shipday_signups` → `inbound_leads` (or chosen name)
- `ShipdaySignup` type → `InboundLead`
- `ShipdayDeal` type → `Deal`
- `queryShipday` → `queryDeals` (in db.ts)

---

## Validation Checklist

- [ ] Create a new org with non-Shipday config (e.g., "Acme SaaS")
- [ ] Login as Acme user — sidebar shows "Acme SaaS" not "Shipday"
- [ ] Login page shows generic branding (or org-specific if pre-configured)
- [ ] Generate an email — AI uses Acme's persona, value props, and pain points (not Shipday's)
- [ ] Email angles show Acme's configured angles (not Shipday's)
- [ ] Brain content is scoped to Acme org
- [ ] Territory validation uses Acme's configured area codes (or skips if not configured)
- [ ] SMTP sends use Acme's configured SMTP (not env var SMTP)
- [ ] Twilio calls use Acme's configured Twilio account
- [ ] ROI calculator is hidden for Acme (no roi_calculator config)
- [ ] Follow-ups section uses generalized deal tracking
- [ ] No "Shipday", "Mike Paulus", "mikegrowsgreens", or "restaurant delivery" text appears for Acme user
- [ ] Shipday org (org_id=1) still works with its existing config

---

## Files with "Shipday" References to Update

Run this search to find all remaining references after changes:
```bash
grep -rn "Shipday\|shipday\|SHIPDAY\|mikegrowsgreens\|MikeGrowsGreens\|wincall\|Wincall" src/
```

Expected: zero results in application code (database name `wincall_brain` is infrastructure-only, acceptable).

---

## New Files to Create

- `src/lib/org-config.ts` — org configuration helper
- `src/app/api/settings/org-config/route.ts` — config CRUD API
- `migrations/XXX-org-configuration.sql` — config schema migration
- `migrations/XXX-rename-shipday-tables.sql` — table rename migration

## Files to Modify Extensively

- `src/lib/ai.ts` — dynamic system prompts (biggest change)
- `src/lib/types.ts` — generalize type names
- `src/lib/utils.ts` — configurable territory
- `src/lib/roi.ts` — make optional/pluggable
- `src/lib/db.ts` — rename queryShipday
- `src/components/layout/Sidebar.tsx` — dynamic branding
- `src/app/layout.tsx` — dynamic title
- `src/app/login/page.tsx` — generic branding
- Every AI-calling route (~15 files) — dynamic prompts
- Every email-sending route (~5 files) — per-org sender email
- Every Twilio route (~3 files) — per-org Twilio config
- Every n8n webhook route (~12 files) — per-org webhook URLs

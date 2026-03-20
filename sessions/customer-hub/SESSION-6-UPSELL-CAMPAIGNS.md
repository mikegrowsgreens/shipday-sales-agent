# Session 6: Upsell & Marketing Campaign System

## Goal
Build the campaign system that lets you segment customers, generate AI-powered upsell/marketing emails, and send targeted campaigns.

---

## Context

**Project:** SalesHub — `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/`
**Prereqs:** Sessions 1-5 complete (customers, import, list, detail, email history all working)
**AI Pattern:** `src/lib/ai.ts` — Claude integration for email generation (91KB, extensive)
**Existing campaign system:** `src/app/outbound/` + `src/app/api/bdr/campaigns/` — BDR outbound campaigns (this is for PROSPECTS, not existing customers)
**Email sending:** `src/lib/email.ts` — Raw SMTP implementation
**SMTP config:** Per-org SMTP settings in settings

---

## Campaign Types

| Type | Target | Goal |
|------|--------|------|
| **Upsell** | Customers on lower-tier plans | Upgrade to Premium Plus or Business Advanced |
| **Feature Adoption** | Active customers | Drive usage of underused features (locations, drivers) |
| **Retention** | At-risk customers (low health score, inactive) | Re-engage before churn |
| **Win-back** | Churned/inactive customers | Bring back to active status |
| **Review/Referral** | Healthy, active customers | Request reviews or referrals |
| **Announcement** | All or segment | New features, pricing changes, events |

---

## What to Build

### 1. Database: `crm.customer_campaigns` & `crm.customer_campaign_sends`

Already created in Session 1 (`crm.customer_campaigns`). Add sends table:

```sql
CREATE TABLE crm.customer_campaign_sends (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  campaign_id INTEGER REFERENCES crm.customer_campaigns(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES crm.customers(id),

  to_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,                    -- generated email HTML/text
  personalization_context JSONB, -- data used for personalization

  status TEXT DEFAULT 'draft',  -- draft, approved, scheduled, sent, delivered, opened, replied, bounced
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,

  gmail_message_id TEXT,
  gmail_thread_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. API Routes

**Campaign CRUD:**
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/customers/campaigns` | GET | List campaigns |
| `/api/customers/campaigns` | POST | Create campaign (name, type, target_segment) |
| `/api/customers/campaigns/[id]` | GET | Campaign detail + sends |
| `/api/customers/campaigns/[id]` | PUT | Update campaign |
| `/api/customers/campaigns/[id]` | DELETE | Delete campaign |

**Campaign Actions:**
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/customers/campaigns/[id]/generate` | POST | AI-generate emails for all recipients |
| `/api/customers/campaigns/[id]/preview` | POST | Preview a single generated email |
| `/api/customers/campaigns/[id]/send` | POST | Send approved emails |
| `/api/customers/campaigns/[id]/approve` | POST | Bulk approve draft emails |

**Segmentation:**
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/customers/segments` | POST | Preview segment (returns matching customer count + list) |

### 3. Segment Builder

File: `src/components/customers/CustomerSegmentFilter.tsx`

Filter criteria (combinable with AND):
- **Plan:** select one or more plans
- **Status:** active, inactive, churned
- **State:** WA, NV, etc.
- **Health Score:** range slider (0-100)
- **Avg Orders:** min/max
- **Avg Order Value:** min/max
- **Signup Date:** before/after
- **Last Active:** before/after (good for retention targeting)
- **Has Email History:** yes/no
- **Tags:** include/exclude specific tags

Segment preview: shows count + first 5 matching customers before creating campaign.

### 4. Campaign Builder Page

File: `src/app/customers/campaigns/page.tsx` (list)
File: `src/app/customers/campaigns/new/page.tsx` (create)
File: `src/app/customers/campaigns/[id]/page.tsx` (detail)

**Create Campaign Flow:**

Step 1 — Campaign Setup:
- Name (text input)
- Campaign type (dropdown: upsell, retention, feature_adoption, etc.)
- Target segment (segment builder)
- Preview audience count

Step 2 — Email Template:
- Subject line template (supports `{{business_name}}`, `{{contact_name}}`, `{{plan}}` variables)
- Body template (rich text or plain text)
- OR: "Generate with AI" button

Step 3 — AI Generation:
- Click "Generate Emails" → calls `/api/customers/campaigns/[id]/generate`
- AI generates personalized email for EACH customer using their context:
  - Current plan & plan features
  - Usage data (orders, drivers, locations)
  - Email history summary (if available)
  - Business name and contact name
  - Campaign type drives tone and CTA
- Shows progress bar during generation
- Results in draft emails for review

Step 4 — Review & Approve:
- List all generated emails
- Each email: recipient, subject, preview of body
- Click to expand full email
- Edit individual emails inline
- "Regenerate" button per email
- Bulk approve / approve individually

Step 5 — Send:
- Review final count
- Choose: send now or schedule
- "Send Campaign" button

### 5. AI Email Generation

File: Add new function to `src/lib/ai.ts`

```typescript
async function generateCustomerCampaignEmail(params: {
  customer: Customer;
  campaignType: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  emailHistory?: CustomerEmail[];
  orgConfig: OrgConfig;
}): Promise<{ subject: string; body: string }>
```

**Prompt strategy by campaign type:**

**Upsell:** Reference current plan limitations, show what the upgrade unlocks. Use their usage data to make the case (e.g., "You have 17 drivers on Elite Lite — Premium Plus supports unlimited drivers with priority routing").

**Retention:** Acknowledge their value, ask if there's anything you can help with, mention recent features they might not know about. Warm, personal tone.

**Feature Adoption:** Highlight specific features relevant to their usage pattern. If they have low location count, suggest multi-location benefits.

**Win-back:** Short, direct email. Acknowledge time away, mention what's new, offer incentive if appropriate.

**Review/Referral:** Thank them for being a customer, reference their time on platform, ask for review or referral with specific CTA.

### 6. Campaign List on Customer Dashboard

Add a "Campaigns" tab or section to `/customers` page showing:
- Active campaigns with status
- Quick-create buttons per campaign type
- Performance summary for completed campaigns

### 7. Campaign Performance

On campaign detail page (`/customers/campaigns/[id]`):
- Sent / Opened / Replied / Converted metrics
- Per-recipient status table
- Conversion = plan upgrade within 30 days of send

---

## Reference Files

- `src/lib/ai.ts` — AI generation patterns (follow existing style)
- `src/lib/org-config.ts` — Org persona, value props, branding
- `src/app/api/bdr/campaigns/generate-campaign/route.ts` — Existing campaign generation (for prospects)
- `src/components/outbound/CampaignBuilder.tsx` — Existing campaign builder UI
- `src/lib/email.ts` — SMTP email sending
- `src/lib/campaign-library.ts` — Campaign template library
- `CUSTOMER-HUB-PLAN.md` — Full plan reference

---

## AI Generation Context Loading

For each customer email, load this context for Claude:
```
Customer: {{business_name}}
Contact: {{contact_name}}
Current Plan: {{plan_display_name}}
Account Since: {{signup_date}}
Status: {{account_status}}
Locations: {{num_locations}} | Drivers: {{num_drivers}}
Avg Orders: {{avg_completed_orders}} | Avg Order Value: ${{avg_order_value}}
Recent Email History: (last 3 email subjects + snippets)
Campaign Goal: {{campaign_type description}}
```

---

## Validation

After completing:
1. Campaign creation flow works end-to-end (setup → segment → generate → review → send)
2. Segment builder correctly filters customers
3. AI generates personalized emails per customer with relevant context
4. Emails can be edited, regenerated, approved individually
5. Campaign sends emails via SMTP
6. Campaign metrics track sent/opened/replied
7. Campaign list page shows all campaigns with status
8. Upsell campaign correctly references plan upgrade benefits
9. Retention campaign has warm, personal tone
10. Campaign works with 1 customer (test) before bulk send

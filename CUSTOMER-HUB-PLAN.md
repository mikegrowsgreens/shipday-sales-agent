# Customer Hub - Implementation Plan

## Overview

Build a **Customer Management & Engagement Hub** inside SalesHub that centralizes current customer data, email history, plan information, and enables targeted upsell/marketing campaigns.

---

## Data Sources

### Sheet 1: "Audit" (Shipday Internal Audit)
- **Columns:** Name, Contact, Email, Phone, Plan, Current Plan, Account Status, Signup Date, Last Active, Locations, Notes
- **Plan tiers:** Branded Elite Lite, Branded Premium Plus, Business Advanced Lite, Business Advanced
- **Notes format:** `Drivers: X; Discount: Y%; ID: ZZZZZ`
- **Upgrade tabs:** September/August/July/June/May Upgrades — tracks plan changes with: Name, Plan (abbreviated: BAL, BP, Pro, Elite), Contact, Email, Close Date, Commission
- **Scale:** ~50-80 customers

### Sheet 2: "Copy of Mike Regional Customer List"
- **Columns:** email, company_id, address, state, account_plan, avg_completed_orders, Business, Customer Name, Average Order Value, Average Cost, (driver count)
- **Plan tiers:** BRANDED_ELITE, BRANDED_ELITE_CUSTOM
- **States:** WA, NV primarily
- **Has financial data:** avg order value, avg cost per order
- **Scale:** ~40+ customers

### Overlap
Both sheets share customers by email. The Audit sheet has plan tier detail + account status. The Regional list has financial/usage metrics. They need to be merged into a unified customer record.

---

## Architecture

### New Database Table: `crm.customers`

```sql
CREATE TABLE crm.customers (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id),

  -- Identity
  business_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,

  -- Shipday-specific
  shipday_company_id INTEGER,
  shipday_account_id TEXT,  -- from Notes "ID: XXXXX"

  -- Plan & Status
  account_plan TEXT,          -- normalized: branded_elite_lite, branded_premium_plus, etc.
  plan_display_name TEXT,     -- human readable
  account_status TEXT DEFAULT 'active',  -- active, inactive, churned, suspended
  signup_date DATE,
  last_active DATE,

  -- Usage & Financials
  num_locations INTEGER,
  num_drivers INTEGER,
  avg_completed_orders NUMERIC(10,2),
  avg_order_value NUMERIC(10,2),
  avg_cost_per_order NUMERIC(10,2),
  discount_pct NUMERIC(5,2),

  -- Engagement
  health_score INTEGER,       -- calculated: 1-100
  last_email_date TIMESTAMPTZ,
  last_email_subject TEXT,
  total_emails INTEGER DEFAULT 0,

  -- Context
  notes TEXT,
  tags TEXT[],
  custom_fields JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  imported_from TEXT           -- 'audit_sheet', 'regional_list', 'manual', 'csv'
);

CREATE INDEX idx_customers_org ON crm.customers(org_id);
CREATE INDEX idx_customers_email ON crm.customers(email);
CREATE INDEX idx_customers_plan ON crm.customers(account_plan);
CREATE INDEX idx_customers_status ON crm.customers(account_status);
```

### New Table: `crm.customer_emails`

```sql
CREATE TABLE crm.customer_emails (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  customer_id INTEGER REFERENCES crm.customers(id) ON DELETE CASCADE,

  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  direction TEXT NOT NULL,      -- 'inbound', 'outbound'
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  snippet TEXT,                  -- first ~200 chars
  body_preview TEXT,             -- first ~1000 chars
  date TIMESTAMPTZ,
  labels TEXT[],
  has_attachment BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_emails_customer ON crm.customer_emails(customer_id);
CREATE INDEX idx_customer_emails_thread ON crm.customer_emails(gmail_thread_id);
```

### New Table: `crm.customer_plan_changes`

```sql
CREATE TABLE crm.customer_plan_changes (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  customer_id INTEGER REFERENCES crm.customers(id) ON DELETE CASCADE,

  previous_plan TEXT,
  new_plan TEXT,
  change_type TEXT,             -- 'upgrade', 'downgrade', 'new'
  change_date DATE,
  commission NUMERIC(10,2),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New Table: `crm.customer_campaigns`

```sql
CREATE TABLE crm.customer_campaigns (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,

  name TEXT NOT NULL,
  campaign_type TEXT,           -- 'upsell', 'retention', 'winback', 'feature_adoption', 'review_request'
  target_segment JSONB,         -- filter criteria: {"plan": "branded_elite_lite", "min_orders": 50}

  subject_template TEXT,
  body_template TEXT,

  status TEXT DEFAULT 'draft',  -- draft, active, paused, completed

  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  conversion_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Feature Breakdown

### 1. Customer List Page (`/customers`)
- Filterable/searchable table of all current customers
- Quick filters: by plan tier, status, state, health score
- KPI bar: total customers, MRR estimate, avg order value, at-risk count
- Bulk actions: tag, export, enroll in campaign
- Sort by: name, plan, signup date, last active, order volume, health score

### 2. Customer Detail Page (`/customers/[id]`)
- **Header:** Business name, plan badge, health score, status
- **Contact tab:** Name, email, phone, address, custom fields
- **Email History tab:** Chronological email thread display (from Gmail scrape)
- **Plan & Billing tab:** Current plan, plan history/upgrades, commission, discount
- **Usage tab:** Drivers, locations, avg orders, avg order value, avg cost
- **Notes & Context tab:** Free-form notes, tags, AI-generated insights
- **Actions:** Send email, create campaign, log note, change plan status

### 3. CSV Import Pipeline
- Upload CSV from either sheet format
- Auto-detect which sheet format (Audit vs Regional)
- Field mapping with smart defaults
- Merge logic: match by email, upsert existing records
- Import upgrade history from upgrade tabs
- Parse Notes field for structured data (drivers, discount, ID)

### 4. Gmail Email Scraper (n8n workflow)
- Trigger: manual or scheduled (daily)
- For each customer email address:
  - Search Gmail for threads involving that address
  - Extract: subject, snippet, date, direction, thread ID
  - POST to `/api/customers/emails/sync` endpoint
- Store in `crm.customer_emails` table
- Display in customer detail page

### 5. Upsell/Marketing Campaign Builder
- Segment customers by: plan, usage, health score, state, last contact date
- AI-generated email content based on customer context (plan, usage data, email history)
- Campaign types: upsell (upgrade plan), retention (at-risk), feature adoption, review request
- Preview & approve flow before sending
- Track performance: opens, replies, conversions (plan upgrades)

### 6. Customer Health Scoring
- Calculated score (1-100) based on:
  - Last active date (recency)
  - Order volume trend
  - Email engagement (reply rate)
  - Plan tier
  - Time since signup
- Visual indicators: green (healthy), yellow (needs attention), red (at-risk)

---

## API Routes

```
GET    /api/customers              — List customers (with filters, pagination, search)
POST   /api/customers              — Create customer manually
GET    /api/customers/[id]         — Get customer detail
PUT    /api/customers/[id]         — Update customer
DELETE /api/customers/[id]         — Soft delete customer

POST   /api/customers/import       — CSV import (both sheet formats)
POST   /api/customers/import/upgrades — Import upgrade history
POST   /api/customers/export       — Export customers to CSV

GET    /api/customers/[id]/emails  — Get email history for customer
POST   /api/customers/emails/sync  — n8n webhook: sync Gmail emails

GET    /api/customers/[id]/plan-history — Get plan change history
POST   /api/customers/[id]/plan-change — Log plan change

GET    /api/customers/stats        — Dashboard KPIs (counts, MRR, health)
GET    /api/customers/segments     — Get segment breakdowns

POST   /api/customers/campaigns          — Create campaign
GET    /api/customers/campaigns          — List campaigns
GET    /api/customers/campaigns/[id]     — Campaign detail + recipients
POST   /api/customers/campaigns/[id]/generate — AI-generate emails for campaign
POST   /api/customers/campaigns/[id]/send     — Send campaign
POST   /api/customers/campaigns/[id]/preview  — Preview campaign emails
```

---

## UI Components

```
/components/customers/
  CustomerList.tsx          — Main table with filters
  CustomerCard.tsx          — Summary card (used in list & campaigns)
  CustomerDetail.tsx        — Full detail view with tabs
  CustomerImport.tsx        — CSV upload & field mapping
  EmailHistory.tsx          — Email thread display
  PlanBadge.tsx             — Visual plan tier badge
  HealthScore.tsx           — Health score indicator
  PlanHistory.tsx           — Plan change timeline
  CustomerCampaign.tsx      — Campaign builder
  CampaignPreview.tsx       — Preview generated emails
  CustomerSegmentFilter.tsx — Segment selector for campaigns
  CustomerKPIBar.tsx        — Dashboard KPI metrics
  CustomerNotes.tsx         — Notes editor with tags
```

---

## Session Breakdown

| Session | Focus | Est. Scope |
|---------|-------|------------|
| **Session 1** | Database schema + API foundation | Schema, migrations, core CRUD routes |
| **Session 2** | CSV Import Pipeline | Import logic for both sheet formats, field mapping, merge |
| **Session 3** | Customer List UI | `/customers` page, table, filters, KPI bar |
| **Session 4** | Customer Detail Page | `/customers/[id]` with all tabs |
| **Session 5** | Gmail Email Sync | n8n workflow + API endpoint + email history UI |
| **Session 6** | Upsell Campaign System | Campaign builder, AI generation, segment targeting |

---

## Navigation

Add "Customers" to sidebar between "Contacts" and "Sequences" with a `Users` icon from Lucide.

---

## Plan Tier Normalization Map

| Source (Audit Sheet) | Source (Regional) | Normalized Key | Display Name |
|---------------------|-------------------|----------------|--------------|
| Branded Elite Lite | BRANDED_ELITE | branded_elite_lite | Branded Elite Lite |
| Branded Premium Plus | — | branded_premium_plus | Branded Premium Plus |
| Business Advanced Lite | — | business_advanced_lite | Business Advanced Lite |
| Business Advanced | — | business_advanced | Business Advanced |
| — | BRANDED_ELITE_CUSTOM | branded_elite_custom | Branded Elite Custom |

Upgrade tab abbreviations: BAL = Business Advanced Lite, BP = Branded Premium, Pro = Pro, Elite = Elite

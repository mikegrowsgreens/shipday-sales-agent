-- Migration 016: Customer Hub
-- Creates tables for customer management, email history, plan tracking, and campaigns

-- ─── crm.customers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.customers (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,

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
  shipday_account_id TEXT,

  -- Plan & Status
  account_plan TEXT,
  plan_display_name TEXT,
  account_status TEXT DEFAULT 'active',
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
  health_score INTEGER DEFAULT 50,
  last_email_date TIMESTAMPTZ,
  last_email_subject TEXT,
  total_emails INTEGER DEFAULT 0,

  -- Context
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  imported_from TEXT,

  -- Unique constraint for upsert by email within org
  CONSTRAINT uq_customers_org_email UNIQUE (org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_customers_org ON crm.customers(org_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON crm.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_plan ON crm.customers(account_plan);
CREATE INDEX IF NOT EXISTS idx_customers_status ON crm.customers(account_status);
CREATE INDEX IF NOT EXISTS idx_customers_health ON crm.customers(health_score);

-- ─── crm.customer_emails ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.customer_emails (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  customer_id INTEGER REFERENCES crm.customers(id) ON DELETE CASCADE,

  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  direction TEXT NOT NULL,
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  snippet TEXT,
  body_preview TEXT,
  date TIMESTAMPTZ,
  labels TEXT[] DEFAULT '{}',
  has_attachment BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_customer_emails_msg UNIQUE (org_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_emails_customer ON crm.customer_emails(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_emails_thread ON crm.customer_emails(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_customer_emails_org ON crm.customer_emails(org_id);

-- ─── crm.customer_plan_changes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.customer_plan_changes (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  customer_id INTEGER REFERENCES crm.customers(id) ON DELETE CASCADE,

  previous_plan TEXT,
  new_plan TEXT,
  change_type TEXT,
  change_date DATE,
  commission NUMERIC(10,2),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_plan_changes_customer ON crm.customer_plan_changes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_plan_changes_org ON crm.customer_plan_changes(org_id);

-- ─── crm.customer_campaigns ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.customer_campaigns (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,

  name TEXT NOT NULL,
  campaign_type TEXT,
  target_segment JSONB DEFAULT '{}',

  subject_template TEXT,
  body_template TEXT,

  status TEXT DEFAULT 'draft',

  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  conversion_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_campaigns_org ON crm.customer_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_campaigns_status ON crm.customer_campaigns(status);

-- ─── crm.customer_campaign_sends ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm.customer_campaign_sends (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL,
  campaign_id INTEGER REFERENCES crm.customer_campaigns(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES crm.customers(id),

  to_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  personalization_context JSONB DEFAULT '{}',

  status TEXT DEFAULT 'draft',
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,

  gmail_message_id TEXT,
  gmail_thread_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON crm.customer_campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_customer ON crm.customer_campaign_sends(customer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_org ON crm.customer_campaign_sends(org_id);

-- ─── RLS Policies ────────────────────────────────────────────────────────────
DO $$ BEGIN
  -- customers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'customers_org_isolation') THEN
    ALTER TABLE crm.customers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY customers_org_isolation ON crm.customers
      USING (org_id = current_setting('app.current_org_id', true)::int);
  END IF;

  -- customer_emails
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_emails' AND policyname = 'customer_emails_org_isolation') THEN
    ALTER TABLE crm.customer_emails ENABLE ROW LEVEL SECURITY;
    CREATE POLICY customer_emails_org_isolation ON crm.customer_emails
      USING (org_id = current_setting('app.current_org_id', true)::int);
  END IF;

  -- customer_plan_changes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_plan_changes' AND policyname = 'customer_plan_changes_org_isolation') THEN
    ALTER TABLE crm.customer_plan_changes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY customer_plan_changes_org_isolation ON crm.customer_plan_changes
      USING (org_id = current_setting('app.current_org_id', true)::int);
  END IF;

  -- customer_campaigns
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_campaigns' AND policyname = 'customer_campaigns_org_isolation') THEN
    ALTER TABLE crm.customer_campaigns ENABLE ROW LEVEL SECURITY;
    CREATE POLICY customer_campaigns_org_isolation ON crm.customer_campaigns
      USING (org_id = current_setting('app.current_org_id', true)::int);
  END IF;

  -- customer_campaign_sends
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_campaign_sends' AND policyname = 'customer_campaign_sends_org_isolation') THEN
    ALTER TABLE crm.customer_campaign_sends ENABLE ROW LEVEL SECURITY;
    CREATE POLICY customer_campaign_sends_org_isolation ON crm.customer_campaign_sends
      USING (org_id = current_setting('app.current_org_id', true)::int);
  END IF;
END $$;

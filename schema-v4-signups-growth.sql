-- ═══════════════════════════════════════════════════════════════════════════════
-- Schema V4: Signups, LinkedIn & Growth Channels
-- Session 12 — Funnel tracking, cohort analysis, attribution, LinkedIn enrichment
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Extend shipday_signups with funnel tracking ─────────────────────────

ALTER TABLE crm.shipday_signups
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT DEFAULT 'signup'
    CHECK (funnel_stage IN ('signup', 'activation', 'first_delivery', 'retained', 'churned')),
  ADD COLUMN IF NOT EXISTS attribution_channel TEXT DEFAULT 'organic'
    CHECK (attribution_channel IN ('organic', 'email', 'linkedin', 'referral', 'paid', 'chat', 'cold_call', 'partner', 'other')),
  ADD COLUMN IF NOT EXISTS attribution_source TEXT,
  ADD COLUMN IF NOT EXISTS cohort_week DATE,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_delivery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS churned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_to_lead BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_to_lead_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES crm.contacts(contact_id);

-- Backfill cohort_week for existing signups
UPDATE crm.shipday_signups
SET cohort_week = DATE_TRUNC('week', COALESCE(signup_date, created_at))::date
WHERE cohort_week IS NULL;

-- Indexes for funnel queries
CREATE INDEX IF NOT EXISTS idx_signups_funnel_stage ON crm.shipday_signups(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_signups_attribution ON crm.shipday_signups(attribution_channel);
CREATE INDEX IF NOT EXISTS idx_signups_cohort_week ON crm.shipday_signups(cohort_week);
CREATE INDEX IF NOT EXISTS idx_signups_converted ON crm.shipday_signups(converted_to_lead) WHERE converted_to_lead = false;
CREATE INDEX IF NOT EXISTS idx_signups_contact_id ON crm.shipday_signups(contact_id);

-- ─── 2. Signup funnel events (track each stage transition) ──────────────────

CREATE TABLE IF NOT EXISTS crm.signup_funnel_events (
  event_id        SERIAL PRIMARY KEY,
  signup_id       INTEGER NOT NULL REFERENCES crm.shipday_signups(signup_id),
  from_stage      TEXT,
  to_stage        TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ DEFAULT NOW(),
  source          TEXT DEFAULT 'manual',
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_signup ON crm.signup_funnel_events(signup_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_stage ON crm.signup_funnel_events(to_stage);
CREATE INDEX IF NOT EXISTS idx_funnel_events_occurred ON crm.signup_funnel_events(occurred_at);

-- ─── 3. LinkedIn enrichment cache ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.linkedin_profiles (
  profile_id      SERIAL PRIMARY KEY,
  contact_id      INTEGER REFERENCES crm.contacts(contact_id),
  linkedin_url    TEXT UNIQUE,
  headline        TEXT,
  company_name    TEXT,
  company_size    TEXT,
  industry        TEXT,
  location        TEXT,
  role_title      TEXT,
  connections     INTEGER,
  profile_image   TEXT,
  summary         TEXT,
  experience      JSONB DEFAULT '[]'::jsonb,
  enriched_at     TIMESTAMPTZ DEFAULT NOW(),
  enrichment_source TEXT DEFAULT 'n8n',
  raw_data        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_li_profiles_contact ON crm.linkedin_profiles(contact_id);
CREATE INDEX IF NOT EXISTS idx_li_profiles_company ON crm.linkedin_profiles(company_name);
CREATE INDEX IF NOT EXISTS idx_li_profiles_industry ON crm.linkedin_profiles(industry);

-- ─── 4. LinkedIn activity log (supplements touchpoints with LI-specific data) ─

CREATE TABLE IF NOT EXISTS crm.linkedin_activity (
  activity_id     SERIAL PRIMARY KEY,
  contact_id      INTEGER REFERENCES crm.contacts(contact_id),
  action_type     TEXT NOT NULL CHECK (action_type IN ('connect', 'message', 'view', 'follow', 'like', 'comment', 'inmail')),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'declined', 'failed')),
  message         TEXT,
  n8n_execution_id TEXT,
  touchpoint_id   INTEGER REFERENCES crm.touchpoints(touchpoint_id),
  metadata        JSONB DEFAULT '{}'::jsonb,
  executed_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_li_activity_contact ON crm.linkedin_activity(contact_id);
CREATE INDEX IF NOT EXISTS idx_li_activity_type ON crm.linkedin_activity(action_type);
CREATE INDEX IF NOT EXISTS idx_li_activity_status ON crm.linkedin_activity(status);
CREATE INDEX IF NOT EXISTS idx_li_activity_date ON crm.linkedin_activity(executed_at);

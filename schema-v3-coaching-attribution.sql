-- Schema V3: Coaching, Queue Enhancements & Revenue Attribution
-- Database: wincall_brain
-- Schema: crm

-- ─── Revenue Attribution ──────────────────────────────────────────────────────
-- Track multi-touch attribution for closed deals

CREATE TABLE IF NOT EXISTS crm.deal_attribution (
  attribution_id SERIAL PRIMARY KEY,
  contact_id     INTEGER NOT NULL REFERENCES crm.contacts(contact_id) ON DELETE CASCADE,
  deal_stage     TEXT NOT NULL DEFAULT 'won',  -- won, lost
  deal_value     NUMERIC(10,2),                -- MRR value if known
  closed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Attribution chain (ordered touchpoint IDs that led to conversion)
  attribution_chain INTEGER[] DEFAULT '{}',    -- array of touchpoint_ids in order

  -- First/last touch shortcuts
  first_touch_id    INTEGER REFERENCES crm.touchpoints(touchpoint_id),
  last_touch_id     INTEGER REFERENCES crm.touchpoints(touchpoint_id),
  demo_touch_id     INTEGER REFERENCES crm.touchpoints(touchpoint_id),  -- the calendly booking

  -- Aggregated attribution metadata
  total_touches     INTEGER NOT NULL DEFAULT 0,
  days_to_close     INTEGER,
  channels_used     TEXT[] DEFAULT '{}',
  sequences_used    INTEGER[] DEFAULT '{}',     -- sequence_ids involved
  winning_angle     TEXT,                        -- email angle that drove engagement

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attribution_contact ON crm.deal_attribution(contact_id);
CREATE INDEX idx_attribution_stage ON crm.deal_attribution(deal_stage, closed_at DESC);

-- ─── Performance Benchmarks ───────────────────────────────────────────────────
-- Configurable daily/weekly goals

CREATE TABLE IF NOT EXISTS crm.performance_goals (
  goal_id    SERIAL PRIMARY KEY,
  metric     TEXT NOT NULL UNIQUE,  -- 'calls_daily', 'emails_daily', 'linkedin_daily', 'replies_weekly', 'demos_weekly'
  target     INTEGER NOT NULL,
  period     TEXT NOT NULL DEFAULT 'daily' CHECK (period IN ('daily', 'weekly', 'monthly')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default goals
INSERT INTO crm.performance_goals (metric, target, period) VALUES
  ('calls_daily', 15, 'daily'),
  ('emails_daily', 30, 'daily'),
  ('linkedin_daily', 10, 'daily'),
  ('sms_daily', 5, 'daily'),
  ('replies_weekly', 10, 'weekly'),
  ('demos_weekly', 3, 'weekly'),
  ('tasks_daily', 20, 'daily')
ON CONFLICT (metric) DO NOTHING;

-- ─── Task Queue Enhancements ──────────────────────────────────────────────────
-- Add snooze and source tracking

ALTER TABLE crm.task_queue ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
ALTER TABLE crm.task_queue ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';  -- 'sequence', 'hot_lead', 'reply', 'scheduled', 'manual'
ALTER TABLE crm.task_queue ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── Sequence Step Executions: add opened_at, clicked_at, replied_at if missing
ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS reply_sentiment TEXT;

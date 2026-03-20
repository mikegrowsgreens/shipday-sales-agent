-- ═══════════════════════════════════════════════════════════════════════════════
-- Schema v3: Contacts & CRM + Unified Inbox
-- ═══════════════════════════════════════════════════════════════════════════════

-- Saved segments for targeted outreach
CREATE TABLE IF NOT EXISTS crm.saved_segments (
  segment_id    SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  filters       JSONB NOT NULL DEFAULT '{}',   -- { stages: [], tags: [], search: "", score_min: 0, ... }
  contact_count INTEGER DEFAULT 0,
  is_default    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Contact merge history
CREATE TABLE IF NOT EXISTS crm.contact_merges (
  merge_id        SERIAL PRIMARY KEY,
  winner_id       INTEGER NOT NULL REFERENCES crm.contacts(contact_id),
  loser_id        INTEGER NOT NULL,               -- contact_id that was merged (may be deleted)
  loser_snapshot  JSONB NOT NULL DEFAULT '{}',     -- full snapshot of loser before merge
  merged_fields   TEXT[] DEFAULT '{}',             -- which fields were taken from loser
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Lifecycle automation rules
CREATE TABLE IF NOT EXISTS crm.lifecycle_rules (
  rule_id         SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  from_stage      TEXT NOT NULL,                   -- lifecycle_stage that triggers
  to_stage        TEXT NOT NULL,                   -- lifecycle_stage moved to
  action_type     TEXT NOT NULL,                   -- 'enroll_sequence' | 'create_task' | 'add_tag' | 'webhook'
  action_config   JSONB NOT NULL DEFAULT '{}',     -- { sequence_id: X } or { task_title: "...", priority: 5 }
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for inbox-style queries (inbound touchpoints)
CREATE INDEX IF NOT EXISTS idx_touchpoints_inbound
  ON crm.touchpoints (occurred_at DESC)
  WHERE direction = 'inbound';

CREATE INDEX IF NOT EXISTS idx_touchpoints_channel_inbound
  ON crm.touchpoints (channel, occurred_at DESC)
  WHERE direction = 'inbound';

-- Index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_contacts_email_lower
  ON crm.contacts (LOWER(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_cleaned
  ON crm.contacts (REGEXP_REPLACE(phone, '\D', '', 'g'))
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_business_lower
  ON crm.contacts (LOWER(business_name))
  WHERE business_name IS NOT NULL;

-- Add inbox_status to touchpoints for archive/snooze functionality
ALTER TABLE crm.touchpoints
  ADD COLUMN IF NOT EXISTS inbox_status TEXT DEFAULT 'active'
  CHECK (inbox_status IN ('active', 'archived', 'snoozed'));

ALTER TABLE crm.touchpoints
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

-- Trigger for updated_at on saved_segments
CREATE OR REPLACE FUNCTION crm.update_segment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_segment_updated ON crm.saved_segments;
CREATE TRIGGER trigger_segment_updated
  BEFORE UPDATE ON crm.saved_segments
  FOR EACH ROW EXECUTE FUNCTION crm.update_segment_timestamp();

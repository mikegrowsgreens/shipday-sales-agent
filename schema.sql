-- Shipday Sales Hub - CRM Schema
-- Database: wincall_brain
-- Schema: crm
-- Run once to create all tables for the unified CRM

CREATE SCHEMA IF NOT EXISTS crm;

-- ─── Contacts ────────────────────────────────────────────────────────────────
-- Single source of truth for all contacts. Links to source systems via ID fields.

CREATE TABLE crm.contacts (
  contact_id    SERIAL PRIMARY KEY,
  email         TEXT UNIQUE,
  phone         TEXT,
  first_name    TEXT,
  last_name     TEXT,
  business_name TEXT,
  title         TEXT,
  linkedin_url  TEXT,
  website       TEXT,

  -- Lifecycle & scoring
  lifecycle_stage TEXT NOT NULL DEFAULT 'raw'
    CHECK (lifecycle_stage IN ('raw','enriched','outreach','engaged','demo_completed','negotiation','won','lost','nurture')),
  lead_score       INTEGER NOT NULL DEFAULT 0,
  engagement_score INTEGER NOT NULL DEFAULT 0,

  -- Foreign keys to source systems (text IDs for cross-DB compatibility)
  bdr_lead_id     TEXT,   -- → bdr.leads(lead_id)
  shipday_deal_id TEXT,   -- → defaultdb.shipday.deals(deal_id)
  wincall_deal_id TEXT,   -- → public.deals(deal_id)
  li_prospect_id  TEXT,   -- → public.li_prospects(id)

  tags     TEXT[] DEFAULT '{}',
  metadata JSONB  DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_lifecycle ON crm.contacts(lifecycle_stage);
CREATE INDEX idx_contacts_score ON crm.contacts(lead_score DESC);
CREATE INDEX idx_contacts_bdr ON crm.contacts(bdr_lead_id) WHERE bdr_lead_id IS NOT NULL;
CREATE INDEX idx_contacts_shipday ON crm.contacts(shipday_deal_id) WHERE shipday_deal_id IS NOT NULL;
CREATE INDEX idx_contacts_wincall ON crm.contacts(wincall_deal_id) WHERE wincall_deal_id IS NOT NULL;
CREATE INDEX idx_contacts_business ON crm.contacts(business_name);

-- ─── Touchpoints ─────────────────────────────────────────────────────────────
-- Universal event log for ALL interactions across all channels.

CREATE TABLE crm.touchpoints (
  touchpoint_id SERIAL PRIMARY KEY,
  contact_id    INTEGER NOT NULL REFERENCES crm.contacts(contact_id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('email','phone','linkedin','sms','calendly','fathom','manual')),
  event_type    TEXT NOT NULL,  -- e.g. 'sent','opened','replied','connected','voicemail','booked','profile_viewed'
  direction     TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound','outbound')),
  source_system TEXT NOT NULL DEFAULT 'saleshub', -- 'saleshub','bdr','postdemo','wincall','n8n'
  subject       TEXT,
  body_preview  TEXT,
  metadata      JSONB DEFAULT '{}',  -- channel-specific data (gmail_id, twilio_sid, recording_url, etc.)
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_touchpoints_contact ON crm.touchpoints(contact_id, occurred_at DESC);
CREATE INDEX idx_touchpoints_channel ON crm.touchpoints(channel, occurred_at DESC);
CREATE INDEX idx_touchpoints_event ON crm.touchpoints(event_type);
CREATE INDEX idx_touchpoints_date ON crm.touchpoints(occurred_at DESC);

-- ─── Sequences ───────────────────────────────────────────────────────────────
-- Multitouch sequence definitions (like Outreach.io sequences).

CREATE TABLE crm.sequences (
  sequence_id     SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  pause_on_reply  BOOLEAN NOT NULL DEFAULT true,
  pause_on_booking BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Sequence Steps ──────────────────────────────────────────────────────────
-- Ordered steps within a sequence.

CREATE TABLE crm.sequence_steps (
  step_id           SERIAL PRIMARY KEY,
  sequence_id       INTEGER NOT NULL REFERENCES crm.sequences(sequence_id) ON DELETE CASCADE,
  step_order        INTEGER NOT NULL,
  step_type         TEXT NOT NULL CHECK (step_type IN ('email','phone','linkedin','sms','manual')),
  delay_days        INTEGER NOT NULL DEFAULT 0,
  send_window_start TIME,          -- e.g. 09:00
  send_window_end   TIME,          -- e.g. 17:00
  subject_template  TEXT,          -- for email/sms: supports {{first_name}}, {{business_name}} vars
  body_template     TEXT,
  task_instructions TEXT,          -- for phone/linkedin/manual: what to do
  variant_label     TEXT,          -- A/B test variant identifier
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(sequence_id, step_order)
);

CREATE INDEX idx_steps_sequence ON crm.sequence_steps(sequence_id, step_order);

-- ─── Sequence Enrollments ────────────────────────────────────────────────────
-- Contacts currently enrolled in sequences.

CREATE TABLE crm.sequence_enrollments (
  enrollment_id SERIAL PRIMARY KEY,
  contact_id    INTEGER NOT NULL REFERENCES crm.contacts(contact_id) ON DELETE CASCADE,
  sequence_id   INTEGER NOT NULL REFERENCES crm.sequences(sequence_id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed','replied','booked')),
  current_step  INTEGER NOT NULL DEFAULT 1,
  next_step_at  TIMESTAMPTZ,
  paused_reason TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(contact_id, sequence_id)
);

CREATE INDEX idx_enrollments_active ON crm.sequence_enrollments(status, next_step_at)
  WHERE status = 'active';
CREATE INDEX idx_enrollments_contact ON crm.sequence_enrollments(contact_id);

-- ─── Sequence Step Executions ────────────────────────────────────────────────
-- Per-step execution tracking within an enrollment.

CREATE TABLE crm.sequence_step_executions (
  execution_id    SERIAL PRIMARY KEY,
  enrollment_id   INTEGER NOT NULL REFERENCES crm.sequence_enrollments(enrollment_id) ON DELETE CASCADE,
  step_id         INTEGER NOT NULL REFERENCES crm.sequence_steps(step_id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','delivered','opened','clicked','replied','bounced','failed','completed','skipped')),
  gmail_message_id TEXT,
  twilio_sid       TEXT,
  variant_label    TEXT,
  error_message    TEXT,
  executed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_executions_enrollment ON crm.sequence_step_executions(enrollment_id);
CREATE INDEX idx_executions_status ON crm.sequence_step_executions(status);

-- ─── Task Queue ──────────────────────────────────────────────────────────────
-- Manual tasks for Mike (calls to make, LinkedIn messages to send, etc.)

CREATE TABLE crm.task_queue (
  task_id       SERIAL PRIMARY KEY,
  contact_id    INTEGER NOT NULL REFERENCES crm.contacts(contact_id) ON DELETE CASCADE,
  enrollment_id INTEGER REFERENCES crm.sequence_enrollments(enrollment_id) ON DELETE SET NULL,
  step_id       INTEGER REFERENCES crm.sequence_steps(step_id) ON DELETE SET NULL,
  task_type     TEXT NOT NULL CHECK (task_type IN ('call','linkedin_connect','linkedin_message','linkedin_view','sms','manual','email_review')),
  title         TEXT NOT NULL,
  instructions  TEXT,
  priority      INTEGER NOT NULL DEFAULT 5,  -- 1=highest, 10=lowest
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped')),
  outcome       TEXT,
  due_at        TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_pending ON crm.task_queue(status, priority, due_at)
  WHERE status IN ('pending','in_progress');
CREATE INDEX idx_tasks_contact ON crm.task_queue(contact_id);

-- ─── Calendly Events ─────────────────────────────────────────────────────────
-- Calendly bookings synced via webhook + Google Sheet.

CREATE TABLE crm.calendly_events (
  calendly_id       SERIAL PRIMARY KEY,
  contact_id        INTEGER REFERENCES crm.contacts(contact_id) ON DELETE SET NULL,
  event_type        TEXT,          -- 'Discovery Call', '30-min Demo', etc.
  event_name        TEXT,
  invitee_name      TEXT,
  invitee_email     TEXT,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER,
  location          TEXT,
  cancelled         BOOLEAN NOT NULL DEFAULT false,
  cancel_reason     TEXT,
  calendly_event_uri TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendly_contact ON crm.calendly_events(contact_id);
CREATE INDEX idx_calendly_scheduled ON crm.calendly_events(scheduled_at DESC);
CREATE INDEX idx_calendly_email ON crm.calendly_events(invitee_email);

-- ─── SMS Messages ────────────────────────────────────────────────────────────
-- Twilio SMS send/receive tracking.

CREATE TABLE crm.sms_messages (
  sms_id      SERIAL PRIMARY KEY,
  contact_id  INTEGER REFERENCES crm.contacts(contact_id) ON DELETE SET NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_number TEXT NOT NULL,
  to_number   TEXT NOT NULL,
  body        TEXT NOT NULL,
  twilio_sid  TEXT,
  status      TEXT NOT NULL DEFAULT 'queued',  -- queued, sent, delivered, failed, received
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sms_contact ON crm.sms_messages(contact_id, created_at DESC);
CREATE INDEX idx_sms_twilio ON crm.sms_messages(twilio_sid) WHERE twilio_sid IS NOT NULL;

-- ─── Shipday Signups ─────────────────────────────────────────────────────────
-- Signups from Shipday internal dashboard, filtered to Mike's territory.

CREATE TABLE crm.shipday_signups (
  signup_id        SERIAL PRIMARY KEY,
  business_name    TEXT,
  contact_name     TEXT,
  contact_email    TEXT,
  contact_phone    TEXT,
  plan_type        TEXT,
  state            TEXT,
  city             TEXT,
  phone_area_code  INTEGER,
  territory_match  BOOLEAN NOT NULL DEFAULT false,
  shipday_account_id TEXT,
  signup_date      DATE,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signups_territory ON crm.shipday_signups(territory_match, signup_date DESC)
  WHERE territory_match = true;
CREATE INDEX idx_signups_email ON crm.shipday_signups(contact_email) WHERE contact_email IS NOT NULL;

-- ─── Phone Calls (Twilio Voice) ──────────────────────────────────────────────
-- Outbound call log for click-to-call feature.

CREATE TABLE crm.phone_calls (
  call_id        SERIAL PRIMARY KEY,
  contact_id     INTEGER REFERENCES crm.contacts(contact_id) ON DELETE SET NULL,
  enrollment_id  INTEGER REFERENCES crm.sequence_enrollments(enrollment_id) ON DELETE SET NULL,
  step_id        INTEGER REFERENCES crm.sequence_steps(step_id) ON DELETE SET NULL,
  twilio_call_sid TEXT,
  from_number    TEXT NOT NULL,
  to_number      TEXT NOT NULL,
  direction      TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound','outbound')),
  status         TEXT NOT NULL DEFAULT 'initiated',  -- initiated, ringing, in-progress, completed, busy, no-answer, failed
  disposition    TEXT,  -- connected, voicemail, no-answer, busy, wrong-number
  duration_secs  INTEGER,
  recording_url  TEXT,
  recording_sid  TEXT,
  notes          TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calls_contact ON crm.phone_calls(contact_id, started_at DESC);
CREATE INDEX idx_calls_twilio ON crm.phone_calls(twilio_call_sid) WHERE twilio_call_sid IS NOT NULL;

-- ─── Updated-at trigger function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION crm.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contacts_updated
  BEFORE UPDATE ON crm.contacts
  FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at();

CREATE TRIGGER trg_sequences_updated
  BEFORE UPDATE ON crm.sequences
  FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at();

CREATE TRIGGER trg_enrollments_updated
  BEFORE UPDATE ON crm.sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION crm.update_updated_at();

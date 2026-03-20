-- ============================================================================
-- Migration 016: Scheduling System Tables
-- Built-in Calendly replacement with Google Meet/Zoom, AI agendas,
-- custom branding, and full CRM integration.
-- ============================================================================

BEGIN;

-- ─── Calendar Connections ──────────────────────────────────────────────────
-- OAuth tokens for Google Calendar and Zoom (encrypted at rest).

CREATE TABLE IF NOT EXISTS crm.calendar_connections (
  connection_id   SERIAL PRIMARY KEY,
  org_id          INTEGER NOT NULL REFERENCES crm.organizations(org_id),
  user_id         INTEGER NOT NULL REFERENCES crm.users(user_id),
  provider        TEXT NOT NULL CHECK (provider IN ('google', 'zoom')),
  account_email   TEXT NOT NULL,
  access_token    TEXT NOT NULL,       -- AES-256-GCM encrypted
  refresh_token   TEXT,                -- AES-256-GCM encrypted
  token_expires_at TIMESTAMPTZ,
  scopes          TEXT[] DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_cal_conn_org_user ON crm.calendar_connections(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cal_conn_provider ON crm.calendar_connections(provider) WHERE is_active = true;

-- ─── Scheduling Event Types ────────────────────────────────────────────────
-- Defines bookable meeting types (e.g., "30-min Discovery Call").

CREATE TABLE IF NOT EXISTS crm.scheduling_event_types (
  event_type_id    SERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL REFERENCES crm.organizations(org_id),
  host_user_id     INTEGER NOT NULL REFERENCES crm.users(user_id),
  availability_id  INTEGER,  -- FK added after availability table created

  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  description      TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  color            TEXT DEFAULT '#3B82F6',

  location_type    TEXT NOT NULL DEFAULT 'google_meet'
    CHECK (location_type IN ('google_meet', 'zoom', 'phone', 'in_person', 'custom')),
  location_value   TEXT,  -- custom URL or address if applicable

  buffer_before    INTEGER NOT NULL DEFAULT 0,   -- minutes before
  buffer_after     INTEGER NOT NULL DEFAULT 0,   -- minutes after
  min_notice       INTEGER NOT NULL DEFAULT 60,  -- minutes ahead booking is allowed
  max_days_ahead   INTEGER NOT NULL DEFAULT 60,  -- how far in future
  max_per_day      INTEGER,                       -- null = unlimited

  custom_questions JSONB DEFAULT '[]',  -- [{type, label, required, options?}]
  ai_agenda_enabled BOOLEAN NOT NULL DEFAULT false,

  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_sched_evt_org ON crm.scheduling_event_types(org_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sched_evt_host ON crm.scheduling_event_types(host_user_id);
CREATE INDEX IF NOT EXISTS idx_sched_evt_slug ON crm.scheduling_event_types(org_id, slug);

-- ─── Scheduling Availability ───────────────────────────────────────────────
-- Weekly availability templates. Each user can have multiple schedules.

CREATE TABLE IF NOT EXISTS crm.scheduling_availability (
  availability_id  SERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL REFERENCES crm.organizations(org_id),
  user_id          INTEGER NOT NULL REFERENCES crm.users(user_id),

  name             TEXT NOT NULL DEFAULT 'Default',
  timezone         TEXT NOT NULL DEFAULT 'America/Chicago',
  is_default       BOOLEAN NOT NULL DEFAULT false,

  -- JSONB: { "monday": [{"start":"09:00","end":"17:00"}], ... }
  weekly_hours     JSONB NOT NULL DEFAULT '{
    "monday":    [{"start":"09:00","end":"17:00"}],
    "tuesday":   [{"start":"09:00","end":"17:00"}],
    "wednesday": [{"start":"09:00","end":"17:00"}],
    "thursday":  [{"start":"09:00","end":"17:00"}],
    "friday":    [{"start":"09:00","end":"17:00"}],
    "saturday":  [],
    "sunday":    []
  }',

  -- JSONB: { "2026-03-20": [{"start":"10:00","end":"14:00"}], "2026-03-25": [] }
  date_overrides   JSONB NOT NULL DEFAULT '{}',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_avail_org_user ON crm.scheduling_availability(org_id, user_id);

-- Now add the FK from event_types to availability
ALTER TABLE crm.scheduling_event_types
  ADD CONSTRAINT fk_event_type_availability
  FOREIGN KEY (availability_id) REFERENCES crm.scheduling_availability(availability_id);

-- ─── Scheduling Bookings ───────────────────────────────────────────────────
-- Every booked meeting.

CREATE TABLE IF NOT EXISTS crm.scheduling_bookings (
  booking_id       SERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL REFERENCES crm.organizations(org_id),
  event_type_id    INTEGER NOT NULL REFERENCES crm.scheduling_event_types(event_type_id),
  host_user_id     INTEGER NOT NULL REFERENCES crm.users(user_id),
  contact_id       INTEGER REFERENCES crm.contacts(contact_id),

  -- Invitee info (always stored even if no contact match)
  invitee_name     TEXT NOT NULL,
  invitee_email    TEXT NOT NULL,
  invitee_phone    TEXT,
  invitee_timezone TEXT NOT NULL,

  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,

  status           TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled')),

  location_type    TEXT NOT NULL,
  meeting_url      TEXT,
  google_event_id  TEXT,
  zoom_meeting_id  TEXT,

  cancel_token     TEXT NOT NULL UNIQUE,
  cancel_reason    TEXT,
  rescheduled_to   INTEGER REFERENCES crm.scheduling_bookings(booking_id),

  answers          JSONB DEFAULT '{}',    -- answers to custom questions
  ai_agenda        TEXT,                   -- AI-generated agenda markdown
  metadata         JSONB DEFAULT '{}',

  reminder_24h_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_1h_sent  BOOLEAN NOT NULL DEFAULT false,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_book_org ON crm.scheduling_bookings(org_id);
CREATE INDEX IF NOT EXISTS idx_sched_book_host_date ON crm.scheduling_bookings(host_user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_sched_book_status ON crm.scheduling_bookings(status) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_sched_book_cancel ON crm.scheduling_bookings(cancel_token);
CREATE INDEX IF NOT EXISTS idx_sched_book_contact ON crm.scheduling_bookings(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sched_book_event_type ON crm.scheduling_bookings(event_type_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_sched_book_reminders ON crm.scheduling_bookings(starts_at)
  WHERE status = 'confirmed' AND (reminder_24h_sent = false OR reminder_1h_sent = false);

-- ─── Scheduling Webhook Log ────────────────────────────────────────────────
-- Audit trail for outbound webhook deliveries on booking events.

CREATE TABLE IF NOT EXISTS crm.scheduling_webhook_log (
  log_id           SERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL REFERENCES crm.organizations(org_id),
  booking_id       INTEGER REFERENCES crm.scheduling_bookings(booking_id),
  event_name       TEXT NOT NULL,  -- booking.created, booking.cancelled, etc.
  webhook_url      TEXT NOT NULL,
  request_body     JSONB,
  response_status  INTEGER,
  response_body    TEXT,
  success          BOOLEAN NOT NULL DEFAULT false,
  attempted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_webhook_org ON crm.scheduling_webhook_log(org_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sched_webhook_booking ON crm.scheduling_webhook_log(booking_id);

-- ─── Row-Level Security ────────────────────────────────────────────────────

ALTER TABLE crm.calendar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.calendar_connections
  USING (org_id = current_setting('app.current_org_id', true)::integer);
ALTER TABLE crm.calendar_connections FORCE ROW LEVEL SECURITY;

ALTER TABLE crm.scheduling_event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.scheduling_event_types
  USING (org_id = current_setting('app.current_org_id', true)::integer);
ALTER TABLE crm.scheduling_event_types FORCE ROW LEVEL SECURITY;

ALTER TABLE crm.scheduling_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.scheduling_availability
  USING (org_id = current_setting('app.current_org_id', true)::integer);
ALTER TABLE crm.scheduling_availability FORCE ROW LEVEL SECURITY;

ALTER TABLE crm.scheduling_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.scheduling_bookings
  USING (org_id = current_setting('app.current_org_id', true)::integer);
ALTER TABLE crm.scheduling_bookings FORCE ROW LEVEL SECURITY;

ALTER TABLE crm.scheduling_webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.scheduling_webhook_log
  USING (org_id = current_setting('app.current_org_id', true)::integer);
ALTER TABLE crm.scheduling_webhook_log FORCE ROW LEVEL SECURITY;

COMMIT;

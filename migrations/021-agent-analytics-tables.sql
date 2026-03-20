-- Migration 021: Agent Analytics Tables
-- Creates/updates tables queried by /api/analytics/chatbot, /api/analytics/voice,
-- and /api/analytics/brain-health endpoints.

-- ─── brain.conversation_outcomes ─────────────────────────────────────────────
-- Tracks chatbot conversation results: qualification progress, outcomes, objections.
-- Queried by chatbot analytics and brain-health training queue.

CREATE TABLE IF NOT EXISTS brain.conversation_outcomes (
  id              SERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL UNIQUE,
  org_id          INTEGER NOT NULL,
  messages_count  INTEGER DEFAULT 0,
  demo_booked     BOOLEAN DEFAULT FALSE,
  lead_captured   BOOLEAN DEFAULT FALSE,
  terminal_state  TEXT CHECK (terminal_state IN ('completed', 'abandoned', 'escalated', 'in_progress')),
  qualification_completeness NUMERIC DEFAULT 0 CHECK (qualification_completeness >= 0 AND qualification_completeness <= 100),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  objections_raised TEXT[] DEFAULT '{}',
  effective_patterns TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_outcomes_org ON brain.conversation_outcomes (org_id);
CREATE INDEX IF NOT EXISTS idx_conversation_outcomes_started ON brain.conversation_outcomes (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_outcomes_terminal ON brain.conversation_outcomes (terminal_state);

ALTER TABLE brain.conversation_outcomes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY conversation_outcomes_tenant_isolation ON brain.conversation_outcomes
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY conversation_outcomes_tenant_insert ON brain.conversation_outcomes
    FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── brain.external_intelligence — add missing columns ──────────────────────
-- The table already exists from a prior migration but is missing columns
-- needed by the brain-health analytics endpoint.

ALTER TABLE brain.external_intelligence ADD COLUMN IF NOT EXISTS intel_type TEXT;
ALTER TABLE brain.external_intelligence ADD COLUMN IF NOT EXISTS competitor_name TEXT;
ALTER TABLE brain.external_intelligence ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE brain.external_intelligence ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE brain.external_intelligence ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_external_intel_type ON brain.external_intelligence (intel_type);
CREATE INDEX IF NOT EXISTS idx_external_intel_verified ON brain.external_intelligence (verified) WHERE verified = FALSE;

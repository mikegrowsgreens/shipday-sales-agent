-- Migration 017: Voice Agent Calls Table
-- Stores AI voice agent call records with full transcript, qualification data,
-- and conversation metadata for analytics and learning.

-- Voice agent call records
CREATE TABLE IF NOT EXISTS crm.voice_agent_calls (
  id              SERIAL PRIMARY KEY,
  call_sid        TEXT NOT NULL UNIQUE,
  session_id      TEXT NOT NULL,
  contact_id      INTEGER REFERENCES crm.contacts(contact_id) ON DELETE SET NULL,
  org_id          INTEGER,
  direction       TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  status          TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'in_progress', 'completed', 'transferred', 'failed', 'voicemail')),
  duration_seconds INTEGER DEFAULT 0,
  messages_count  INTEGER DEFAULT 0,
  transcript      TEXT,
  qualification_slots JSONB DEFAULT '{}',
  computed_roi    TEXT,
  final_stage     TEXT,
  handoff_triggered BOOLEAN DEFAULT FALSE,
  handoff_reason  TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_voice_calls_contact ON crm.voice_agent_calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_org ON crm.voice_agent_calls(org_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_started ON crm.voice_agent_calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_calls_status ON crm.voice_agent_calls(status);
CREATE INDEX IF NOT EXISTS idx_voice_calls_call_sid ON crm.voice_agent_calls(call_sid);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION crm.update_voice_agent_calls_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voice_agent_calls_updated ON crm.voice_agent_calls;
CREATE TRIGGER trg_voice_agent_calls_updated
  BEFORE UPDATE ON crm.voice_agent_calls
  FOR EACH ROW
  EXECUTE FUNCTION crm.update_voice_agent_calls_updated_at();

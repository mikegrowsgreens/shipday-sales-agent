-- Migration 019: Campaign AI Steps
-- Tracks AI chat and AI call step executions triggered by outbound campaigns.
-- Referenced by: /api/campaigns/chat-link, /api/campaigns/voice-trigger, /api/leads/warm

BEGIN;

CREATE TABLE IF NOT EXISTS bdr.campaign_ai_steps (
  id              SERIAL PRIMARY KEY,
  lead_id         INTEGER NOT NULL,
  campaign_email_id INTEGER NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('ai_chat', 'ai_call')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'link_sent', 'chat_started', 'call_initiated', 'completed', 'no_response', 'failed')),
  tracking_token  TEXT UNIQUE,
  campaign_context JSONB DEFAULT '{}',
  conversation_id TEXT,
  call_sid        TEXT,
  outcome         TEXT,
  org_id          INTEGER NOT NULL DEFAULT 1,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for tracking token lookups (chat-link redirect)
CREATE INDEX IF NOT EXISTS idx_campaign_ai_steps_token
  ON bdr.campaign_ai_steps (tracking_token) WHERE tracking_token IS NOT NULL;

-- Index for lead-based queries (warm leads aggregation)
CREATE INDEX IF NOT EXISTS idx_campaign_ai_steps_lead
  ON bdr.campaign_ai_steps (lead_id, channel, status);

-- Index for org scoping
CREATE INDEX IF NOT EXISTS idx_campaign_ai_steps_org
  ON bdr.campaign_ai_steps (org_id, status);

COMMIT;

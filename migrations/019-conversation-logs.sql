-- Session 8: PII-redacted conversation logs for compliance
-- Stores redacted conversation transcripts from both chatbot and voice agent

CREATE TABLE IF NOT EXISTS brain.conversation_logs (
  id SERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL DEFAULT 1,
  messages_redacted JSONB NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  had_pii_redactions BOOLEAN NOT NULL DEFAULT FALSE,
  channel TEXT NOT NULL DEFAULT 'chat',  -- 'chat' or 'voice'
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_logs_org
  ON brain.conversation_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_channel
  ON brain.conversation_logs (channel);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_redactions
  ON brain.conversation_logs (had_pii_redactions) WHERE had_pii_redactions = TRUE;
CREATE INDEX IF NOT EXISTS idx_conversation_logs_logged
  ON brain.conversation_logs (logged_at DESC);

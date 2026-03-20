-- ============================================================================
-- Session 14f: Usage tracking for plan enforcement
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS crm.usage_events (
  id         SERIAL PRIMARY KEY,
  org_id     INTEGER NOT NULL REFERENCES crm.organizations(org_id),
  event_type TEXT NOT NULL,
  count      INTEGER DEFAULT 1,
  period     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, event_type, period)
);

CREATE INDEX IF NOT EXISTS idx_usage_org_period ON crm.usage_events(org_id, period, event_type);

COMMIT;

-- ============================================================================
-- Session 14f: Audit logging
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS crm.audit_log (
  id            SERIAL PRIMARY KEY,
  org_id        INTEGER NOT NULL,
  user_id       INTEGER,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  details       JSONB,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org ON crm.audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON crm.audit_log(action, created_at DESC);

COMMIT;

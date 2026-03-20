-- ============================================================================
-- SalesHub Multi-Tenant Foundation
-- Adds org + user tables and nullable org_id to key tables for future tenancy.
-- Backward-compatible: existing data gets org_id = 1 (default org).
-- ============================================================================

BEGIN;

-- ─── Organizations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.organizations (
  org_id       SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  logo_url     TEXT,
  domain       TEXT,
  settings     JSONB DEFAULT '{}',
  plan         TEXT DEFAULT 'starter', -- starter, pro, enterprise
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Default org for existing single-tenant data
INSERT INTO crm.organizations (org_id, name, slug, domain, plan)
VALUES (1, 'Shipday', 'shipday', 'shipday.com', 'pro')
ON CONFLICT (org_id) DO NOTHING;

-- ─── Users ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.users (
  user_id       SERIAL PRIMARY KEY,
  org_id        INT NOT NULL REFERENCES crm.organizations(org_id),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT DEFAULT 'member', -- admin, manager, member
  avatar_url    TEXT,
  settings      JSONB DEFAULT '{}',
  is_active     BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Default admin user (password set via app, not in SQL)
-- INSERT INTO crm.users (...) handled via API or seed script

-- ─── Add org_id to key tables (nullable for backward compat) ────────────────

DO $$ BEGIN
  ALTER TABLE crm.contacts ADD COLUMN IF NOT EXISTS org_id INT REFERENCES crm.organizations(org_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm.sequences ADD COLUMN IF NOT EXISTS org_id INT REFERENCES crm.organizations(org_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm.task_queue ADD COLUMN IF NOT EXISTS org_id INT REFERENCES crm.organizations(org_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm.touchpoints ADD COLUMN IF NOT EXISTS org_id INT REFERENCES crm.organizations(org_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Backfill existing data to default org
UPDATE crm.contacts SET org_id = 1 WHERE org_id IS NULL;
UPDATE crm.sequences SET org_id = 1 WHERE org_id IS NULL;
UPDATE crm.task_queue SET org_id = 1 WHERE org_id IS NULL;
UPDATE crm.touchpoints SET org_id = 1 WHERE org_id IS NULL;

-- ─── API Keys for integrations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.api_keys (
  key_id       SERIAL PRIMARY KEY,
  org_id       INT NOT NULL REFERENCES crm.organizations(org_id),
  key_name     TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,          -- first 8 chars for display
  key_hash     TEXT NOT NULL,          -- bcrypt hash of full key
  permissions  TEXT[] DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_org ON crm.users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON crm.users(email);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON crm.contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_sequences_org ON crm.sequences(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON crm.api_keys(org_id);

COMMIT;

-- ============================================================================
-- Session 14f: Auth tables for self-serve signup
-- Email verifications, password resets, invitations
-- ============================================================================

BEGIN;

-- ─── Email Verifications ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.email_verifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES crm.users(user_id),
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON crm.email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON crm.email_verifications(user_id);

-- ─── Password Resets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES crm.users(user_id),
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON crm.password_resets(token);

-- ─── Invitations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm.invitations (
  id         SERIAL PRIMARY KEY,
  org_id     INTEGER NOT NULL REFERENCES crm.organizations(org_id),
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  invited_by INTEGER REFERENCES crm.users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON crm.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON crm.invitations(org_id);

-- ─── Add email_verified to users ─────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE crm.users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Backfill existing users as verified
UPDATE crm.users SET email_verified = true WHERE email_verified IS NULL;

COMMIT;

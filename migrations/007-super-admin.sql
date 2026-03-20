-- ============================================================================
-- Session 14f: Super-admin flag and soft-delete support
-- ============================================================================

BEGIN;

-- Add super-admin flag to users
DO $$ BEGIN
  ALTER TABLE crm.users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add soft-delete support to organizations
DO $$ BEGIN
  ALTER TABLE crm.organizations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

COMMIT;

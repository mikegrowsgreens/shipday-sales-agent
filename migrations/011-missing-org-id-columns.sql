-- Migration 011: Add org_id to tables that were missed in migration 008
-- Tables: crm.calendly_events, crm.sms_messages, crm.inbound_leads, crm.phone_calls
-- Also adds RLS policies for these tables.

BEGIN;

-- ============================================================================
-- 1. Add org_id column to missing CRM tables
-- ============================================================================

-- crm.calendly_events
DO $$ BEGIN
  ALTER TABLE crm.calendly_events ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE crm.calendly_events SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE crm.calendly_events ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE crm.calendly_events ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- crm.sms_messages
DO $$ BEGIN
  ALTER TABLE crm.sms_messages ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE crm.sms_messages SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE crm.sms_messages ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE crm.sms_messages ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- crm.inbound_leads
DO $$ BEGIN
  ALTER TABLE crm.inbound_leads ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE crm.inbound_leads SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE crm.inbound_leads ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE crm.inbound_leads ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- crm.phone_calls
DO $$ BEGIN
  ALTER TABLE crm.phone_calls ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE crm.phone_calls SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE crm.phone_calls ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE crm.phone_calls ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- 2. Create indexes for org_id filtering
-- ============================================================================

DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_calendly_events_org ON crm.calendly_events(org_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_sms_messages_org ON crm.sms_messages(org_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_inbound_leads_org ON crm.inbound_leads(org_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_phone_calls_org ON crm.phone_calls(org_id); EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ============================================================================
-- 3. Enable RLS and add policies
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE crm.calendly_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE crm.calendly_events FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON crm.calendly_events
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm.sms_messages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE crm.sms_messages FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON crm.sms_messages
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm.inbound_leads ENABLE ROW LEVEL SECURITY;
  ALTER TABLE crm.inbound_leads FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON crm.inbound_leads
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm.phone_calls ENABLE ROW LEVEL SECURITY;
  ALTER TABLE crm.phone_calls FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON crm.phone_calls
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

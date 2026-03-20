-- Migration 008: Add org_id to all tenant-scoped tables that are missing it
-- This is critical for multi-tenancy data isolation.
-- Run after ensuring crm.organizations table exists with at least org_id=1.

BEGIN;

-- ============================================================================
-- 1. Add org_id column to BDR tables
-- ============================================================================

-- bdr.leads
ALTER TABLE bdr.leads ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE bdr.leads SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE bdr.leads ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE bdr.leads ALTER COLUMN org_id SET DEFAULT 1;

-- bdr.lead_campaigns
ALTER TABLE bdr.lead_campaigns ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE bdr.lead_campaigns SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE bdr.lead_campaigns ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE bdr.lead_campaigns ALTER COLUMN org_id SET DEFAULT 1;

-- bdr.email_sends
ALTER TABLE bdr.email_sends ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE bdr.email_sends SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE bdr.email_sends ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE bdr.email_sends ALTER COLUMN org_id SET DEFAULT 1;

-- bdr.email_events
DO $$ BEGIN
  ALTER TABLE bdr.email_events ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE bdr.email_events SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE bdr.email_events ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE bdr.email_events ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- bdr.campaign_emails
DO $$ BEGIN
  ALTER TABLE bdr.campaign_emails ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE bdr.campaign_emails SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE bdr.campaign_emails ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE bdr.campaign_emails ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- bdr.email_templates
ALTER TABLE bdr.email_templates ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE bdr.email_templates SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE bdr.email_templates ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE bdr.email_templates ALTER COLUMN org_id SET DEFAULT 1;

-- bdr.campaign_templates
DO $$ BEGIN
  ALTER TABLE bdr.campaign_templates ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE bdr.campaign_templates SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE bdr.campaign_templates ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE bdr.campaign_templates ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- bdr.prompt_templates
ALTER TABLE bdr.prompt_templates ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE bdr.prompt_templates SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE bdr.prompt_templates ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE bdr.prompt_templates ALTER COLUMN org_id SET DEFAULT 1;

-- bdr.chat_sessions
ALTER TABLE bdr.chat_sessions ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE bdr.chat_sessions SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE bdr.chat_sessions ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE bdr.chat_sessions ALTER COLUMN org_id SET DEFAULT 1;

-- bdr.chat_messages (scoped via session, but add for RLS)
ALTER TABLE bdr.chat_messages ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE bdr.chat_messages SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE bdr.chat_messages ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE bdr.chat_messages ALTER COLUMN org_id SET DEFAULT 1;

-- bdr.briefings
DO $$ BEGIN
  ALTER TABLE bdr.briefings ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE bdr.briefings SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE bdr.briefings ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE bdr.briefings ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- 2. Add org_id column to Brain tables
-- ============================================================================

-- brain.internal_content
ALTER TABLE brain.internal_content ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE brain.internal_content SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE brain.internal_content ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE brain.internal_content ALTER COLUMN org_id SET DEFAULT 1;

-- brain.industry_snippets
ALTER TABLE brain.industry_snippets ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE brain.industry_snippets SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE brain.industry_snippets ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE brain.industry_snippets ALTER COLUMN org_id SET DEFAULT 1;

-- brain.auto_learned
ALTER TABLE brain.auto_learned ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE brain.auto_learned SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE brain.auto_learned ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE brain.auto_learned ALTER COLUMN org_id SET DEFAULT 1;

-- brain.content_tags
DO $$ BEGIN
  ALTER TABLE brain.content_tags ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE brain.content_tags SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE brain.content_tags ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE brain.content_tags ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- brain.effectiveness_log
DO $$ BEGIN
  ALTER TABLE brain.effectiveness_log ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE brain.effectiveness_log SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE brain.effectiveness_log ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE brain.effectiveness_log ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- 3. Add org_id to CRM tables that may be missing it
-- ============================================================================

-- crm.sequences (the export route indicated no orgCol)
ALTER TABLE crm.sequences ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
UPDATE crm.sequences SET org_id = 1 WHERE org_id IS NULL;
ALTER TABLE crm.sequences ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE crm.sequences ALTER COLUMN org_id SET DEFAULT 1;

-- crm.sequence_step_executions
DO $$ BEGIN
  ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS org_id INTEGER REFERENCES crm.organizations(org_id);
  UPDATE crm.sequence_step_executions SET org_id = 1 WHERE org_id IS NULL;
  ALTER TABLE crm.sequence_step_executions ALTER COLUMN org_id SET NOT NULL;
  ALTER TABLE crm.sequence_step_executions ALTER COLUMN org_id SET DEFAULT 1;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

COMMIT;

-- Migration 009: Row-Level Security policies for multi-tenant data isolation.
-- RLS acts as a database-level safety net — even if application code forgets
-- to filter by org_id, the database will enforce isolation.
--
-- IMPORTANT: The application DB user must SET app.current_org_id = <org_id>
-- at the start of each request (via SET LOCAL in a transaction or SET SESSION).
-- If not set, queries return zero rows (fail-closed).

BEGIN;

-- ============================================================================
-- Helper: Create RLS policy for a table with org_id column.
-- Pattern: enable RLS, create policy that checks org_id = current_setting.
-- ============================================================================

-- CRM schema tables
ALTER TABLE crm.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.contacts
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE crm.deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.deals
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE crm.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.activities
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE crm.touchpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.touchpoints
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE crm.sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.sequences
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE crm.sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.sequence_enrollments
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE crm.task_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON crm.task_queue
  USING (org_id = current_setting('app.current_org_id', true)::integer);

DO $$ BEGIN
  ALTER TABLE crm.audit_log ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON crm.audit_log
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm.api_keys ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON crm.api_keys
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE crm.usage_events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON crm.usage_events
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- BDR schema tables
ALTER TABLE bdr.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bdr.leads
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE bdr.lead_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bdr.lead_campaigns
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE bdr.email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bdr.email_sends
  USING (org_id = current_setting('app.current_org_id', true)::integer);

DO $$ BEGIN
  ALTER TABLE bdr.email_events ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON bdr.email_events
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE bdr.campaign_emails ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON bdr.campaign_emails
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE bdr.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bdr.email_templates
  USING (org_id = current_setting('app.current_org_id', true)::integer);

DO $$ BEGIN
  ALTER TABLE bdr.campaign_templates ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON bdr.campaign_templates
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE bdr.prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bdr.prompt_templates
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE bdr.chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bdr.chat_sessions
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE bdr.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bdr.chat_messages
  USING (org_id = current_setting('app.current_org_id', true)::integer);

DO $$ BEGIN
  ALTER TABLE bdr.briefings ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON bdr.briefings
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Brain schema tables
ALTER TABLE brain.internal_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON brain.internal_content
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE brain.industry_snippets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON brain.industry_snippets
  USING (org_id = current_setting('app.current_org_id', true)::integer);

ALTER TABLE brain.auto_learned ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON brain.auto_learned
  USING (org_id = current_setting('app.current_org_id', true)::integer);

DO $$ BEGIN
  ALTER TABLE brain.content_tags ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON brain.content_tags
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE brain.effectiveness_log ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON brain.effectiveness_log
    USING (org_id = current_setting('app.current_org_id', true)::integer);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- FORCE RLS: Required when the application connects as the table owner.
-- Without FORCE, the table owner bypasses RLS entirely.
-- ============================================================================

-- CRM schema
ALTER TABLE crm.contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.deals FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.activities FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.touchpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.sequences FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.sequence_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE crm.task_queue FORCE ROW LEVEL SECURITY;
DO $$ BEGIN ALTER TABLE crm.audit_log FORCE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE crm.api_keys FORCE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE crm.usage_events FORCE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- BDR schema
ALTER TABLE bdr.leads FORCE ROW LEVEL SECURITY;
ALTER TABLE bdr.lead_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE bdr.email_sends FORCE ROW LEVEL SECURITY;
DO $$ BEGIN ALTER TABLE bdr.email_events FORCE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE bdr.campaign_emails FORCE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
ALTER TABLE bdr.email_templates FORCE ROW LEVEL SECURITY;
DO $$ BEGIN ALTER TABLE bdr.campaign_templates FORCE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
ALTER TABLE bdr.prompt_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE bdr.chat_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE bdr.chat_messages FORCE ROW LEVEL SECURITY;
DO $$ BEGIN ALTER TABLE bdr.briefings FORCE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Brain schema
ALTER TABLE brain.internal_content FORCE ROW LEVEL SECURITY;
ALTER TABLE brain.industry_snippets FORCE ROW LEVEL SECURITY;
ALTER TABLE brain.auto_learned FORCE ROW LEVEL SECURITY;
DO $$ BEGIN ALTER TABLE brain.content_tags FORCE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE brain.effectiveness_log FORCE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END $$;

COMMIT;

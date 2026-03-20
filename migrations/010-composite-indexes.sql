-- Migration 010: Composite indexes for high-traffic org-scoped queries.
-- These indexes dramatically improve multi-tenant query performance.

BEGIN;

-- ============================================================================
-- CRM schema indexes
-- ============================================================================

-- contacts: most common queries are by org + created_at, org + email, org + status
CREATE INDEX IF NOT EXISTS idx_contacts_org_created ON crm.contacts (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_org_email ON crm.contacts (org_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_org_status ON crm.contacts (org_id, status);

-- deals: org + stage, org + created_at
CREATE INDEX IF NOT EXISTS idx_deals_org_created ON crm.deals (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_org_stage ON crm.deals (org_id, pipeline_stage);

-- activities: org + created_at
CREATE INDEX IF NOT EXISTS idx_activities_org_created ON crm.activities (org_id, created_at DESC);

-- touchpoints: org + created_at, org + channel
CREATE INDEX IF NOT EXISTS idx_touchpoints_org_created ON crm.touchpoints (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_touchpoints_org_channel ON crm.touchpoints (org_id, channel);

-- sequences: org + created_at
CREATE INDEX IF NOT EXISTS idx_sequences_org_created ON crm.sequences (org_id, created_at DESC);

-- sequence_enrollments: org + status
CREATE INDEX IF NOT EXISTS idx_enrollments_org_status ON crm.sequence_enrollments (org_id, status);

-- task_queue: org + status + due_at (for task list queries)
CREATE INDEX IF NOT EXISTS idx_tasks_org_status_due ON crm.task_queue (org_id, status, due_at);

-- audit_log: org + created_at
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_audit_org_created ON crm.audit_log (org_id, created_at DESC);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================================
-- BDR schema indexes
-- ============================================================================

-- leads: org + status, org + created_at, org + tier
CREATE INDEX IF NOT EXISTS idx_leads_org_status ON bdr.leads (org_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_org_created ON bdr.leads (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_org_tier ON bdr.leads (org_id, tier);

-- email_sends: org + sent_at, org + lead_id
CREATE INDEX IF NOT EXISTS idx_sends_org_sent ON bdr.email_sends (org_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sends_org_lead ON bdr.email_sends (org_id, lead_id);

-- lead_campaigns: org + status
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON bdr.lead_campaigns (org_id, status);

-- email_templates: org + updated_at
CREATE INDEX IF NOT EXISTS idx_etemplates_org_updated ON bdr.email_templates (org_id, updated_at DESC);

-- chat_sessions: org + last_message_at
CREATE INDEX IF NOT EXISTS idx_chatsessions_org_last ON bdr.chat_sessions (org_id, last_message_at DESC);

-- ============================================================================
-- Brain schema indexes
-- ============================================================================

-- internal_content: org + section + updated_at
CREATE INDEX IF NOT EXISTS idx_brain_org_section ON brain.internal_content (org_id, section, updated_at DESC);

-- industry_snippets: org + industry
CREATE INDEX IF NOT EXISTS idx_snippets_org_industry ON brain.industry_snippets (org_id, industry);

-- auto_learned: org + pattern_type
CREATE INDEX IF NOT EXISTS idx_learned_org_type ON brain.auto_learned (org_id, pattern_type);

COMMIT;

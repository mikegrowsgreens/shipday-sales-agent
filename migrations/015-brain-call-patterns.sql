-- Migration 015: Sales Knowledge Engine - Call Pattern Mining
-- Session 1: Brain learns from call transcripts across the entire sales team

-- ─── brain.call_patterns ────────────────────────────────────────────────────
-- Structured patterns extracted from sales calls by Claude.
-- Each row is a single reusable insight tied to its source call and outcome.

CREATE TABLE IF NOT EXISTS brain.call_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'objection_handling',
    'discovery_question',
    'roi_story',
    'closing_technique',
    'competitor_counter',
    'prospect_pain_verbatim'
  )),
  pattern_text TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  -- context shape: {
  --   call_id: string,
  --   call_title: string,
  --   industry: string | null,
  --   company_size: string | null,
  --   outcome: string | null,        -- 'won', 'lost', 'pending', 'unknown'
  --   prospect_company: string | null,
  --   attendee_emails: string[]
  -- }
  effectiveness_score NUMERIC DEFAULT 0.5 CHECK (effectiveness_score >= 0 AND effectiveness_score <= 1),
  times_referenced INTEGER DEFAULT 0,
  owner_email TEXT,                   -- rep who conducted the call
  org_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Indexes for fast lookups by the chatbot and analytics
CREATE INDEX IF NOT EXISTS idx_call_patterns_type ON brain.call_patterns (pattern_type);
CREATE INDEX IF NOT EXISTS idx_call_patterns_org ON brain.call_patterns (org_id);
CREATE INDEX IF NOT EXISTS idx_call_patterns_effectiveness ON brain.call_patterns (effectiveness_score DESC);
CREATE INDEX IF NOT EXISTS idx_call_patterns_owner ON brain.call_patterns (owner_email);

-- ─── Add brain_mined flag to public.calls ───────────────────────────────────
-- Prevents reprocessing calls that have already been mined for patterns

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS brain_mined BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_calls_brain_mined ON public.calls (brain_mined) WHERE brain_mined = FALSE;

-- ─── Add fathom_api_keys array to org settings ──────────────────────────────
-- Instead of a single env var, orgs can store multiple team API keys.
-- Stored in crm.organizations.settings JSONB under key "fathom_api_keys"
-- No schema change needed since settings is already JSONB.

-- ─── RLS policy for brain.call_patterns ─────────────────────────────────────
ALTER TABLE brain.call_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY call_patterns_tenant_isolation ON brain.call_patterns
  USING (org_id = current_setting('app.current_org_id', true)::integer);

CREATE POLICY call_patterns_tenant_insert ON brain.call_patterns
  FOR INSERT WITH CHECK (org_id = current_setting('app.current_org_id', true)::integer);

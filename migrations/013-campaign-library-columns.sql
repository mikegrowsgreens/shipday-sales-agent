-- Session 3: Pre-Built A/B Campaign Library
-- Adds columns to bdr.campaign_templates for library template support

ALTER TABLE bdr.campaign_templates
  ADD COLUMN IF NOT EXISTS is_library_template BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant VARCHAR(10),
  ADD COLUMN IF NOT EXISTS auto_assignable BOOLEAN DEFAULT false;

-- Index for fast library template lookups
CREATE INDEX IF NOT EXISTS idx_campaign_templates_library
  ON bdr.campaign_templates (org_id, is_library_template, tier)
  WHERE is_library_template = true AND is_active = true;

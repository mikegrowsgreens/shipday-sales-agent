-- Migration 002: Rename Shipday-specific tables to generic names

-- Rename shipday_signups to inbound_leads in crm schema
ALTER TABLE IF EXISTS crm.shipday_signups RENAME TO inbound_leads;

-- Add comment for documentation
COMMENT ON TABLE crm.inbound_leads IS 'Inbound lead/signup tracking with territory matching and funnel stages (formerly shipday_signups)';

-- Note: The shipday.* schema tables (deals, email_drafts, activity_log) in defaultdb
-- remain unchanged as they are in a separate database.
-- The code references are updated to use generic function names (queryDeals instead of queryShipday).

-- Migration 003: Rename shipday schema to deals in defaultdb
-- Also renames wincall_deal_id column in crm.contacts (primary db)
--
-- This migration must be run against BOTH databases:
--   Part A: Run against defaultdb (DATABASE_URL_DEFAULTDB)
--   Part B: Run against wincall_brain (DATABASE_URL_WINCALL)

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART A: Run against defaultdb
-- ═══════════════════════════════════════════════════════════════════════════════

-- Rename the schema from shipday to deals
ALTER SCHEMA shipday RENAME TO deals;

-- Add documentation comments
COMMENT ON SCHEMA deals IS 'Deal followup data: deals, email_drafts, activity_log (formerly shipday schema)';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART B: Run against wincall_brain (primary database)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Rename wincall_deal_id to external_deal_id in crm.contacts
ALTER TABLE crm.contacts RENAME COLUMN wincall_deal_id TO external_deal_id;

-- Update any indexes that reference the old column name
-- (PostgreSQL automatically updates index definitions on column rename)

COMMENT ON COLUMN crm.contacts.external_deal_id IS 'External deal system ID (formerly wincall_deal_id). Links to deals in external systems.';

-- Migration 014: Add owner_email to deals.deals for user-level filtering.
-- NOTE: This must be run against the defaultdb database (not wincall_brain).
-- Run with: psql $DATABASE_URL_DEFAULTDB -f migrations/014-deals-owner-email.sql

BEGIN;

-- Add owner_email column if it doesn't exist
ALTER TABLE deals.deals ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);

-- Create index for owner filtering
CREATE INDEX IF NOT EXISTS idx_deals_org_owner ON deals.deals (org_id, owner_email);

COMMIT;

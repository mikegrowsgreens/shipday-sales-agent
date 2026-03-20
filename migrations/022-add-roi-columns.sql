-- Add missing ROI projection columns to bdr.leads
-- These are referenced by campaign preview, generate-sequence, generate-campaign, and campaign-library/assign

ALTER TABLE bdr.leads ADD COLUMN IF NOT EXISTS estimated_orders INTEGER;
ALTER TABLE bdr.leads ADD COLUMN IF NOT EXISTS avg_order_value NUMERIC(10,2);
ALTER TABLE bdr.leads ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4);

-- Migration 001: Add org-level configuration for multi-tenant generalization
-- This moves all hardcoded Shipday/mikegrowsgreens values into per-org config

-- Add config column to organizations
ALTER TABLE crm.organizations ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- Seed existing org (Shipday) with current hardcoded values
UPDATE crm.organizations
SET config = '{
  "company_name": "Shipday",
  "product_name": "Shipday Delivery Management Platform",
  "industry": "Restaurant Delivery SaaS",
  "persona": {
    "sender_name": "Mike Paulus",
    "sender_title": "Account Executive",
    "sender_email": "mike.paulus@shipday.com",
    "calendly_url": "https://calendly.com/mike-paulus-shipday"
  },
  "value_props": [
    "Save on third-party delivery commissions (20-30%) with flat-rate $6.49/delivery",
    "24/7 AI Receptionist captures missed calls and takes orders",
    "SMS marketing drives repeat orders from existing customers",
    "5-star review boost + AI review responder improves Google ratings",
    "45-minute onboarding, live same week, no long-term contract"
  ],
  "pain_points": [
    "Restaurants miss 20-30% of phone orders during peak hours",
    "Third-party delivery commissions eating into margins (15-30%)",
    "No way to drive repeat orders from existing customers",
    "Managing multiple delivery platforms is complex and time-consuming",
    "Poor Google ratings hurting online visibility"
  ],
  "competitors": ["DoorDash", "UberEats", "Grubhub", "ChowNow", "Toast"],
  "email_angles": [
    {"id": "missed_calls", "name": "Missed Calls", "description": "Focus on how restaurants miss phone orders, lose revenue from unanswered calls, and how the platform can capture those missed opportunities through delivery management."},
    {"id": "commission_savings", "name": "Commission Savings", "description": "Emphasize how restaurants can save on third-party delivery commissions (20-30%) by using the platform for their own delivery operations."},
    {"id": "delivery_ops", "name": "Delivery Operations", "description": "Focus on streamlining delivery operations - driver management, route optimization, real-time tracking, and operational efficiency."},
    {"id": "tech_consolidation", "name": "Tech Consolidation", "description": "Highlight how the platform consolidates multiple delivery tools into one, reducing tech stack complexity."},
    {"id": "customer_experience", "name": "Customer Experience", "description": "Focus on improving customer experience through real-time tracking, accurate ETAs, and professional delivery management."}
  ],
  "product_knowledge": {
    "plans": [
      {"name": "Elite", "price": 99, "description": "Basic delivery management"},
      {"name": "AI Lite", "price": 159, "description": "Delivery + SMS marketing"},
      {"name": "Business Advanced Unlimited", "price": 349, "description": "Full suite with AI Receptionist"}
    ],
    "key_stats": {
      "delivery_fee": 6.49,
      "roi_multiplier": "739%",
      "break_even_days": 3.6,
      "onboarding_time": "45 minutes"
    }
  },
  "branding": {
    "logo_url": "https://cdn.prod.website-files.com/62428b049409c6b74b6b6636/65f48b763da99591f7eb8414_Shipday%20logo.svg",
    "primary_color": "#2563eb",
    "app_name": "SalesHub"
  },
  "territory": {
    "area_codes": {
      "WA": [206, 253, 360, 425, 509, 564],
      "NV": [702, 725, 775],
      "ID": [208, 986],
      "MT": [406],
      "AK": [907]
    }
  },
  "features": {
    "roi_calculator": true,
    "territory_tracking": true,
    "deal_followups": true,
    "signup_tracking": true,
    "prospect_chat": true
  },
  "urls": {
    "default_redirect": "https://www.shipday.com",
    "roi_calculator": "https://shipdayroi.mikegrowsgreens.com",
    "case_studies": "https://www.shipday.com/case-studies"
  }
}'::jsonb
WHERE org_id = 1;

-- Add comment for documentation
COMMENT ON COLUMN crm.organizations.config IS 'Per-org configuration: company info, persona, value props, pain points, email angles, branding, territory, feature flags, URLs, product knowledge';

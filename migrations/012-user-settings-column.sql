-- Add settings JSONB column to crm.users for per-user preferences
-- (work_email, notification prefs, etc.)
ALTER TABLE crm.users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Set Mike's work email for call/data scoping
UPDATE crm.users
SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{work_email}', '"mike.paulus@shipday.com"'::jsonb)
WHERE user_id = 1;

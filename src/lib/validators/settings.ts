import { z } from 'zod';

export const createApiKeySchema = z.object({
  name: z.string().max(100).default('API Key'),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export const smtpSettingsSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  from_name: z.string().optional(),
  from_email: z.string().email().optional(),
  encryption: z.enum(['tls', 'ssl', 'none']).optional(),
});

export const webhookConfigSchema = z.object({
  action: z.enum(['test', 'save']),
  url: z.string().url().optional(),
  webhooks: z.array(z.object({
    url: z.string().url(),
    events: z.array(z.string()),
    enabled: z.boolean().default(true),
    secret: z.string().optional(),
  })).optional(),
});

export const exportSettingsSchema = z.object({
  format: z.enum(['json', 'csv']),
  tables: z.array(z.string().min(1)).min(1, 'At least one table is required'),
});

export const contactImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1, 'At least one row is required'),
  field_mapping: z.record(z.string(), z.string()),
  default_stage: z.string().optional(),
  default_tags: z.array(z.string()).optional(),
});

export const pipelineDealSchema = z.object({
  contact_id: z.number().int().positive(),
  deal_name: z.string().min(1).optional(),
  deal_value: z.number().min(0).optional(),
  stage: z.string().optional(),
  notes: z.string().optional(),
});

export const sendingConfigSchema = z.object({
  daily_limit: z.number().int().min(1).max(500).optional(),
  warmup_enabled: z.boolean().optional(),
  warmup_start: z.number().int().min(1).max(100).optional(),
  warmup_increment: z.number().int().min(1).max(50).optional(),
  warmup_target: z.number().int().min(1).max(500).optional(),
  send_window_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  send_window_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  send_window_timezone: z.string().optional(),
  send_days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).optional(),
  delay_between_emails_min: z.number().int().min(0).optional(),
  delay_between_emails_max: z.number().int().min(0).optional(),
});

export const orgConfigSchema = z.object({
  persona: z.object({
    sender_name: z.string().optional(),
    sender_email: z.string().email().optional(),
    company_name: z.string().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),
  branding: z.object({
    logo_url: z.string().url().optional().nullable(),
    primary_color: z.string().optional(),
  }).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
}).passthrough();

export const notificationSettingsSchema = z.object({
  email_replies: z.boolean().optional(),
  email_demos_booked: z.boolean().optional(),
  email_hot_leads: z.boolean().optional(),
  sms_replies: z.boolean().optional(),
  sms_demos_booked: z.boolean().optional(),
  sms_hot_leads: z.boolean().optional(),
  daily_summary: z.boolean().optional(),
  weekly_report: z.boolean().optional(),
  notify_phone: z.string().optional(),
  notify_email: z.string().email().optional().or(z.literal('')),
});

export const createSegmentSchema = z.object({
  name: z.string().min(1, 'Segment name is required').max(200),
  description: z.string().max(1000).optional().nullable(),
  filters: z.object({
    stages: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    search: z.string().optional(),
    score_min: z.number().int().min(0).optional(),
    score_max: z.number().int().max(100).optional(),
    has_email: z.boolean().optional(),
    has_phone: z.boolean().optional(),
    created_after: z.string().optional(),
    created_before: z.string().optional(),
  }),
});

export const updateSignupSchema = z.object({
  signup_id: z.number().int().positive('signup_id required'),
  funnel_stage: z.enum(['signup', 'activation', 'first_delivery', 'retained', 'churned']).optional(),
  attribution_channel: z.string().max(100).optional(),
  attribution_source: z.string().max(200).optional(),
});

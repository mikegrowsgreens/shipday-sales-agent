import { z } from 'zod';

export const createContactSchema = z.object({
  email: z.string().email('Invalid email'),
  phone: z.string().optional().nullable(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  business_name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  linkedin_url: z.string().url().optional().nullable(),
  website: z.string().url().optional().nullable(),
  lifecycle_stage: z.string().default('raw'),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const updateContactSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  business_name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  linkedin_url: z.string().url().optional().nullable(),
  website: z.string().url().optional().nullable(),
  lifecycle_stage: z.string().optional(),
  lead_score: z.number().int().min(0).max(100).optional(),
  engagement_score: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

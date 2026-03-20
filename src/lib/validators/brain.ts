import { z } from 'zod';

export const createBrainContentSchema = z.object({
  content_type: z.string().min(1, 'content_type is required'),
  title: z.string().min(1, 'title is required'),
  raw_text: z.string().optional().nullable(),
  key_claims: z.array(z.string()).optional().nullable(),
  value_props: z.array(z.string()).optional().nullable(),
  pain_points_addressed: z.array(z.string()).optional().nullable(),
  source_type: z.string().optional().nullable(),
});

export const updateBrainContentSchema = z.object({
  id: z.union([z.string().uuid(), z.number().int().positive()]),
  title: z.string().min(1).optional(),
  raw_text: z.string().optional().nullable(),
  content_type: z.string().optional(),
  key_claims: z.array(z.string()).optional().nullable(),
  value_props: z.array(z.string()).optional().nullable(),
  pain_points_addressed: z.array(z.string()).optional().nullable(),
  is_active: z.boolean().optional(),
});

export const deleteBrainContentSchema = z.object({
  id: z.union([z.string().uuid(), z.number().int().positive()]),
});

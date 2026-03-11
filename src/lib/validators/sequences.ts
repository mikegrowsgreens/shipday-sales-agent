import { z } from 'zod';

export const createSequenceSchema = z.object({
  name: z.string().min(1, 'Sequence name is required'),
  description: z.string().optional().nullable(),
  pause_on_reply: z.boolean().default(true),
  pause_on_booking: z.boolean().default(true),
  is_template: z.boolean().default(false),
  template_category: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  cloned_from: z.number().int().optional().nullable(),
  steps: z.array(z.object({
    step_order: z.number().int().optional(),
    step_type: z.enum(['email', 'phone', 'linkedin', 'sms', 'manual']).default('email'),
    delay_days: z.number().int().min(0).default(0),
    send_window_start: z.string().default('09:00'),
    send_window_end: z.string().default('17:00'),
    subject_template: z.string().optional().nullable(),
    body_template: z.string().optional().nullable(),
    task_instructions: z.string().optional().nullable(),
    variant_label: z.string().optional().nullable(),
    branch_condition: z.string().optional().nullable(),
    branch_wait_days: z.number().int().default(2),
    is_exit_step: z.boolean().default(false),
    exit_action: z.string().optional().nullable(),
    exit_action_config: z.record(z.string(), z.unknown()).default({}),
    parent_step_order: z.number().int().optional(),
  })).optional(),
});

import { z } from 'zod';

export const updateTaskSchema = z.object({
  task_id: z.number().int().positive('task_id required'),
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']),
  outcome: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

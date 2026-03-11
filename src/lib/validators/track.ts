import { z } from 'zod';

export const trackSentSchema = z.object({
  send_id: z.string().min(1, 'send_id required'),
  gmail_message_id: z.string().optional().nullable(),
  gmail_thread_id: z.string().optional().nullable(),
  lead_id: z.number().int().optional().nullable(),
});

export const trackRepliesSchema = z.object({
  replies: z.array(z.object({
    send_id: z.string().optional(),
    lead_id: z.number().int().optional(),
    gmail_thread_id: z.string().optional(),
    snippet: z.string().optional(),
    from_email: z.string().optional(),
    replied_at: z.string().optional(),
  })).min(1, 'replies array required'),
});

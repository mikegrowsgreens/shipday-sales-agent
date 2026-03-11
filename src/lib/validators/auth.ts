import { z } from 'zod';

export const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export const userLoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export const createUserSchema = z.object({
  email: z.string().email('Invalid email').transform(v => v.trim().toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  display_name: z.string().optional().nullable(),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

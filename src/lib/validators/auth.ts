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

export const signupSchema = z.object({
  company_name: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  full_name: z.string().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email').transform(v => v.trim().toLowerCase()),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/\d/, 'Password must contain at least 1 number'),
  password_confirmation: z.string(),
  invite_token: z.string().optional(),
}).refine(data => data.password === data.password_confirmation, {
  message: 'Passwords do not match',
  path: ['password_confirmation'],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email').transform(v => v.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/\d/, 'Password must contain at least 1 number'),
  password_confirmation: z.string(),
}).refine(data => data.password === data.password_confirmation, {
  message: 'Passwords do not match',
  path: ['password_confirmation'],
});

export const inviteSchema = z.object({
  email: z.string().email('Invalid email').transform(v => v.trim().toLowerCase()),
  role: z.enum(['admin', 'manager', 'member']).default('member'),
});

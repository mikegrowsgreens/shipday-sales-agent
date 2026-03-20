import { z } from 'zod';

// ─── Shared sub-schemas ────────────────────────────────────────────────────

const timeWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format'),
});

const customQuestionSchema = z.object({
  type: z.enum(['text', 'textarea', 'select', 'radio']),
  label: z.string().min(1).max(200),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
});

const dayHoursSchema = z.array(timeWindowSchema).default([]);

const weeklyHoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
});

// ─── Event Type Schemas ────────────────────────────────────────────────────

export const createEventTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(500).optional().nullable(),
  duration_minutes: z.number().int().min(5).max(480).default(30),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
  location_type: z.enum(['google_meet', 'zoom', 'phone', 'in_person', 'custom']).default('google_meet'),
  location_value: z.string().max(500).optional().nullable(),
  buffer_before: z.number().int().min(0).max(120).default(0),
  buffer_after: z.number().int().min(0).max(120).default(0),
  min_notice: z.number().int().min(0).max(10080).default(60),
  max_days_ahead: z.number().int().min(1).max(365).default(60),
  max_per_day: z.number().int().min(1).max(50).optional().nullable(),
  availability_id: z.number().int().optional().nullable(),
  custom_questions: z.array(customQuestionSchema).default([]),
  ai_agenda_enabled: z.boolean().default(false),
});

export const updateEventTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  description: z.string().max(500).optional().nullable(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  location_type: z.enum(['google_meet', 'zoom', 'phone', 'in_person', 'custom']).optional(),
  location_value: z.string().max(500).optional().nullable(),
  buffer_before: z.number().int().min(0).max(120).optional(),
  buffer_after: z.number().int().min(0).max(120).optional(),
  min_notice: z.number().int().min(0).max(10080).optional(),
  max_days_ahead: z.number().int().min(1).max(365).optional(),
  max_per_day: z.number().int().min(1).max(50).optional().nullable(),
  availability_id: z.number().int().optional().nullable(),
  custom_questions: z.array(customQuestionSchema).optional(),
  ai_agenda_enabled: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

// ─── Availability Schemas ──────────────────────────────────────────────────

export const createAvailabilitySchema = z.object({
  name: z.string().min(1).max(100).default('Default'),
  timezone: z.string().min(1).max(100).default('America/Chicago'),
  is_default: z.boolean().default(false),
  weekly_hours: weeklyHoursSchema.default({
    monday: [{ start: '09:00', end: '17:00' }],
    tuesday: [{ start: '09:00', end: '17:00' }],
    wednesday: [{ start: '09:00', end: '17:00' }],
    thursday: [{ start: '09:00', end: '17:00' }],
    friday: [{ start: '09:00', end: '17:00' }],
    saturday: [],
    sunday: [],
  }),
  date_overrides: z.record(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    z.array(timeWindowSchema)
  ).default({}),
});

export const updateAvailabilitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).max(100).optional(),
  is_default: z.boolean().optional(),
  weekly_hours: weeklyHoursSchema.optional(),
  date_overrides: z.record(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    z.array(timeWindowSchema)
  ).optional(),
});

// ─── Public Booking Schema ─────────────────────────────────────────────────

export const createBookingSchema = z.object({
  event_type_id: z.number().int().positive('Event type ID is required'),
  starts_at: z.string().min(1, 'Start time is required'),  // ISO 8601
  timezone: z.string().min(1, 'Timezone is required').max(100),
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Valid email is required'),
  phone: z.string().max(30).optional().nullable(),
  answers: z.record(z.string(), z.unknown()).default({}),
});

// ─── Slots Query Schema ────────────────────────────────────────────────────

export const slotsQuerySchema = z.object({
  event_type_id: z.coerce.number().int().positive('Event type ID is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  timezone: z.string().min(1, 'Timezone is required').max(100),
});

/**
 * POST /api/scheduling/book-from-deal — Create a booking linked to a follow-up deal.
 *
 * Authenticated route — requires logged-in user creating a booking on behalf
 * of a deal contact. Enriches the booking with Fathom deal context.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/route-auth';
import { createBookingFromDeal, BookingError } from '@/lib/scheduling';
import { z } from 'zod';

const bookFromDealSchema = z.object({
  deal_id: z.string().min(1),
  event_type_id: z.coerce.number().int().positive(),
  starts_at: z.string().min(1),
  timezone: z.string().min(1),
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().max(50).optional(),
  answers: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const POST = withAuth(async (request: NextRequest, { orgId }) => {
  try {
    const body = await request.json();

    const parsed = bookFromDealSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { deal_id, event_type_id, starts_at, timezone, name, email, phone, answers } = parsed.data;

    const result = await createBookingFromDeal({
      deal_id,
      event_type_id,
      starts_at,
      timezone,
      name,
      email,
      phone: phone || null,
      answers: answers as Record<string, unknown>,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[api/scheduling/book-from-deal] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

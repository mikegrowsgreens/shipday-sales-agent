/**
 * POST /api/scheduling/cancel — Public cancellation/reschedule endpoint.
 *
 * Cancels or reschedules a booking using the cancel_token.
 * Deletes Google Calendar event and sends notification emails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cancelBooking, BookingError } from '@/lib/scheduling';
import { checkRateLimit, bookingLimiter } from '@/lib/rate-limit';

const cancelSchema = z.object({
  cancel_token: z.string().uuid('Invalid cancel token'),
  action: z.enum(['cancel', 'reschedule']),
  reason: z.string().max(500).optional(),
  new_starts_at: z.string().optional(), // ISO 8601, required for reschedule
});

export async function POST(request: NextRequest) {
  // Rate limit (shares the booking limiter)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';
  const rateLimitResponse = await checkRateLimit(bookingLimiter, ip);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();

    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { cancel_token, action, reason, new_starts_at } = parsed.data;

    if (action === 'reschedule' && !new_starts_at) {
      return NextResponse.json(
        { error: 'new_starts_at is required for reschedule action' },
        { status: 400 },
      );
    }

    const result = await cancelBooking(cancel_token, action, reason, new_starts_at);

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[api/scheduling/cancel] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

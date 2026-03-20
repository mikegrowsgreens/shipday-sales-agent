/**
 * POST /api/scheduling/book — Public booking endpoint.
 *
 * Creates a new booking with Google Meet link, confirmation emails,
 * contact auto-linking, and touchpoint creation.
 *
 * Rate limited: 10 requests per hour per IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBookingSchema } from '@/lib/validators/scheduling';
import { createBooking, BookingError } from '@/lib/scheduling';
import { checkRateLimit, bookingLimiter } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Rate limit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';
  const rateLimitResponse = await checkRateLimit(bookingLimiter, ip, request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();

    // Validate input
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Create booking
    const result = await createBooking(parsed.data);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[api/scheduling/book] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

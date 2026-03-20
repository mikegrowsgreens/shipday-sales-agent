/**
 * Public API: GET /api/scheduling/slots
 *
 * Returns available time slots for a given event type, date, and timezone.
 * No authentication required — this is called by the public booking page.
 *
 * Query params:
 *   event_type_id - ID of the event type
 *   date          - YYYY-MM-DD
 *   timezone      - IANA timezone (e.g., "America/Chicago")
 */

import { NextRequest, NextResponse } from 'next/server';
import { slotsQuerySchema } from '@/lib/validators/scheduling';
import { computeAvailableSlots } from '@/lib/scheduling';
import { slotsLimiter, checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  const rateLimitResponse = await checkRateLimit(slotsLimiter, ip, request);
  if (rateLimitResponse) return rateLimitResponse;

  // Parse and validate query params
  const { searchParams } = request.nextUrl;
  const parsed = slotsQuerySchema.safeParse({
    event_type_id: searchParams.get('event_type_id'),
    date: searchParams.get('date'),
    timezone: searchParams.get('timezone'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { event_type_id, date, timezone } = parsed.data;

  // Validate timezone is real
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return NextResponse.json(
      { error: 'Invalid timezone', details: { timezone: ['Unknown IANA timezone'] } },
      { status: 400 },
    );
  }

  try {
    const result = await computeAvailableSlots(event_type_id, date, timezone);

    return NextResponse.json(
      {
        slots: result.slots,
        google_calendar_connected: result.google_calendar_connected,
        ...(result.google_calendar_error ? { google_calendar_error: result.google_calendar_error } : {}),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error('[scheduling/slots] Error computing slots:', error);
    return NextResponse.json(
      { error: 'Failed to compute available slots' },
      { status: 500 },
    );
  }
}

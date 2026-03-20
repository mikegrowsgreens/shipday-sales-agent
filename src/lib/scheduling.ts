/**
 * Scheduling Engine — Slot Computation
 *
 * Given an event type + date + timezone, computes available time slots
 * by combining availability schedules, existing bookings, and Google Calendar
 * busy times.
 */

import { query, queryOne } from './db';
import { getFreeBusy, createEventWithMeet, deleteEvent } from './google-calendar';
import { createMeeting as createZoomMeeting, deleteMeeting as deleteZoomMeeting } from './zoom';
import { sendBookingConfirmation, sendCancellationNotice } from './scheduling-emails';
import { fireSchedulingWebhook } from './scheduling-webhooks';
import type {
  AvailableSlot,
  CalendarConnection,
  SchedulingAvailability,
  SchedulingBooking,
  SchedulingEventType,
  TimeWindow,
  WeeklyHours,
} from './types';

// ─── Timezone Helpers ──────────────────────────────────────────────────────

const DAY_NAMES: (keyof WeeklyHours)[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/**
 * Get the day-of-week index (0=Sun) for a YYYY-MM-DD date in a specific timezone.
 */
function getDayOfWeekInTimezone(dateStr: string, timezone: string): number {
  // Create a date at noon UTC to avoid edge-case day shifts
  const midday = new Date(`${dateStr}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const dayStr = formatter.format(midday);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[dayStr] ?? 0;
}

/**
 * Convert a date (YYYY-MM-DD) + time (HH:mm) in a given timezone to UTC milliseconds.
 *
 * Uses the Intl offset-comparison technique to find the timezone's UTC offset
 * on the given date, then adjusts accordingly.
 */
function toUtcMs(dateStr: string, time: string, timezone: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);

  // Create a Date assuming these components are UTC
  const utcAssumption = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

  // Find the offset of this timezone at approximately this time
  const testDate = new Date(utcAssumption);
  const utcStr = testDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = testDate.toLocaleString('en-US', { timeZone: timezone });

  const utcParsed = new Date(utcStr);
  const tzParsed = new Date(tzStr);

  // offsetMs = how far ahead the timezone is from UTC
  const offsetMs = tzParsed.getTime() - utcParsed.getTime();

  // The actual UTC time = desired local time - offset
  return utcAssumption - offsetMs;
}

/**
 * Format a UTC Date as ISO 8601 string localized to a specific timezone.
 * Returns format like "2026-03-20T09:00:00-05:00"
 */
function formatAsIso(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';

  const localStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;

  // Compute timezone offset string (e.g., "-05:00")
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = date.toLocaleString('en-US', { timeZone: timezone });
  const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
  const offsetMin = Math.round(offsetMs / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const offsetHr = String(Math.floor(absMin / 60)).padStart(2, '0');
  const offsetMn = String(absMin % 60).padStart(2, '0');

  return `${localStr}${sign}${offsetHr}:${offsetMn}`;
}

// ─── Core Engine ───────────────────────────────────────────────────────────

/**
 * Compute available time slots for a given event type on a specific date.
 *
 * Algorithm:
 * 1. Load event type (duration, buffers, constraints)
 * 2. Load availability schedule → weekly_hours for day-of-week + date_overrides
 * 3. Load existing bookings for that host on that date (status != cancelled)
 * 4. If Google Calendar connected → getFreeBusy() for that date
 * 5. Convert availability windows to slot candidates at duration intervals
 * 6. Subtract: existing bookings + buffers, Google Cal busy, slots within min_notice
 * 7. Apply max_per_day limit
 * 8. Return slots in the requested timezone
 */
export interface SlotsResult {
  slots: AvailableSlot[];
  google_calendar_connected: boolean;
  google_calendar_error?: string;
}

export async function computeAvailableSlots(
  eventTypeId: number,
  date: string,       // YYYY-MM-DD
  timezone: string,   // Requester's timezone (e.g., "America/New_York")
): Promise<SlotsResult> {

  // ── 1. Load event type ──────────────────────────────────────────────────
  const eventType = await queryOne<SchedulingEventType>(
    `SELECT et.*, COALESCE(u.display_name, u.email) AS host_name, u.email AS host_email
     FROM crm.scheduling_event_types et
     JOIN crm.users u ON u.user_id = et.host_user_id
     WHERE et.event_type_id = $1 AND et.is_active = true`,
    [eventTypeId],
  );

  if (!eventType) {
    return { slots: [], google_calendar_connected: false }; // Event type not found or inactive
  }

  // ── 2. Load availability schedule ───────────────────────────────────────
  let availability: SchedulingAvailability | null = null;

  if (eventType.availability_id) {
    availability = await queryOne<SchedulingAvailability>(
      `SELECT * FROM crm.scheduling_availability WHERE availability_id = $1`,
      [eventType.availability_id],
    );
  }

  // Fall back to user's default availability
  if (!availability) {
    availability = await queryOne<SchedulingAvailability>(
      `SELECT * FROM crm.scheduling_availability
       WHERE user_id = $1 AND org_id = $2 AND is_default = true`,
      [eventType.host_user_id, eventType.org_id],
    );
  }

  if (!availability) {
    return { slots: [], google_calendar_connected: false }; // No availability configured
  }

  const availTz = availability.timezone;

  // ── 2b. Get time windows for the requested date ─────────────────────────
  const dayIndex = getDayOfWeekInTimezone(date, availTz);
  const dayName = DAY_NAMES[dayIndex];

  // Date overrides take priority over weekly_hours
  const dateOverrides = availability.date_overrides || {};
  const weeklyHours = availability.weekly_hours || {} as WeeklyHours;
  const windows: TimeWindow[] = dateOverrides[date] ?? weeklyHours[dayName] ?? [];

  if (windows.length === 0) {
    return { slots: [], google_calendar_connected: false }; // Not available on this day
  }

  // ── 3. Generate slot candidates ─────────────────────────────────────────
  const durationMs = eventType.duration_minutes * 60_000;
  const slotCandidates: Array<{ startMs: number; endMs: number }> = [];

  for (const window of windows) {
    const windowStartMs = toUtcMs(date, window.start, availTz);
    const windowEndMs = toUtcMs(date, window.end, availTz);

    let cursor = windowStartMs;
    while (cursor + durationMs <= windowEndMs) {
      slotCandidates.push({ startMs: cursor, endMs: cursor + durationMs });
      cursor += durationMs;
    }
  }

  if (slotCandidates.length === 0) {
    return { slots: [], google_calendar_connected: false };
  }

  // ── 4. Load existing bookings for host on this date ─────────────────────
  // Use a wider window (midnight-to-midnight in availability tz) to catch edge cases
  const rangeStartUtc = new Date(toUtcMs(date, '00:00', availTz)).toISOString();
  const rangeEndUtc = new Date(toUtcMs(date, '23:59', availTz) + 60_000).toISOString();

  const bookings = await query<Pick<SchedulingBooking, 'starts_at' | 'ends_at'>>(
    `SELECT starts_at, ends_at
     FROM crm.scheduling_bookings
     WHERE host_user_id = $1 AND org_id = $2
       AND starts_at >= $3::timestamptz AND starts_at < $4::timestamptz
       AND status != 'cancelled'`,
    [eventType.host_user_id, eventType.org_id, rangeStartUtc, rangeEndUtc],
  );

  // ── 5. Get Google Calendar busy times ───────────────────────────────────
  const connection = await queryOne<CalendarConnection>(
    `SELECT * FROM crm.calendar_connections
     WHERE user_id = $1 AND org_id = $2 AND provider = 'google' AND is_active = true`,
    [eventType.host_user_id, eventType.org_id],
  );

  const blocked: Array<{ start: number; end: number }> = [];
  let googleCalendarConnected = !!connection;
  let googleCalendarError: string | undefined;

  if (connection) {
    try {
      const busySlots = await getFreeBusy(connection, rangeStartUtc, rangeEndUtc);
      for (const busy of busySlots) {
        blocked.push({
          start: new Date(busy.start).getTime(),
          end: new Date(busy.end).getTime(),
        });
      }
    } catch (err) {
      googleCalendarError = err instanceof Error ? err.message : 'Unknown error';
      console.error('[scheduling] Google FreeBusy error (continuing without):', err);
    }
  }

  // ── 6. Add existing bookings (with buffers) to blocked list ─────────────
  const bufferBeforeMs = eventType.buffer_before * 60_000;
  const bufferAfterMs = eventType.buffer_after * 60_000;

  for (const booking of bookings) {
    blocked.push({
      start: new Date(booking.starts_at).getTime() - bufferBeforeMs,
      end: new Date(booking.ends_at).getTime() + bufferAfterMs,
    });
  }

  // ── 7. Filter slots ────────────────────────────────────────────────────
  const nowMs = Date.now();
  const minNoticeMs = eventType.min_notice * 60_000;
  const maxAheadMs = eventType.max_days_ahead * 24 * 60 * 60_000;

  let available = slotCandidates.filter(slot => {
    // Too soon (within min_notice window)
    if (slot.startMs < nowMs + minNoticeMs) return false;

    // Too far ahead
    if (slot.startMs > nowMs + maxAheadMs) return false;

    // Overlaps with a blocked interval
    for (const block of blocked) {
      if (slot.startMs < block.end && slot.endMs > block.start) {
        return false;
      }
    }

    return true;
  });

  // ── 8. Apply max_per_day limit ──────────────────────────────────────────
  if (eventType.max_per_day != null) {
    const existingBookingCount = bookings.length;
    const remainingSlots = eventType.max_per_day - existingBookingCount;
    if (remainingSlots <= 0) return { slots: [], google_calendar_connected: googleCalendarConnected, google_calendar_error: googleCalendarError };
    available = available.slice(0, remainingSlots);
  }

  // ── 9. Format and return in the requested timezone ──────────────────────
  return {
    slots: available.map(slot => ({
      start: formatAsIso(new Date(slot.startMs), timezone),
      end: formatAsIso(new Date(slot.endMs), timezone),
    })),
    google_calendar_connected: googleCalendarConnected,
    google_calendar_error: googleCalendarError,
  };
}

// ─── Booking Engine ─────────────────────────────────────────────────────────

export interface CreateBookingParams {
  event_type_id: number;
  starts_at: string;      // ISO 8601
  timezone: string;
  name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  answers?: Record<string, unknown>;
}

export interface BookingResult {
  booking_id: number;
  meeting_url: string | null;
  cancel_token: string;
  confirmation_page_url: string;
  starts_at: string;
  ends_at: string;
}

/**
 * Create a booking — the core booking engine.
 *
 * 1. Validate slot is still available (prevent double-booking with FOR UPDATE)
 * 2. Create booking row
 * 3. Create Google Calendar event with Meet link (if connected)
 * 4. Auto-link contact by email
 * 5. Create touchpoint
 * 6. Generate AI agenda (if enabled — placeholder for Session 8)
 * 7. Send confirmation emails
 * 8. Return booking result
 */
export async function createBooking(params: CreateBookingParams): Promise<BookingResult> {
  const { event_type_id, starts_at, timezone, name, email, phone, business_name, answers } = params;

  // ── 1. Load event type with host info ───────────────────────────────────
  const eventType = await queryOne<SchedulingEventType & { host_name: string; host_email: string }>(
    `SELECT et.*, COALESCE(u.display_name, u.email) AS host_name, u.email AS host_email
     FROM crm.scheduling_event_types et
     JOIN crm.users u ON u.user_id = et.host_user_id
     WHERE et.event_type_id = $1 AND et.is_active = true`,
    [event_type_id],
  );

  if (!eventType) {
    throw new BookingError('Event type not found or is inactive', 404);
  }

  // Calculate end time
  const startsAtDate = new Date(starts_at);
  const endsAtDate = new Date(startsAtDate.getTime() + eventType.duration_minutes * 60_000);
  const ends_at = endsAtDate.toISOString();

  // ── 2. Race-condition-safe slot validation + booking insert ─────────────
  // Use a transaction with advisory lock to prevent double-booking
  const cancelToken = crypto.randomUUID();

  // Check for conflicting bookings with FOR UPDATE lock
  const conflict = await queryOne<{ booking_id: number }>(
    `SELECT booking_id FROM crm.scheduling_bookings
     WHERE host_user_id = $1 AND org_id = $2
       AND status != 'cancelled'
       AND starts_at < $3::timestamptz AND ends_at > $4::timestamptz
     FOR UPDATE`,
    [eventType.host_user_id, eventType.org_id, ends_at, starts_at],
  );

  if (conflict) {
    throw new BookingError('This time slot is no longer available', 409);
  }

  // Insert booking
  const booking = await queryOne<SchedulingBooking>(
    `INSERT INTO crm.scheduling_bookings (
      org_id, event_type_id, host_user_id,
      invitee_name, invitee_email, invitee_phone, invitee_timezone,
      starts_at, ends_at, status, location_type,
      cancel_token, answers, metadata
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6, $7,
      $8::timestamptz, $9::timestamptz, 'confirmed', $10,
      $11, $12, '{}'::jsonb
    ) RETURNING *`,
    [
      eventType.org_id, event_type_id, eventType.host_user_id,
      name, email, phone || null, timezone,
      starts_at, ends_at, eventType.location_type,
      cancelToken, JSON.stringify(answers || {}),
    ],
  );

  if (!booking) {
    throw new BookingError('Failed to create booking', 500);
  }

  // ── 3. Create Google Calendar event ─────────────────────────────────────
  let meetingUrl: string | null = null;
  let googleEventId: string | null = null;

  if (eventType.location_type === 'google_meet') {
    const connection = await queryOne<CalendarConnection>(
      `SELECT * FROM crm.calendar_connections
       WHERE user_id = $1 AND org_id = $2 AND provider = 'google' AND is_active = true`,
      [eventType.host_user_id, eventType.org_id],
    );

    if (connection) {
      try {
        const event = await createEventWithMeet(connection, {
          summary: `${eventType.name} - ${business_name || name}`,
          description: `Booked via SalesHub scheduling.\n\nBusiness: ${business_name || 'Not provided'}\nContact: ${name} (${email})${phone ? `\nPhone: ${phone}` : ''}`,
          startDateTime: starts_at,
          endDateTime: ends_at,
          timezone,
          attendees: [
            { email, displayName: name },
            { email: eventType.host_email, displayName: eventType.host_name },
          ],
        });

        meetingUrl = event.meetLink;
        googleEventId = event.eventId;

        // Update booking with meeting details
        await query(
          `UPDATE crm.scheduling_bookings
           SET meeting_url = $1, google_event_id = $2
           WHERE booking_id = $3`,
          [meetingUrl, googleEventId, booking.booking_id],
        );
      } catch (err) {
        console.error('[scheduling] Google Calendar event creation failed:', err);
        // Continue without Google Calendar — booking is still valid
      }
    }
  }

  // ── 3b. Create Zoom meeting ─────────────────────────────────────────────
  if (eventType.location_type === 'zoom' && !meetingUrl) {
    const zoomConnection = await queryOne<CalendarConnection>(
      `SELECT * FROM crm.calendar_connections
       WHERE user_id = $1 AND org_id = $2 AND provider = 'zoom' AND is_active = true`,
      [eventType.host_user_id, eventType.org_id],
    );

    if (zoomConnection) {
      try {
        const meeting = await createZoomMeeting(zoomConnection, {
          topic: `${eventType.name} — ${name}`,
          startTime: starts_at,
          duration: eventType.duration_minutes,
          timezone,
        });

        meetingUrl = meeting.joinUrl;

        await query(
          `UPDATE crm.scheduling_bookings
           SET meeting_url = $1, zoom_meeting_id = $2
           WHERE booking_id = $3`,
          [meetingUrl, String(meeting.meetingId), booking.booking_id],
        );
      } catch (err) {
        console.error('[scheduling] Zoom meeting creation failed:', err);
        // Continue without Zoom — booking is still valid
      }
    }
  }

  // ── 4. Auto-link contact by email ───────────────────────────────────────
  let contactId: number | null = null;
  const existingContact = await queryOne<{ contact_id: number }>(
    `SELECT contact_id FROM crm.contacts
     WHERE email = $1 AND org_id = $2`,
    [email, eventType.org_id],
  );

  if (existingContact) {
    contactId = existingContact.contact_id;
    await query(
      `UPDATE crm.scheduling_bookings SET contact_id = $1 WHERE booking_id = $2`,
      [contactId, booking.booking_id],
    );
  }

  // ── 5. Create touchpoint ────────────────────────────────────────────────
  if (contactId) {
    await query(
      `INSERT INTO crm.touchpoints
       (contact_id, org_id, channel, event_type, direction, source_system, subject, body_preview, metadata, occurred_at)
       VALUES ($1, $2, 'scheduling', 'meeting_booked', 'inbound', 'saleshub', $3, $4, $5, NOW())`,
      [
        contactId,
        eventType.org_id,
        `${eventType.name} booked`,
        `Meeting with ${name} on ${new Date(starts_at).toLocaleDateString()}`,
        JSON.stringify({
          booking_id: booking.booking_id,
          event_type: eventType.name,
          duration_minutes: eventType.duration_minutes,
          meeting_url: meetingUrl,
        }),
      ],
    );
  }

  // ── 6. AI agenda generation (Session 8) ──────────────────────────────────
  if (eventType.ai_agenda_enabled && contactId) {
    try {
      const { generateMeetingAgenda, loadFathomContext, loadEmailBrainContext } = await import('./ai');

      // Load contact details
      const contactRow = await queryOne<{
        contact_id: number;
        first_name: string | null;
        last_name: string | null;
        business_name: string | null;
        email: string | null;
        title: string | null;
        lifecycle_stage: string;
        lead_score: number;
        engagement_score: number;
        tags: string[];
        metadata: Record<string, unknown>;
      }>(
        `SELECT contact_id, first_name, last_name, business_name, email, title,
                lifecycle_stage, lead_score, engagement_score, tags, metadata
         FROM crm.contacts WHERE contact_id = $1`,
        [contactId],
      );

      if (contactRow) {
        // Load recent touchpoints for context
        const touchpoints = await query<{
          channel: string;
          event_type: string;
          subject: string;
          body_preview: string;
          occurred_at: string;
        }>(
          `SELECT channel, event_type, subject, body_preview, occurred_at
           FROM crm.touchpoints
           WHERE contact_id = $1 AND org_id = $2
           ORDER BY occurred_at DESC LIMIT 10`,
          [contactId, eventType.org_id],
        );

        // Load Fathom call intelligence and brain content (non-blocking)
        const [fathomContext, brainContent] = await Promise.all([
          contactRow.email ? loadFathomContext(contactRow.email, eventType.org_id) : Promise.resolve(''),
          loadEmailBrainContext(undefined, eventType.org_id),
        ]);

        const agenda = await generateMeetingAgenda({
          contact: contactRow,
          eventType,
          answers: (answers as Record<string, string>) || undefined,
          touchpoints,
          fathomContext,
          brainContent,
        });

        if (agenda) {
          await query(
            `UPDATE crm.scheduling_bookings SET ai_agenda = $1 WHERE booking_id = $2`,
            [agenda, booking.booking_id],
          );
        }
      }
    } catch (agendaErr) {
      // AI agenda is non-critical — log and continue
      console.warn('[scheduling] AI agenda generation failed:', agendaErr);
    }
  }

  // ── 7. Send confirmation emails (async, don't block response) ──────────
  const orgInfo = await queryOne<{
    org_name: string;
    org_slug: string;
    settings: Record<string, unknown>;
  }>(
    `SELECT name as org_name, slug as org_slug, settings FROM crm.organizations WHERE org_id = $1`,
    [eventType.org_id],
  );

  if (orgInfo) {
    const branding = (orgInfo.settings?.branding || {}) as Record<string, string>;
    const org = {
      org_id: eventType.org_id,
      org_name: orgInfo.org_name,
      org_slug: orgInfo.org_slug,
      logo_url: branding.logo_url || null,
      primary_color: branding.primary_color || '#2563eb',
      app_name: branding.app_name || orgInfo.org_name,
    };

    const bookingWithJoins: SchedulingBooking = {
      ...booking,
      meeting_url: meetingUrl,
      google_event_id: googleEventId,
      host_name: eventType.host_name,
      host_email: eventType.host_email,
    };

    // Fire and forget — don't let email failures block the booking response
    sendBookingConfirmation(bookingWithJoins, eventType, org).catch(err => {
      console.error('[scheduling] Confirmation email failed:', err);
    });
  }

  // ── 8. Fire webhook (async, don't block response) ──────────────────────
  const bookingForWebhook: SchedulingBooking = {
    ...booking,
    meeting_url: meetingUrl,
    google_event_id: googleEventId,
    contact_id: contactId,
    host_name: eventType.host_name,
    host_email: eventType.host_email,
  };
  fireSchedulingWebhook('booking.created', bookingForWebhook, eventType).catch(err => {
    console.error('[scheduling] Webhook delivery failed:', err);
  });

  // ── 9. Return result ────────────────────────────────────────────────────
  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saleshub.mikegrowsgreens.com';

  return {
    booking_id: booking.booking_id,
    meeting_url: meetingUrl,
    cancel_token: cancelToken,
    confirmation_page_url: `${BASE_URL}/book/confirm?booking_id=${booking.booking_id}&token=${cancelToken}`,
    starts_at,
    ends_at,
  };
}

/**
 * Cancel or reschedule a booking using the cancel token.
 */
export async function cancelBooking(
  cancelToken: string,
  action: 'cancel' | 'reschedule',
  reason?: string,
  newStartsAt?: string,
): Promise<{ success: boolean; message: string; new_booking_id?: number }> {

  // ── Load the booking ────────────────────────────────────────────────────
  const booking = await queryOne<SchedulingBooking & { host_name: string; host_email: string }>(
    `SELECT b.*, COALESCE(u.display_name, u.email) AS host_name, u.email AS host_email
     FROM crm.scheduling_bookings b
     JOIN crm.users u ON u.user_id = b.host_user_id
     WHERE b.cancel_token = $1 AND b.status = 'confirmed'`,
    [cancelToken],
  );

  if (!booking) {
    throw new BookingError('Booking not found or already cancelled', 404);
  }

  const eventType = await queryOne<SchedulingEventType>(
    `SELECT * FROM crm.scheduling_event_types WHERE event_type_id = $1`,
    [booking.event_type_id],
  );

  if (!eventType) {
    throw new BookingError('Event type not found', 404);
  }

  // ── Cancel in database ──────────────────────────────────────────────────
  const newStatus = action === 'reschedule' ? 'rescheduled' : 'cancelled';
  await query(
    `UPDATE crm.scheduling_bookings
     SET status = $1, cancel_reason = $2, updated_at = NOW()
     WHERE booking_id = $3`,
    [newStatus, reason || null, booking.booking_id],
  );

  // ── Delete Google Calendar event ────────────────────────────────────────
  if (booking.google_event_id) {
    const connection = await queryOne<CalendarConnection>(
      `SELECT * FROM crm.calendar_connections
       WHERE user_id = $1 AND org_id = $2 AND provider = 'google' AND is_active = true`,
      [booking.host_user_id, booking.org_id],
    );

    if (connection) {
      try {
        await deleteEvent(connection, booking.google_event_id);
      } catch (err) {
        console.error('[scheduling] Failed to delete Google event:', err);
      }
    }
  }

  // ── Delete Zoom meeting ────────────────────────────────────────────────
  if (booking.zoom_meeting_id) {
    const zoomConnection = await queryOne<CalendarConnection>(
      `SELECT * FROM crm.calendar_connections
       WHERE user_id = $1 AND org_id = $2 AND provider = 'zoom' AND is_active = true`,
      [booking.host_user_id, booking.org_id],
    );

    if (zoomConnection) {
      try {
        await deleteZoomMeeting(zoomConnection, booking.zoom_meeting_id);
      } catch (err) {
        console.error('[scheduling] Failed to delete Zoom meeting:', err);
      }
    }
  }

  // ── Send cancellation email ─────────────────────────────────────────────
  const orgInfo = await queryOne<{
    org_name: string;
    org_slug: string;
    settings: Record<string, unknown>;
  }>(
    `SELECT name as org_name, slug as org_slug, settings FROM crm.organizations WHERE org_id = $1`,
    [booking.org_id],
  );

  if (orgInfo) {
    const branding = (orgInfo.settings?.branding || {}) as Record<string, string>;
    const org = {
      org_id: booking.org_id,
      org_name: orgInfo.org_name,
      org_slug: orgInfo.org_slug,
      logo_url: branding.logo_url || null,
      primary_color: branding.primary_color || '#2563eb',
      app_name: branding.app_name || orgInfo.org_name,
    };

    const bookingWithReason = { ...booking, cancel_reason: reason || null };

    sendCancellationNotice(bookingWithReason, eventType, org).catch(err => {
      console.error('[scheduling] Cancellation email failed:', err);
    });
  }

  // ── Fire webhook for cancellation ─────────────────────────────────────
  const webhookEvent = action === 'reschedule' ? 'booking.rescheduled' as const : 'booking.cancelled' as const;
  fireSchedulingWebhook(webhookEvent, { ...booking, status: newStatus }, eventType).catch(err => {
    console.error('[scheduling] Cancellation webhook failed:', err);
  });

  // ── Create touchpoint for cancellation ──────────────────────────────────
  if (booking.contact_id) {
    await query(
      `INSERT INTO crm.touchpoints
       (contact_id, org_id, channel, event_type, direction, source_system, subject, body_preview, metadata, occurred_at)
       VALUES ($1, $2, 'scheduling', 'meeting_cancelled', 'inbound', 'saleshub', $3, $4, $5, NOW())`,
      [
        booking.contact_id,
        booking.org_id,
        `${eventType.name} cancelled`,
        reason || 'Meeting cancelled by invitee',
        JSON.stringify({ booking_id: booking.booking_id, action }),
      ],
    );
  }

  // ── Handle reschedule ───────────────────────────────────────────────────
  if (action === 'reschedule' && newStartsAt) {
    try {
      const newBooking = await createBooking({
        event_type_id: booking.event_type_id,
        starts_at: newStartsAt,
        timezone: booking.invitee_timezone,
        name: booking.invitee_name,
        email: booking.invitee_email,
        phone: booking.invitee_phone,
        answers: booking.answers,
      });

      // Link old booking to new one
      await query(
        `UPDATE crm.scheduling_bookings SET rescheduled_to = $1 WHERE booking_id = $2`,
        [newBooking.booking_id, booking.booking_id],
      );

      return {
        success: true,
        message: 'Booking rescheduled successfully',
        new_booking_id: newBooking.booking_id,
      };
    } catch (err) {
      // If rescheduling fails, the original is already cancelled
      const msg = err instanceof BookingError ? err.message : 'Rescheduling failed';
      return { success: true, message: `Original booking cancelled but rescheduling failed: ${msg}` };
    }
  }

  return { success: true, message: 'Booking cancelled successfully' };
}

// ─── Deal-Linked Booking ──────────────────────────────────────────────────

export interface CreateBookingFromDealParams extends CreateBookingParams {
  deal_id: string;
}

/**
 * Create a booking linked to a follow-up deal.
 * Extends standard createBooking() with Fathom deal context for richer AI agendas.
 */
export async function createBookingFromDeal(params: CreateBookingFromDealParams): Promise<BookingResult> {
  const { deal_id, ...bookingParams } = params;

  // Load deal data for context
  const deal = await queryOne<{
    deal_id: string;
    fathom_summary: string | null;
    pain_points: unknown;
    interests: unknown;
    objections: unknown;
    action_items: string | null;
    contact_name: string | null;
    contact_email: string | null;
    business_name: string | null;
    pipeline_stage: string | null;
  }>(
    `SELECT deal_id, fathom_summary, pain_points, interests, objections,
            action_items, contact_name, contact_email, business_name, pipeline_stage
     FROM public.followup_deals
     WHERE deal_id = $1`,
    [deal_id],
  );

  // Create booking with deal metadata in answers
  const result = await createBooking({
    ...bookingParams,
    answers: {
      ...(bookingParams.answers || {}),
      ...(deal ? { _deal_context: JSON.stringify({
        deal_id,
        business_name: deal.business_name,
        pipeline_stage: deal.pipeline_stage,
        fathom_summary: deal.fathom_summary,
        pain_points: deal.pain_points,
        interests: deal.interests,
        objections: deal.objections,
        action_items: deal.action_items,
      }) } : {}),
    },
  });

  // Store deal link in booking metadata
  await query(
    `UPDATE crm.scheduling_bookings
     SET metadata = metadata || $1::jsonb
     WHERE booking_id = $2`,
    [JSON.stringify({ deal_id, source: 'followup_page' }), result.booking_id],
  );

  // If deal has Fathom data, regenerate the agenda with richer deal context
  if (deal?.fathom_summary) {
    try {
      const booking = await queryOne<{ event_type_id: number; ai_agenda: string | null; contact_id: number | null }>(
        `SELECT event_type_id, ai_agenda, contact_id FROM crm.scheduling_bookings WHERE booking_id = $1`,
        [result.booking_id],
      );

      const eventType = await queryOne<{ ai_agenda_enabled: boolean; name: string; description: string | null; duration_minutes: number }>(
        `SELECT ai_agenda_enabled, name, description, duration_minutes FROM crm.scheduling_event_types WHERE event_type_id = $1`,
        [booking?.event_type_id],
      );

      if (eventType?.ai_agenda_enabled && booking) {
        const { generateMeetingAgendaWithDealContext } = await import('./ai');

        const agenda = await generateMeetingAgendaWithDealContext({
          eventType: {
            name: eventType.name,
            description: eventType.description,
            duration_minutes: eventType.duration_minutes,
          },
          inviteeName: params.name,
          inviteeEmail: params.email,
          deal: {
            business_name: deal.business_name,
            pipeline_stage: deal.pipeline_stage,
            fathom_summary: deal.fathom_summary,
            pain_points: Array.isArray(deal.pain_points) ? deal.pain_points as string[] : [],
            interests: Array.isArray(deal.interests) ? deal.interests as string[] : [],
            objections: Array.isArray(deal.objections) ? deal.objections as string[] : [],
            action_items: deal.action_items,
          },
        });

        if (agenda) {
          await query(
            `UPDATE crm.scheduling_bookings SET ai_agenda = $1 WHERE booking_id = $2`,
            [agenda, result.booking_id],
          );
        }
      }
    } catch (err) {
      console.warn('[scheduling] Deal-context AI agenda failed (non-critical):', err);
    }
  }

  return result;
}

// ─── Error Class ──────────────────────────────────────────────────────────

export class BookingError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'BookingError';
  }
}

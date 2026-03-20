/**
 * POST /api/scheduling/import-calendly
 *
 * Admin-only endpoint that imports Calendly data into the built-in scheduling system:
 * 1. Event types → crm.scheduling_event_types
 * 2. Availability schedules → crm.scheduling_availability
 * 3. Past bookings (6 months) → crm.scheduling_bookings
 * 4. Existing crm.calendly_events rows → crm.scheduling_bookings
 *
 * Duplicate handling: skips event types if slug already exists.
 */

import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/route-auth';
import { query, queryOne, queryWithRLS } from '@/lib/db';
import {
  getCalendlyUser,
  getCalendlyEventTypes,
  getCalendlyAvailabilitySchedules,
  getCalendlyScheduledEvents,
  getCalendlyEventInvitees,
  type CalendlyEventType,
  type CalendlyAvailabilityRule,
  type CalendlyCustomQuestion,
  type CalendlyScheduledEvent,
} from '@/lib/calendly-api';
import type { WeeklyHours, TimeWindow, CustomQuestion } from '@/lib/types';

// ─── Mapping Helpers ────────────────────────────────────────────────────────

/**
 * Map Calendly availability rules to our weekly_hours JSONB format.
 */
function mapAvailabilityRules(rules: CalendlyAvailabilityRule[]): {
  weeklyHours: WeeklyHours;
  dateOverrides: Record<string, TimeWindow[]>;
} {
  const weeklyHours: WeeklyHours = {
    monday: [], tuesday: [], wednesday: [], thursday: [],
    friday: [], saturday: [], sunday: [],
  };
  const dateOverrides: Record<string, TimeWindow[]> = {};

  for (const rule of rules) {
    const intervals: TimeWindow[] = rule.intervals.map(i => ({
      start: i.from,
      end: i.to,
    }));

    if (rule.type === 'wday' && rule.wday) {
      const day = rule.wday.toLowerCase() as keyof WeeklyHours;
      if (day in weeklyHours) {
        weeklyHours[day] = intervals;
      }
    } else if (rule.type === 'date' && rule.date) {
      dateOverrides[rule.date] = intervals;
    }
  }

  return { weeklyHours, dateOverrides };
}

/**
 * Map Calendly custom questions to our CustomQuestion format.
 */
function mapCustomQuestions(questions: CalendlyCustomQuestion[]): CustomQuestion[] {
  return questions
    .filter(q => q.enabled)
    .sort((a, b) => a.position - b.position)
    .map(q => {
      let type: CustomQuestion['type'];
      switch (q.type) {
        case 'text':
        case 'string':
          type = 'text';
          break;
        case 'phone_number':
          type = 'text';
          break;
        case 'single_select':
        case 'multi_select':
          type = 'select';
          break;
        case 'radio_button':
          type = 'radio';
          break;
        default:
          type = 'text';
      }

      return {
        type,
        label: q.name,
        required: q.required,
        ...(q.answer_choices.length > 0 ? { options: q.answer_choices } : {}),
      };
    });
}

/**
 * Infer location_type from Calendly event type locations.
 */
function inferLocationType(eventType: CalendlyEventType): string {
  // Calendly doesn't expose locations in the event_types endpoint directly,
  // but the scheduled events have location info. Default to google_meet.
  return 'google_meet';
}

/**
 * Map Calendly event status → our booking status.
 */
function mapBookingStatus(event: CalendlyScheduledEvent, hasNoShow: boolean): string {
  if (event.status === 'canceled') return 'cancelled';
  if (hasNoShow) return 'no_show';
  const now = new Date();
  const endTime = new Date(event.end_time);
  return endTime < now ? 'completed' : 'confirmed';
}

/**
 * Generate a slug from a Calendly event type name.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ─── Import Progress Type ───────────────────────────────────────────────────

interface ImportResult {
  eventTypes: { imported: number; skipped: number; errors: string[] };
  availability: { imported: number; skipped: number; errors: string[] };
  bookings: { imported: number; skipped: number; contactsLinked: number; errors: string[] };
  legacyMigrated: { imported: number; skipped: number; errors: string[] };
  user: { name: string; email: string };
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export const POST = withAdminAuth(async (_request, { tenant, orgId }) => {
  const userId = tenant.user_id;

  // 1. Get Calendly API key from org settings
  const org = await queryOne<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM crm.organizations WHERE org_id = $1`,
    [orgId]
  );

  const settings = (org?.settings || {}) as Record<string, unknown>;
  const integrations = (settings.integrations || {}) as Record<string, unknown>;
  const calendlyConfig = (integrations.calendly || {}) as { api_key?: string };
  const apiKey = calendlyConfig.api_key;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Calendly API key configured. Go to Settings → Integrations to add your Calendly API key.' },
      { status: 400 }
    );
  }

  const result: ImportResult = {
    eventTypes: { imported: 0, skipped: 0, errors: [] },
    availability: { imported: 0, skipped: 0, errors: [] },
    bookings: { imported: 0, skipped: 0, contactsLinked: 0, errors: [] },
    legacyMigrated: { imported: 0, skipped: 0, errors: [] },
    user: { name: '', email: '' },
  };

  try {
    // 2. Get Calendly user profile
    const calendlyUser = await getCalendlyUser(apiKey);
    result.user = { name: calendlyUser.name, email: calendlyUser.email };
    console.log(`[import-calendly] User: ${calendlyUser.name} (${calendlyUser.email})`);

    // 3. Import availability schedules
    const schedules = await getCalendlyAvailabilitySchedules(apiKey, calendlyUser.uri);
    const availabilityMap = new Map<string, number>(); // calendly schedule URI → our availability_id

    for (const schedule of schedules) {
      try {
        const { weeklyHours, dateOverrides } = mapAvailabilityRules(schedule.rules);

        const existing = await queryOne<{ availability_id: number }>(
          `SELECT availability_id FROM crm.scheduling_availability
           WHERE org_id = $1 AND user_id = $2 AND name = $3`,
          [orgId, userId, schedule.name]
        );

        if (existing) {
          availabilityMap.set(schedule.uri, existing.availability_id);
          result.availability.skipped++;
          continue;
        }

        const row = await queryOne<{ availability_id: number }>(
          `INSERT INTO crm.scheduling_availability
           (org_id, user_id, name, timezone, is_default, weekly_hours, date_overrides)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING availability_id`,
          [
            orgId,
            userId,
            schedule.name,
            schedule.timezone || 'America/Chicago',
            schedule.default,
            JSON.stringify(weeklyHours),
            JSON.stringify(dateOverrides),
          ]
        );

        if (row) {
          availabilityMap.set(schedule.uri, row.availability_id);
          result.availability.imported++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.availability.errors.push(`Schedule "${schedule.name}": ${msg}`);
      }
    }

    // 4. Import event types
    const calendlyEventTypes = await getCalendlyEventTypes(apiKey, calendlyUser.uri);
    const eventTypeMap = new Map<string, number>(); // calendly event type URI → our event_type_id

    // Get default availability to link to event types
    const defaultAvailabilityId = availabilityMap.values().next().value ?? null;

    for (const et of calendlyEventTypes) {
      try {
        const slug = slugify(et.name);

        // Check for duplicate by slug
        const existing = await queryOne<{ event_type_id: number }>(
          `SELECT event_type_id FROM crm.scheduling_event_types
           WHERE org_id = $1 AND slug = $2`,
          [orgId, slug]
        );

        if (existing) {
          eventTypeMap.set(et.uri, existing.event_type_id);
          result.eventTypes.skipped++;
          continue;
        }

        const customQuestions = mapCustomQuestions(et.custom_questions || []);
        const locationType = inferLocationType(et);

        const row = await queryOne<{ event_type_id: number }>(
          `INSERT INTO crm.scheduling_event_types
           (org_id, host_user_id, availability_id, name, slug, description,
            duration_minutes, color, location_type, custom_questions,
            ai_agenda_enabled, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING event_type_id`,
          [
            orgId,
            userId,
            defaultAvailabilityId,
            et.name,
            slug,
            et.description_plain || null,
            et.duration,
            et.color || '#3B82F6',
            locationType,
            JSON.stringify(customQuestions),
            false,
            et.active,
          ]
        );

        if (row) {
          eventTypeMap.set(et.uri, row.event_type_id);
          result.eventTypes.imported++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.eventTypes.errors.push(`Event type "${et.name}": ${msg}`);
      }
    }

    // 5. Import scheduled events (past 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const minStartTime = sixMonthsAgo.toISOString();

    const events = await getCalendlyScheduledEvents(apiKey, calendlyUser.uri, minStartTime);
    console.log(`[import-calendly] Found ${events.length} events from past 6 months`);

    for (const event of events) {
      try {
        // Get the event_type_id from our mapping
        const eventTypeId = eventTypeMap.get(event.event_type);
        if (!eventTypeId) {
          result.bookings.skipped++;
          continue;
        }

        // Get invitees for this event
        const invitees = await getCalendlyEventInvitees(apiKey, event.uri);
        if (invitees.length === 0) {
          result.bookings.skipped++;
          continue;
        }

        // Process each invitee as a separate booking
        for (const invitee of invitees) {
          // Check for duplicate by email + start time + event type
          const existingBooking = await queryOne<{ booking_id: number }>(
            `SELECT booking_id FROM crm.scheduling_bookings
             WHERE org_id = $1 AND invitee_email = $2 AND starts_at = $3 AND event_type_id = $4`,
            [orgId, invitee.email, event.start_time, eventTypeId]
          );

          if (existingBooking) {
            result.bookings.skipped++;
            continue;
          }

          // Auto-link to contact by email
          const contact = await queryOne<{ contact_id: number }>(
            `SELECT contact_id FROM crm.contacts WHERE email = $1 AND org_id = $2`,
            [invitee.email, orgId]
          );

          const hasNoShow = invitee.no_show !== null;
          const status = mapBookingStatus(event, hasNoShow);
          const cancelToken = crypto.randomUUID();

          // Map invitee answers
          const answers: Record<string, string> = {};
          for (const qa of invitee.questions_and_answers || []) {
            answers[qa.question] = qa.answer;
          }

          // Determine meeting URL from event location
          const meetingUrl = event.location?.join_url || null;
          const locationType = event.location?.type === 'zoom'
            ? 'zoom'
            : event.location?.type === 'google_conference'
              ? 'google_meet'
              : 'google_meet';

          await query(
            `INSERT INTO crm.scheduling_bookings
             (org_id, event_type_id, host_user_id, contact_id,
              invitee_name, invitee_email, invitee_phone, invitee_timezone,
              starts_at, ends_at, status, location_type, meeting_url,
              cancel_token, cancel_reason, answers, metadata,
              reminder_24h_sent, reminder_1h_sent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
            [
              orgId,
              eventTypeId,
              userId,
              contact?.contact_id || null,
              invitee.name || 'Unknown',
              invitee.email,
              null, // Calendly doesn't expose phone in standard invitee response
              invitee.timezone || 'America/Chicago',
              event.start_time,
              event.end_time,
              status,
              locationType,
              meetingUrl,
              cancelToken,
              event.cancellation?.reason || null,
              JSON.stringify(answers),
              JSON.stringify({
                source: 'calendly_import',
                calendly_event_uri: event.uri,
                calendly_invitee_uri: invitee.uri,
              }),
              true, // Past events don't need reminders
              true,
            ]
          );

          result.bookings.imported++;
          if (contact) result.bookings.contactsLinked++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.bookings.errors.push(`Event ${event.uri}: ${msg}`);
      }
    }

    // 6. Migrate legacy crm.calendly_events rows
    await migrateLegacyCalendlyEvents(orgId, userId, eventTypeMap, result);

    console.log(`[import-calendly] Import complete:`, JSON.stringify(result, null, 2));
    return NextResponse.json({ success: true, result });

  } catch (err) {
    console.error('[import-calendly] Fatal error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Calendly import failed: ${msg}`, partialResult: result },
      { status: 500 }
    );
  }
});

// ─── Legacy Migration ───────────────────────────────────────────────────────

/**
 * Migrate existing crm.calendly_events rows into crm.scheduling_bookings.
 * These are events that were synced via n8n before the built-in scheduling system.
 */
async function migrateLegacyCalendlyEvents(
  orgId: number,
  userId: number,
  eventTypeMap: Map<string, number>,
  result: ImportResult
) {
  // Get all legacy events that haven't been migrated yet
  const legacyEvents = await query<{
    calendly_id: number;
    contact_id: number | null;
    event_type: string | null;
    event_name: string | null;
    invitee_name: string | null;
    invitee_email: string | null;
    scheduled_at: string;
    duration_minutes: number | null;
    location: string | null;
    cancelled: boolean;
    cancel_reason: string | null;
    calendly_event_uri: string | null;
  }>(
    `SELECT * FROM crm.calendly_events
     WHERE org_id = $1
     AND calendly_id NOT IN (
       SELECT (metadata->>'legacy_calendly_id')::integer
       FROM crm.scheduling_bookings
       WHERE org_id = $1 AND metadata->>'legacy_calendly_id' IS NOT NULL
     )
     ORDER BY scheduled_at DESC`,
    [orgId]
  );

  console.log(`[import-calendly] Found ${legacyEvents.length} unmigrated legacy events`);

  // We need a default event type for legacy events that don't match any imported type
  let defaultEventTypeId: number | null = null;

  // Try to match by event_type name, or use the first available event type
  const allEventTypes = await query<{ event_type_id: number; name: string }>(
    `SELECT event_type_id, name FROM crm.scheduling_event_types WHERE org_id = $1`,
    [orgId]
  );

  if (allEventTypes.length > 0) {
    defaultEventTypeId = allEventTypes[0].event_type_id;
  }

  for (const legacy of legacyEvents) {
    try {
      if (!legacy.invitee_email) {
        result.legacyMigrated.skipped++;
        continue;
      }

      // Try to find matching event type by name
      let eventTypeId = defaultEventTypeId;
      if (legacy.event_type) {
        const matched = allEventTypes.find(
          et => et.name.toLowerCase() === legacy.event_type!.toLowerCase()
        );
        if (matched) eventTypeId = matched.event_type_id;
      }

      if (!eventTypeId) {
        result.legacyMigrated.skipped++;
        continue;
      }

      // Check for duplicate
      const existing = await queryOne<{ booking_id: number }>(
        `SELECT booking_id FROM crm.scheduling_bookings
         WHERE org_id = $1 AND invitee_email = $2 AND starts_at = $3`,
        [orgId, legacy.invitee_email, legacy.scheduled_at]
      );

      if (existing) {
        result.legacyMigrated.skipped++;
        continue;
      }

      const durationMinutes = legacy.duration_minutes || 30;
      const endsAt = new Date(new Date(legacy.scheduled_at).getTime() + durationMinutes * 60000).toISOString();
      const status = legacy.cancelled ? 'cancelled' : 'completed';
      const cancelToken = crypto.randomUUID();

      await query(
        `INSERT INTO crm.scheduling_bookings
         (org_id, event_type_id, host_user_id, contact_id,
          invitee_name, invitee_email, invitee_phone, invitee_timezone,
          starts_at, ends_at, status, location_type, meeting_url,
          cancel_token, cancel_reason, answers, metadata,
          reminder_24h_sent, reminder_1h_sent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        [
          orgId,
          eventTypeId,
          userId,
          legacy.contact_id,
          legacy.invitee_name || 'Unknown',
          legacy.invitee_email,
          null,
          'America/Chicago', // Legacy events don't store timezone
          legacy.scheduled_at,
          endsAt,
          status,
          'google_meet',
          legacy.location || null,
          cancelToken,
          legacy.cancel_reason || null,
          JSON.stringify({}),
          JSON.stringify({
            source: 'legacy_calendly_migration',
            legacy_calendly_id: legacy.calendly_id,
            calendly_event_uri: legacy.calendly_event_uri || null,
          }),
          true,
          true,
        ]
      );

      result.legacyMigrated.imported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.legacyMigrated.errors.push(`Legacy event ${legacy.calendly_id}: ${msg}`);
    }
  }
}

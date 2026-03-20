/**
 * Scheduling Webhook Delivery System
 *
 * Fires webhook events on booking lifecycle changes:
 * - booking.created
 * - booking.cancelled
 * - booking.rescheduled
 * - booking.completed
 * - booking.no_show
 *
 * Logs all deliveries in crm.scheduling_webhook_log.
 */

import { query, queryOne } from './db';
import type { SchedulingBooking, SchedulingEventType } from './types';

export type SchedulingWebhookEvent =
  | 'booking.created'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'booking.completed'
  | 'booking.no_show';

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  type: 'inbound' | 'outbound';
  status?: string;
}

interface WebhookPayload {
  event: SchedulingWebhookEvent;
  timestamp: string;
  data: {
    booking_id: number;
    event_type_id: number;
    event_type_name: string;
    invitee_name: string;
    invitee_email: string;
    invitee_phone: string | null;
    invitee_timezone: string;
    starts_at: string;
    ends_at: string;
    status: string;
    location_type: string;
    meeting_url: string | null;
    cancel_reason?: string | null;
    rescheduled_to?: number | null;
    host_name?: string;
    host_email?: string;
    contact_id?: number | null;
    answers?: Record<string, unknown>;
  };
  org_id: number;
}

/**
 * Build a standardized webhook payload from a booking + event type.
 */
function buildPayload(
  event: SchedulingWebhookEvent,
  booking: SchedulingBooking,
  eventType: SchedulingEventType,
): WebhookPayload {
  return {
    event,
    timestamp: new Date().toISOString(),
    data: {
      booking_id: booking.booking_id,
      event_type_id: booking.event_type_id,
      event_type_name: eventType.name,
      invitee_name: booking.invitee_name,
      invitee_email: booking.invitee_email,
      invitee_phone: booking.invitee_phone,
      invitee_timezone: booking.invitee_timezone,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      status: booking.status,
      location_type: booking.location_type,
      meeting_url: booking.meeting_url,
      cancel_reason: booking.cancel_reason,
      rescheduled_to: booking.rescheduled_to,
      host_name: booking.host_name,
      host_email: booking.host_email,
      contact_id: booking.contact_id,
      answers: booking.answers,
    },
    org_id: booking.org_id,
  };
}

/**
 * Get all outbound webhook URLs for an org from settings.
 */
async function getWebhookUrls(orgId: number): Promise<string[]> {
  const org = await queryOne<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM crm.organizations WHERE org_id = $1`,
    [orgId],
  );

  if (!org?.settings) return [];

  const integrations = org.settings.integrations as Record<string, unknown> | undefined;
  if (!integrations) return [];

  const webhooks = integrations.n8n_webhooks as WebhookConfig[] | undefined;
  if (!Array.isArray(webhooks)) return [];

  // Only fire outbound webhooks
  return webhooks
    .filter(w => w.type === 'outbound' && w.url)
    .map(w => w.url);
}

/**
 * Deliver a webhook payload to a single URL and log the result.
 */
async function deliverWebhook(
  url: string,
  payload: WebhookPayload,
  bookingId: number | null,
): Promise<void> {
  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SalesHub-Event': payload.event,
        'X-SalesHub-Timestamp': payload.timestamp,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    responseStatus = res.status;

    try {
      responseBody = await res.text();
      if (responseBody.length > 2000) {
        responseBody = responseBody.slice(0, 2000) + '... (truncated)';
      }
    } catch {
      responseBody = null;
    }

    success = res.ok;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : 'Unknown error';
    success = false;
  }

  // Log to crm.scheduling_webhook_log
  await query(
    `INSERT INTO crm.scheduling_webhook_log
     (org_id, booking_id, event_name, webhook_url, request_body, response_status, response_body, success, attempted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      payload.org_id,
      bookingId,
      payload.event,
      url,
      JSON.stringify(payload),
      responseStatus,
      responseBody,
      success,
    ],
  );
}

/**
 * Fire a scheduling webhook event — delivers to all configured outbound
 * webhook URLs for the org. Runs async (fire-and-forget).
 */
export async function fireSchedulingWebhook(
  event: SchedulingWebhookEvent,
  booking: SchedulingBooking,
  eventType: SchedulingEventType,
): Promise<void> {
  try {
    const urls = await getWebhookUrls(booking.org_id);
    if (urls.length === 0) return;

    const payload = buildPayload(event, booking, eventType);

    // Deliver to all URLs in parallel
    await Promise.allSettled(
      urls.map(url => deliverWebhook(url, payload, booking.booking_id)),
    );
  } catch (err) {
    console.error(`[scheduling-webhooks] Error firing ${event}:`, err);
  }
}

/**
 * Fire a webhook for a booking status change (completed, no_show).
 * Loads the event type from DB since these are called from the bookings API.
 */
export async function fireBookingStatusWebhook(
  bookingId: number,
  newStatus: 'completed' | 'no_show',
): Promise<void> {
  try {
    const booking = await queryOne<SchedulingBooking & { host_name: string; host_email: string }>(
      `SELECT b.*, u.name AS host_name, u.email AS host_email
       FROM crm.scheduling_bookings b
       JOIN public.users u ON u.user_id = b.host_user_id
       WHERE b.booking_id = $1`,
      [bookingId],
    );

    if (!booking) return;

    const eventType = await queryOne<SchedulingEventType>(
      `SELECT * FROM crm.scheduling_event_types WHERE event_type_id = $1`,
      [booking.event_type_id],
    );

    if (!eventType) return;

    const event: SchedulingWebhookEvent = newStatus === 'completed'
      ? 'booking.completed'
      : 'booking.no_show';

    await fireSchedulingWebhook(event, { ...booking, status: newStatus }, eventType);
  } catch (err) {
    console.error(`[scheduling-webhooks] Error firing status webhook:`, err);
  }
}

/**
 * Scheduling email templates — confirmation, cancellation, and reminders.
 * Uses sendEmail() from email.ts with org branding.
 */

import { sendEmail } from './email';
import type { SchedulingBooking, SchedulingEventType } from './types';

interface OrgBranding {
  org_id: number;
  org_name: string;
  org_slug: string;
  logo_url?: string | null;
  primary_color?: string;
  app_name?: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saleshub.mikegrowsgreens.com';

// ─── Shared Helpers ────────────────────────────────────────────────────────

function formatDateTime(isoStr: string, timezone: string): string {
  const date = new Date(isoStr);
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(isoStr: string, timezone: string): string {
  const date = new Date(isoStr);
  return date.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(isoStr: string, timezone: string): string {
  const date = new Date(isoStr);
  return date.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function buildGoogleCalendarUrl(booking: SchedulingBooking, eventType: SchedulingEventType): string {
  const start = new Date(booking.starts_at).toISOString().replace(/[-:]/g, '').replace('.000', '');
  const end = new Date(booking.ends_at).toISOString().replace(/[-:]/g, '').replace('.000', '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventType.name,
    dates: `${start}/${end}`,
    details: booking.meeting_url ? `Join: ${booking.meeting_url}` : '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateIcsContent(booking: SchedulingBooking, eventType: SchedulingEventType, org: OrgBranding): string {
  const start = new Date(booking.starts_at).toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const end = new Date(booking.ends_at).toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SalesHub//Scheduling//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `DTSTAMP:${now}`,
    `UID:booking-${booking.booking_id}@${org.org_slug}.saleshub`,
    `SUMMARY:${eventType.name}`,
    `DESCRIPTION:${booking.meeting_url ? `Join meeting: ${booking.meeting_url}` : `Meeting with ${org.org_name}`}`,
    booking.meeting_url ? `URL:${booking.meeting_url}` : '',
    `ORGANIZER;CN=${org.org_name}:mailto:${booking.host_email || 'noreply@saleshub.com'}`,
    `ATTENDEE;CN=${booking.invitee_name}:mailto:${booking.invitee_email}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function emailWrapper(org: OrgBranding, content: string): string {
  const color = org.primary_color || '#2563eb';
  const name = org.app_name || org.org_name;
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: ${color}; padding: 24px 32px;">
        ${org.logo_url ? `<img src="${org.logo_url}" alt="${name}" style="height: 32px; margin-bottom: 8px;" />` : ''}
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">${name}</h1>
      </div>
      <div style="padding: 32px;">
        ${content}
      </div>
      <div style="padding: 16px 32px; background: #f8fafc; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Powered by ${name}</p>
      </div>
    </div>
  `;
}

// ─── Booking Confirmation ──────────────────────────────────────────────────

export async function sendBookingConfirmation(
  booking: SchedulingBooking,
  eventType: SchedulingEventType,
  org: OrgBranding,
): Promise<void> {
  const tz = booking.invitee_timezone;
  const dateStr = formatDate(booking.starts_at, tz);
  const timeStr = `${formatTime(booking.starts_at, tz)} - ${formatTime(booking.ends_at, tz)}`;
  const cancelUrl = `${BASE_URL}/book/cancel?token=${booking.cancel_token}`;
  const gcalUrl = buildGoogleCalendarUrl(booking, eventType);

  // Email to invitee
  const inviteeHtml = emailWrapper(org, `
    <h2 style="color: #1e293b; margin: 0 0 8px;">Meeting Confirmed</h2>
    <p style="color: #475569; margin: 0 0 24px;">Your meeting has been booked successfully.</p>

    <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px; width: 100px;">Event</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px; font-weight: 600;">${eventType.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Date</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${dateStr}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Time</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${timeStr}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Duration</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${eventType.duration_minutes} minutes</td>
        </tr>
        ${booking.meeting_url ? `
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Join</td>
          <td style="padding: 4px 0; font-size: 14px;"><a href="${booking.meeting_url}" style="color: ${org.primary_color || '#2563eb'};">Join Meeting</a></td>
        </tr>
        ` : ''}
      </table>
    </div>

    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${gcalUrl}" style="display: inline-block; background: ${org.primary_color || '#2563eb'}; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px; margin-right: 8px;">Add to Google Calendar</a>
    </div>

    <p style="color: #94a3b8; font-size: 13px; text-align: center;">
      Need to make changes? <a href="${cancelUrl}" style="color: ${org.primary_color || '#2563eb'};">Cancel or reschedule</a>
    </p>
  `);

  await sendEmail({
    to: booking.invitee_email,
    subject: `Confirmed: ${eventType.name} - ${dateStr}`,
    html: inviteeHtml,
    text: `Your meeting "${eventType.name}" is confirmed for ${dateStr} at ${timeStr}.${booking.meeting_url ? ` Join: ${booking.meeting_url}` : ''} Cancel: ${cancelUrl}`,
    orgId: org.org_id,
  });

  // Email to host
  if (booking.host_email) {
    const hostHtml = emailWrapper(org, `
      <h2 style="color: #1e293b; margin: 0 0 8px;">New Booking</h2>
      <p style="color: #475569; margin: 0 0 24px;">You have a new meeting booked with <strong>${booking.invitee_name}</strong>.</p>

      <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px; width: 100px;">Event</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px; font-weight: 600;">${eventType.name}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Invitee</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${booking.invitee_name} (${booking.invitee_email})</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Date</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${dateStr}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Time</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${timeStr}</td>
          </tr>
          ${booking.meeting_url ? `
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Join</td>
            <td style="padding: 4px 0; font-size: 14px;"><a href="${booking.meeting_url}" style="color: ${org.primary_color || '#2563eb'};">Join Meeting</a></td>
          </tr>
          ` : ''}
        </table>
      </div>

      ${booking.ai_agenda ? `
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h3 style="color: #92400e; margin: 0 0 8px; font-size: 14px;">AI Meeting Agenda</h3>
        <div style="color: #78350f; font-size: 13px; white-space: pre-wrap;">${booking.ai_agenda}</div>
      </div>
      ` : ''}
    `);

    await sendEmail({
      to: booking.host_email,
      subject: `New Booking: ${eventType.name} with ${booking.invitee_name}`,
      html: hostHtml,
      text: `New booking: "${eventType.name}" with ${booking.invitee_name} (${booking.invitee_email}) on ${dateStr} at ${timeStr}.`,
      orgId: org.org_id,
    });
  }
}

// ─── Cancellation Notice ───────────────────────────────────────────────────

export async function sendCancellationNotice(
  booking: SchedulingBooking,
  eventType: SchedulingEventType,
  org: OrgBranding,
): Promise<void> {
  const tz = booking.invitee_timezone;
  const dateStr = formatDate(booking.starts_at, tz);
  const timeStr = `${formatTime(booking.starts_at, tz)} - ${formatTime(booking.ends_at, tz)}`;
  const bookUrl = `${BASE_URL}/book/${org.org_slug}/${eventType.slug}`;

  // To invitee
  const inviteeHtml = emailWrapper(org, `
    <h2 style="color: #1e293b; margin: 0 0 8px;">Meeting Cancelled</h2>
    <p style="color: #475569; margin: 0 0 24px;">Your meeting has been cancelled.</p>

    <div style="background: #fef2f2; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px; width: 100px;">Event</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px; text-decoration: line-through;">${eventType.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Date</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px; text-decoration: line-through;">${dateStr}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Time</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px; text-decoration: line-through;">${timeStr}</td>
        </tr>
        ${booking.cancel_reason ? `
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Reason</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${booking.cancel_reason}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <div style="text-align: center;">
      <a href="${bookUrl}" style="display: inline-block; background: ${org.primary_color || '#2563eb'}; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">Book a New Time</a>
    </div>
  `);

  await sendEmail({
    to: booking.invitee_email,
    subject: `Cancelled: ${eventType.name} - ${dateStr}`,
    html: inviteeHtml,
    text: `Your meeting "${eventType.name}" on ${dateStr} at ${timeStr} has been cancelled.${booking.cancel_reason ? ` Reason: ${booking.cancel_reason}` : ''} Book a new time: ${bookUrl}`,
    orgId: org.org_id,
  });

  // To host
  if (booking.host_email) {
    const hostHtml = emailWrapper(org, `
      <h2 style="color: #1e293b; margin: 0 0 8px;">Booking Cancelled</h2>
      <p style="color: #475569; margin: 0 0 24px;"><strong>${booking.invitee_name}</strong> has cancelled their meeting.</p>

      <div style="background: #fef2f2; border-radius: 8px; padding: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px; width: 100px;">Event</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${eventType.name}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Date</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${dateStr} at ${timeStr}</td>
          </tr>
          ${booking.cancel_reason ? `
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Reason</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${booking.cancel_reason}</td>
          </tr>
          ` : ''}
        </table>
      </div>
    `);

    await sendEmail({
      to: booking.host_email,
      subject: `Cancelled: ${eventType.name} with ${booking.invitee_name}`,
      html: hostHtml,
      text: `${booking.invitee_name} cancelled "${eventType.name}" on ${dateStr}.${booking.cancel_reason ? ` Reason: ${booking.cancel_reason}` : ''}`,
      orgId: org.org_id,
    });
  }
}

// ─── Booking Reminder ──────────────────────────────────────────────────────

export async function sendBookingReminder(
  booking: SchedulingBooking,
  eventType: SchedulingEventType,
  org: OrgBranding,
  type: '24h' | '1h',
): Promise<void> {
  const tz = booking.invitee_timezone;
  const dateStr = formatDate(booking.starts_at, tz);
  const timeStr = `${formatTime(booking.starts_at, tz)} - ${formatTime(booking.ends_at, tz)}`;
  const label = type === '24h' ? 'tomorrow' : 'in 1 hour';

  // To invitee
  const inviteeHtml = emailWrapper(org, `
    <h2 style="color: #1e293b; margin: 0 0 8px;">Reminder: Meeting ${label}</h2>
    <p style="color: #475569; margin: 0 0 24px;">Just a reminder about your upcoming meeting.</p>

    <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px; width: 100px;">Event</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px; font-weight: 600;">${eventType.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Date</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${dateStr}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Time</td>
          <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${timeStr}</td>
        </tr>
        ${booking.meeting_url ? `
        <tr>
          <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Join</td>
          <td style="padding: 4px 0; font-size: 14px;"><a href="${booking.meeting_url}" style="color: ${org.primary_color || '#2563eb'}; font-weight: 600;">Join Meeting</a></td>
        </tr>
        ` : ''}
      </table>
    </div>

    ${booking.meeting_url ? `
    <div style="text-align: center;">
      <a href="${booking.meeting_url}" style="display: inline-block; background: ${org.primary_color || '#2563eb'}; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Join Meeting</a>
    </div>
    ` : ''}
  `);

  await sendEmail({
    to: booking.invitee_email,
    subject: `Reminder: ${eventType.name} ${label} - ${timeStr}`,
    html: inviteeHtml,
    text: `Reminder: "${eventType.name}" is ${label} on ${dateStr} at ${timeStr}.${booking.meeting_url ? ` Join: ${booking.meeting_url}` : ''}`,
    orgId: org.org_id,
  });

  // To host
  if (booking.host_email) {
    const hostHtml = emailWrapper(org, `
      <h2 style="color: #1e293b; margin: 0 0 8px;">Meeting Reminder: ${label}</h2>
      <p style="color: #475569; margin: 0 0 24px;">You have a meeting with <strong>${booking.invitee_name}</strong> ${label}.</p>

      <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px; width: 100px;">Event</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px; font-weight: 600;">${eventType.name}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px;">With</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${booking.invitee_name} (${booking.invitee_email})</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Time</td>
            <td style="color: #1e293b; padding: 4px 0; font-size: 14px;">${dateStr} at ${timeStr}</td>
          </tr>
          ${booking.meeting_url ? `
          <tr>
            <td style="color: #64748b; padding: 4px 0; font-size: 14px;">Join</td>
            <td style="padding: 4px 0; font-size: 14px;"><a href="${booking.meeting_url}" style="color: ${org.primary_color || '#2563eb'}; font-weight: 600;">Join Meeting</a></td>
          </tr>
          ` : ''}
        </table>
      </div>

      ${booking.ai_agenda ? `
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px;">
        <h3 style="color: #92400e; margin: 0 0 8px; font-size: 14px;">AI Meeting Agenda</h3>
        <div style="color: #78350f; font-size: 13px; white-space: pre-wrap;">${booking.ai_agenda}</div>
      </div>
      ` : ''}
    `);

    await sendEmail({
      to: booking.host_email,
      subject: `Reminder: ${eventType.name} with ${booking.invitee_name} ${label}`,
      html: hostHtml,
      text: `Reminder: "${eventType.name}" with ${booking.invitee_name} ${label} on ${dateStr} at ${timeStr}.`,
      orgId: org.org_id,
    });
  }
}

export { generateIcsContent };

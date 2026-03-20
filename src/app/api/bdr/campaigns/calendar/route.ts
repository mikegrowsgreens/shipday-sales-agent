import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/bdr/campaigns/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns scheduled and sent emails for a date range, used by the SendCalendar component.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const end = searchParams.get('end') || new Date().toISOString().split('T')[0];

    // Get email sends within date range
    const sends = await query<{
      id: string;
      lead_id: number;
      business_name: string;
      subject: string;
      angle: string;
      scheduled_at: string;
      status: string;
      sent_at: string | null;
      open_count: number;
      replied: boolean;
    }>(
      `SELECT
        es.id,
        es.lead_id,
        l.business_name,
        es.subject,
        es.angle,
        COALESCE(es.sent_at, es.created_at) as scheduled_at,
        CASE
          WHEN es.replied THEN 'replied'
          WHEN es.open_count > 0 THEN 'opened'
          WHEN es.sent_at IS NOT NULL THEN 'sent'
          ELSE 'scheduled'
        END as status,
        es.sent_at,
        es.open_count,
        es.replied
       FROM bdr.email_sends es
       JOIN bdr.leads l ON l.lead_id = es.lead_id AND l.org_id = $3
       WHERE (es.sent_at >= $1 OR es.created_at >= $1)
         AND (es.sent_at <= ($2::date + interval '1 day') OR es.created_at <= ($2::date + interval '1 day'))
         AND es.org_id = $3
       ORDER BY COALESCE(es.sent_at, es.created_at) ASC`,
      [start, end, orgId]
    );

    // Also get campaign_emails with scheduled future sends
    const scheduled = await query<{
      id: string;
      lead_id: number;
      business_name: string;
      subject: string;
      angle: string;
      scheduled_at: string;
      status: string;
    }>(
      `SELECT
        ce.id::text,
        ce.lead_id,
        l.business_name,
        ce.subject,
        ce.angle,
        ce.scheduled_send_at as scheduled_at,
        'scheduled' as status
       FROM bdr.campaign_emails ce
       JOIN bdr.leads l ON l.lead_id::text = ce.lead_id::text AND l.org_id = $3
       WHERE ce.status = 'ready'
         AND ce.scheduled_send_at IS NOT NULL
         AND ce.scheduled_send_at >= $1
         AND ce.scheduled_send_at <= ($2::date + interval '1 day')
         AND ce.org_id = $3
       ORDER BY ce.scheduled_send_at ASC`,
      [start, end, orgId]
    ).catch(() => [] as typeof sends); // Table might not have scheduled_send_at column yet

    const allSends = [
      ...sends.map(s => ({ ...s, sent_at: s.sent_at, replied: s.replied, open_count: s.open_count })),
      ...scheduled.map(s => ({
        ...s,
        sent_at: null as string | null,
        open_count: 0,
        replied: false,
      })),
    ];

    return NextResponse.json({ sends: allSends });
  } catch (error) {
    console.error('[bdr/campaigns/calendar] error:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar data' }, { status: 500 });
  }
}

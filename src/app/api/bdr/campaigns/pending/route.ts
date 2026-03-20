import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/bdr/campaigns/pending
 * Returns all pending/scheduled/ready campaign emails across all leads,
 * with business name, step #, scheduled date, delay, status, subject, and angle.
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();

    const rows = await query<{
      id: number;
      lead_id: string;
      business_name: string | null;
      contact_name: string | null;
      step_number: number;
      status: string;
      channel: string;
      delay_days: number;
      scheduled_at: string | null;
      subject: string | null;
      angle: string | null;
      template_name: string | null;
      total_steps: number;
    }>(
      `SELECT ce.id, ce.lead_id, l.business_name, l.contact_name,
              ce.step_number, ce.status, ce.channel, ce.delay_days,
              ce.scheduled_at, ce.subject, ce.angle,
              ct.name as template_name,
              (SELECT count(*)::int FROM bdr.campaign_emails ce2 WHERE ce2.lead_id = ce.lead_id AND ce2.template_id = ce.template_id) as total_steps
       FROM bdr.campaign_emails ce
       JOIN bdr.leads l ON l.lead_id = ce.lead_id
       LEFT JOIN bdr.campaign_templates ct ON ct.id = ce.template_id
       WHERE ce.status IN ('pending', 'scheduled', 'ready')
         AND ce.org_id = $1
       ORDER BY
         CASE ce.status WHEN 'ready' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
         ce.scheduled_at ASC NULLS LAST,
         l.business_name ASC,
         ce.step_number ASC
       LIMIT 200`,
      [tenant.org_id]
    );

    return NextResponse.json({ pending: rows, total: rows.length });
  } catch (error) {
    console.error('[bdr/campaigns/pending] error:', error);
    return NextResponse.json({ error: 'Failed to fetch pending emails' }, { status: 500 });
  }
}

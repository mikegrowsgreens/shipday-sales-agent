import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * POST /api/bdr/campaigns/status
 * Get campaign step status for lead(s).
 * Returns all campaign_emails for the given lead_ids, grouped by lead.
 *
 * Body: { lead_ids: number[] }
 */
export async function POST(request: NextRequest) {
  try {
    const { lead_ids } = await request.json();

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ campaigns: {} });
    }

    const placeholders = lead_ids.map((_: number, i: number) => `$${i + 1}`).join(',');
    const rows = await query<{
      id: number;
      lead_id: number;
      template_id: number;
      step_number: number;
      channel: string;
      delay_days: number;
      angle: string;
      tone: string;
      subject: string;
      body: string;
      status: string;
      scheduled_at: string | null;
      sent_at: string | null;
    }>(
      `SELECT id, lead_id, template_id, step_number, channel, delay_days,
              angle, tone, subject, body, status, scheduled_at, sent_at
       FROM bdr.campaign_emails
       WHERE lead_id IN (${placeholders})
       ORDER BY lead_id, step_number`,
      lead_ids
    );

    // Group by lead_id
    const campaigns: Record<number, typeof rows> = {};
    for (const row of rows) {
      if (!campaigns[row.lead_id]) campaigns[row.lead_id] = [];
      campaigns[row.lead_id].push(row);
    }

    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('[campaign-status] error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign status' }, { status: 500 });
  }
}

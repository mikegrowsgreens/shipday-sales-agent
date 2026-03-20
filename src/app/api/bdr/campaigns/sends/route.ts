import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/bdr/campaigns/sends
 * Returns send history for given lead_ids, grouped by lead_id.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { lead_ids } = await request.json();

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ sends: {} });
    }

    const placeholders = lead_ids.map((_, i) => `$${i + 1}`).join(', ');

    const rows = await query<{
      id: string;
      lead_id: number;
      subject: string;
      angle: string;
      variant_id: string | null;
      sent_at: string;
      open_count: number;
      first_open_at: string | null;
      click_count: number;
      replied: boolean;
      reply_at: string | null;
      reply_sentiment: string | null;
    }>(
      `SELECT id, lead_id, subject, angle, variant_id, sent_at,
              open_count, first_open_at, click_count,
              replied, reply_at, reply_sentiment
       FROM bdr.email_sends
       WHERE lead_id IN (${placeholders}) AND org_id = $${lead_ids.length + 1}
       ORDER BY sent_at ASC`,
      [...lead_ids, orgId]
    );

    // Group by lead_id
    const sends: Record<number, typeof rows> = {};
    for (const row of rows) {
      if (!sends[row.lead_id]) sends[row.lead_id] = [];
      sends[row.lead_id].push(row);
    }

    return NextResponse.json({ sends });
  } catch (error) {
    console.error('[bdr/campaigns/sends] error:', error);
    return NextResponse.json({ error: 'Failed to fetch sends' }, { status: 500 });
  }
}

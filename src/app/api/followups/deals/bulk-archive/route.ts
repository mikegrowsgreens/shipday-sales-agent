import { NextRequest, NextResponse } from 'next/server';
import { queryShipday } from '@/lib/db';

/**
 * POST /api/followups/deals/bulk-archive
 * Archive multiple deals at once.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deal_ids } = body as { deal_ids?: string[] };

    if (!deal_ids?.length) {
      return NextResponse.json({ error: 'deal_ids required' }, { status: 400 });
    }

    const placeholders = deal_ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await queryShipday(
      `UPDATE shipday.deals
       SET agent_status = 'archived', updated_at = NOW()
       WHERE deal_id IN (${placeholders})
         AND (agent_status IS NULL OR agent_status != 'archived')`,
      deal_ids,
    );

    // queryShipday returns rows for SELECT; for UPDATE we just confirm success
    return NextResponse.json({
      archived: deal_ids.length,
      message: `${deal_ids.length} deals archived`,
    });
  } catch (error) {
    console.error('[followups/bulk-archive] error:', error);
    return NextResponse.json({ error: 'Bulk archive failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';

// POST /api/customers/campaigns/[id]/approve — Bulk approve or approve specific sends
export const POST = withAuth(async (request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

    const body = await request.json() as { send_ids?: number[]; approve_all?: boolean };

    let result;
    if (body.approve_all) {
      result = await query<{ id: number }>(
        `UPDATE crm.customer_campaign_sends
         SET status = 'approved', updated_at = NOW()
         WHERE campaign_id = $1 AND org_id = $2 AND status = 'draft'
         RETURNING id`,
        [id, orgId]
      );
    } else if (body.send_ids?.length) {
      result = await query<{ id: number }>(
        `UPDATE crm.customer_campaign_sends
         SET status = 'approved', updated_at = NOW()
         WHERE campaign_id = $1 AND org_id = $2 AND id = ANY($3) AND status = 'draft'
         RETURNING id`,
        [id, orgId, body.send_ids]
      );
    } else {
      return NextResponse.json({ error: 'Provide send_ids or approve_all' }, { status: 400 });
    }

    return NextResponse.json({ approved: result.length });
  } catch (error) {
    console.error('[customers/campaigns/approve] POST error:', error);
    return NextResponse.json({ error: 'Failed to approve sends' }, { status: 500 });
  }
});

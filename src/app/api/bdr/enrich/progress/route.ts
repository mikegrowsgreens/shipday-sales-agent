import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/bdr/enrich/progress
 * Returns per-lead status details for a set of lead IDs — used to track enrichment progress.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const { lead_ids } = await request.json() as { lead_ids: number[] };
    if (!lead_ids?.length) {
      return NextResponse.json({ counts: {}, leads: [] });
    }

    // Get aggregate counts
    const countRows = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count FROM bdr.leads
       WHERE lead_id = ANY($1) AND org_id = $2
       GROUP BY status`,
      [lead_ids, orgId],
    );

    const counts: Record<string, number> = {};
    for (const r of countRows) {
      counts[r.status] = parseInt(r.count);
    }

    // Get per-lead details
    const leadRows = await query<{
      lead_id: number;
      business_name: string | null;
      status: string;
      tier: string | null;
      total_score: number | null;
    }>(
      `SELECT lead_id, business_name, status, tier, total_score
       FROM bdr.leads
       WHERE lead_id = ANY($1) AND org_id = $2
       ORDER BY
         CASE status
           WHEN 'scored' THEN 1
           WHEN 'enriched' THEN 2
           WHEN 'enriching' THEN 3
           ELSE 4
         END,
         business_name ASC`,
      [lead_ids, orgId],
    );

    return NextResponse.json({
      total: lead_ids.length,
      counts,
      leads: leadRows,
    });
  } catch (error) {
    console.error('[bdr/enrich/progress] error:', error);
    return NextResponse.json({ error: 'Progress check failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

/**
 * POST /api/bdr/enrich
 * Trigger enrichment for specified lead_ids (or all pending_enrichment leads).
 * Fires n8n webhook to start enrichment workflow.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();
    const { lead_ids, limit } = body as { lead_ids?: number[]; limit?: number };

    let targetLeads: { lead_id: number; business_name: string | null }[];

    if (lead_ids?.length) {
      targetLeads = await query<{ lead_id: number; business_name: string | null }>(
        `SELECT lead_id, business_name FROM bdr.leads
         WHERE lead_id = ANY($1) AND status IN ('new', 'pending_enrichment') AND org_id = $2`,
        [lead_ids, orgId],
      );
    } else {
      // Enrich up to N pending leads
      const enrichLimit = limit || 25;
      targetLeads = await query<{ lead_id: number; business_name: string | null }>(
        `SELECT lead_id, business_name FROM bdr.leads
         WHERE status IN ('new', 'pending_enrichment') AND org_id = $2
         ORDER BY created_at ASC
         LIMIT $1`,
        [enrichLimit, orgId],
      );
    }

    if (!targetLeads.length) {
      return NextResponse.json({ enriched: 0, message: 'No leads to enrich' });
    }

    // Mark as enriching
    const ids = targetLeads.map(l => l.lead_id);
    await query(
      `UPDATE bdr.leads SET status = 'enriching', updated_at = NOW()
       WHERE lead_id = ANY($1) AND org_id = $2`,
      [ids, orgId],
    );

    // Fire n8n webhook (n8n 2.x format: /webhook/{workflowId}/{nodeName}/{path})
    const webhookUrl = `${process.env.N8N_BASE_URL || ''}/webhook/J21QESaBcSGIZEQo/webhookenrichtrigger/bdr-enrich-trigger`;

    const res = await fetchWithTimeout(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_ids: ids,
        count: ids.length,
        triggered_by: 'saleshub',
        triggered_at: new Date().toISOString(),
      }),
      timeout: 60000,
    });

    if (!res.ok) {
      // Revert status on failure
      await query(
        `UPDATE bdr.leads SET status = 'pending_enrichment', updated_at = NOW()
         WHERE lead_id = ANY($1) AND org_id = $2`,
        [ids, orgId],
      );
      return NextResponse.json({ error: 'Enrichment webhook failed' }, { status: 502 });
    }

    return NextResponse.json({
      enriched: ids.length,
      lead_ids: ids,
      message: `Enrichment triggered for ${ids.length} leads`,
    });
  } catch (error) {
    console.error('[bdr/enrich] error:', error);
    return NextResponse.json({ error: 'Enrichment failed' }, { status: 500 });
  }
}

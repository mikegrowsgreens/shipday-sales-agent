import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * POST /api/bdr/enrich
 * Trigger enrichment for specified lead_ids (or all pending_enrichment leads).
 * Fires n8n webhook to start enrichment workflow.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_ids, limit } = body as { lead_ids?: number[]; limit?: number };

    let targetLeads: { lead_id: number; business_name: string | null }[];

    if (lead_ids?.length) {
      const placeholders = lead_ids.map((_, i) => `$${i + 1}`).join(',');
      targetLeads = await query<{ lead_id: number; business_name: string | null }>(
        `SELECT lead_id, business_name FROM bdr.leads
         WHERE lead_id IN (${placeholders}) AND status IN ('new', 'pending_enrichment')`,
        lead_ids,
      );
    } else {
      // Enrich up to N pending leads
      const enrichLimit = limit || 25;
      targetLeads = await query<{ lead_id: number; business_name: string | null }>(
        `SELECT lead_id, business_name FROM bdr.leads
         WHERE status IN ('new', 'pending_enrichment')
         ORDER BY created_at ASC
         LIMIT $1`,
        [enrichLimit],
      );
    }

    if (!targetLeads.length) {
      return NextResponse.json({ enriched: 0, message: 'No leads to enrich' });
    }

    // Mark as enriching
    const ids = targetLeads.map(l => l.lead_id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await query(
      `UPDATE bdr.leads SET status = 'enriching', updated_at = NOW()
       WHERE lead_id IN (${placeholders})`,
      ids,
    );

    // Fire n8n webhook (n8n 2.x format: /webhook/{workflowId}/{nodeName}/{path})
    const webhookUrl = `${process.env.N8N_BASE_URL || 'https://automation.mikegrowsgreens.com'}/webhook/J21QESaBcSGIZEQo/webhookenrichtrigger/bdr-enrich-trigger`;

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_ids: ids,
        count: ids.length,
        triggered_by: 'saleshub',
        triggered_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      // Revert status on failure
      await query(
        `UPDATE bdr.leads SET status = 'pending_enrichment', updated_at = NOW()
         WHERE lead_id IN (${placeholders})`,
        ids,
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

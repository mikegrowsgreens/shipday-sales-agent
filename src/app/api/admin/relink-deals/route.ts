import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/admin/relink-deals
 *
 * Re-links contacts to deals by matching emails in public.deals.contact_emails.
 * Also backfills owner_name on deals from HubSpot owner data if available.
 *
 * Two operations:
 * 1. Set wincall_deal_id on contacts that match deal emails but have no link
 * 2. Update lifecycle_stage for contacts linked to won/lost deals
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    // Step 1: Link contacts to deals by email match
    // For each contact missing wincall_deal_id, find a matching deal via contact_emails array
    const linkResult = await query(`
      UPDATE crm.contacts c
      SET wincall_deal_id = matched.deal_id::text,
          business_name = COALESCE(c.business_name, matched.account_name),
          updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (LOWER(TRIM(unnested_email)))
          LOWER(TRIM(unnested_email)) as email_lower,
          d.deal_id,
          d.account_name
        FROM public.deals d,
        LATERAL unnest(d.contact_emails) AS unnested_email
        WHERE unnested_email IS NOT NULL
          AND TRIM(unnested_email) != ''
        ORDER BY LOWER(TRIM(unnested_email)), d.mrr DESC NULLS LAST
      ) matched
      WHERE LOWER(TRIM(c.email)) = matched.email_lower
        AND c.org_id = $1
        AND c.wincall_deal_id IS NULL
    `, [orgId]);

    // Step 2: Sync lifecycle_stage from linked deals for won/lost/negotiation
    const stageResult = await query(`
      UPDATE crm.contacts c
      SET lifecycle_stage = CASE
            WHEN d.outcome = 'won' OR d.stage = 'Closed Won' THEN 'won'
            WHEN d.outcome = 'lost' OR d.stage = 'Closed Lost' THEN 'lost'
            WHEN d.stage IN ('Negotiation', 'Proposal') THEN 'negotiation'
            ELSE c.lifecycle_stage
          END,
          updated_at = NOW()
      FROM public.deals d
      WHERE d.deal_id::text = c.wincall_deal_id::text
        AND c.org_id = $1
        AND c.lifecycle_stage NOT IN (
          CASE
            WHEN d.outcome = 'won' OR d.stage = 'Closed Won' THEN 'won'
            WHEN d.outcome = 'lost' OR d.stage = 'Closed Lost' THEN 'lost'
            WHEN d.stage IN ('Negotiation', 'Proposal') THEN 'negotiation'
            ELSE c.lifecycle_stage
          END
        )
    `, [orgId]);

    // Step 3: Report on contacts in won/lost stage that STILL have no deal link
    const orphans = await query<{ lifecycle_stage: string; count: string }>(`
      SELECT lifecycle_stage, COUNT(*)::text as count
      FROM crm.contacts
      WHERE org_id = $1
        AND lifecycle_stage IN ('won', 'lost')
        AND wincall_deal_id IS NULL
      GROUP BY lifecycle_stage
    `, [orgId]);

    // Step 4: Report distinct owner_name values on linked deals
    const owners = await query<{ owner_name: string | null; count: string }>(`
      SELECT d.owner_name, COUNT(*)::text as count
      FROM crm.contacts c
      JOIN public.deals d ON d.deal_id::text = c.wincall_deal_id::text
      WHERE c.org_id = $1
      GROUP BY d.owner_name
      ORDER BY count DESC
    `, [orgId]);

    return NextResponse.json({
      linked: linkResult.length ?? 0,
      stages_updated: stageResult.length ?? 0,
      orphan_won_lost: orphans.reduce((acc, r) => {
        acc[r.lifecycle_stage] = parseInt(r.count);
        return acc;
      }, {} as Record<string, number>),
      deal_owners: owners.map(o => ({ owner_name: o.owner_name, count: parseInt(o.count) })),
    });
  } catch (error) {
    console.error('[relink-deals] error:', error);
    return NextResponse.json({ error: 'Failed to relink deals' }, { status: 500 });
  }
}

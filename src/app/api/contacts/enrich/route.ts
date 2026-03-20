import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Contact } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';

// POST /api/contacts/enrich - Enrich contact data from available sources
export const POST = withAuth(async (request: NextRequest, { orgId }) => {
  const body = await request.json();
  const { contact_id } = body;

  if (!contact_id) {
    return NextResponse.json({ error: 'Missing contact_id' }, { status: 400 });
  }

  const contact = await queryOne<Contact>(
    `SELECT * FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`, [contact_id, orgId]
  );

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const enriched: Record<string, unknown> = {};
  const sources: string[] = [];

  // Enrich from BDR leads if linked
  if (contact.bdr_lead_id) {
    try {
      const lead = await queryOne<Record<string, unknown>>(
        `SELECT business_name, contact_name, contact_email, phone, city, state,
                website, cuisine_type, google_rating, google_review_count, tier, total_score
         FROM bdr.leads WHERE lead_id = $1 AND org_id = $2`,
        [contact.bdr_lead_id, orgId]
      );
      if (lead) {
        if (!contact.website && lead.website) enriched.website = lead.website;
        if (!contact.phone && lead.phone) enriched.phone = lead.phone;
        if (!contact.business_name && lead.business_name) enriched.business_name = lead.business_name;

        // Store enrichment data in metadata
        enriched.metadata = {
          ...(contact.metadata || {}),
          enrichment: {
            ...(contact.metadata as Record<string, unknown>)?.enrichment as Record<string, unknown> || {},
            bdr: {
              cuisine_type: lead.cuisine_type,
              google_rating: lead.google_rating,
              google_review_count: lead.google_review_count,
              tier: lead.tier,
              city: lead.city,
              state: lead.state,
              total_score: lead.total_score,
              enriched_at: new Date().toISOString(),
            },
          },
        };
        sources.push('bdr');
      }
    } catch { /* BDR enrichment optional */ }
  }

  // Enrich from touchpoint data (aggregate engagement)
  const engagement = await queryOne<{ total: string; replies: string; opens: string }>(
    `SELECT COUNT(*)::text as total,
            COUNT(CASE WHEN event_type = 'replied' THEN 1 END)::text as replies,
            COUNT(CASE WHEN event_type = 'opened' THEN 1 END)::text as opens
     FROM crm.touchpoints WHERE contact_id = $1 AND org_id = $2`,
    [contact_id, orgId]
  );

  if (engagement) {
    const totalTouches = parseInt(engagement.total);
    const replies = parseInt(engagement.replies);
    const opens = parseInt(engagement.opens);

    // Auto-calculate engagement score
    const newEngagementScore = Math.min(100, replies * 20 + opens * 5 + Math.min(totalTouches, 10) * 2);
    if (newEngagementScore > contact.engagement_score) {
      enriched.engagement_score = newEngagementScore;
    }
    sources.push('touchpoints');
  }

  // Apply updates
  if (Object.keys(enriched).length > 0) {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(enriched)) {
      if (key === 'metadata') {
        sets.push(`metadata = $${idx++}`);
        values.push(JSON.stringify(val));
      } else {
        sets.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }

    values.push(contact_id, orgId);
    await query(
      `UPDATE crm.contacts SET ${sets.join(', ')} WHERE contact_id = $${idx} AND org_id = $${idx + 1}`,
      values
    );

    // Update stage if still raw
    if (contact.lifecycle_stage === 'raw' && Object.keys(enriched).length > 1) {
      await query(
        `UPDATE crm.contacts SET lifecycle_stage = 'enriched' WHERE contact_id = $1 AND lifecycle_stage = 'raw' AND org_id = $2`,
        [contact_id, orgId]
      );
    }

    // Log enrichment touchpoint
    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, occurred_at, org_id)
       VALUES ($1, 'manual', 'enriched', 'outbound', 'saleshub', $2, NOW(), $3)`,
      [contact_id, `Enriched from: ${sources.join(', ')}`, orgId]
    );
  }

  const updated = await queryOne<Contact>(
    `SELECT * FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`, [contact_id, orgId]
  );

  return NextResponse.json({
    contact: updated,
    enriched_fields: Object.keys(enriched),
    sources,
  });
});

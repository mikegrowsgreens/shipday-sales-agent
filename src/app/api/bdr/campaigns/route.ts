import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgPlan, requireFeature } from '@/lib/feature-gate';

/**
 * GET /api/bdr/campaigns
 * Campaign queue — returns leads with email content, scores, and pipeline summary.
 * Supports filters: ?status=email_ready&angle=missed_calls&tier=tier_1&search=pizza&limit=50&offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();

    const plan = await getOrgPlan(tenant.org_id);
    requireFeature(plan, 'campaigns');

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') || 'email_ready';
    const angle = searchParams.get('angle');
    const tier = searchParams.get('tier');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = ['l.status = $1', 'l.org_id = $2'];
    const params: (string | number)[] = [status, tenant.org_id];
    let paramIndex = 3;

    // When viewing email_ready queue, exclude:
    // 1. Leads that already have sent campaign emails (follow-ups, not first-touch)
    // 2. Leads whose contact_email was already cold-emailed (prevents re-sending to Japonessa etc.)
    // 3. Leads whose email domain matches a won customer in CRM (prevents emailing Zeeks etc.)
    if (status === 'email_ready') {
      conditions.push(
        `NOT EXISTS (
          SELECT 1 FROM bdr.campaign_emails ce
          WHERE ce.lead_id = l.lead_id AND ce.org_id = l.org_id AND ce.status = 'sent'
        )`
      );
      // Exclude leads whose email was already sent via email_sends
      conditions.push(
        `NOT EXISTS (
          SELECT 1 FROM bdr.email_sends es
          WHERE es.lead_id = l.lead_id AND es.org_id = l.org_id
        )`
      );
      // Exclude leads whose email domain matches a won customer in CRM
      conditions.push(
        `NOT EXISTS (
          SELECT 1 FROM crm.contacts c
          WHERE c.org_id = l.org_id
            AND c.lifecycle_stage = 'won'
            AND l.contact_email IS NOT NULL
            AND SPLIT_PART(c.email, '@', 2) = SPLIT_PART(l.contact_email, '@', 2)
            AND SPLIT_PART(l.contact_email, '@', 2) != ''
        )`
      );
    }

    if (angle) {
      conditions.push(`l.email_angle = $${paramIndex}`);
      params.push(angle);
      paramIndex++;
    }

    if (tier) {
      conditions.push(`l.tier = $${paramIndex}`);
      params.push(tier);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(l.business_name ILIKE $${paramIndex} OR l.contact_name ILIKE $${paramIndex} OR l.contact_email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get leads
    const leads = await query<Record<string, unknown>>(
      `SELECT l.lead_id, l.business_name, l.contact_name, l.contact_email, l.phone,
              l.city, l.state, l.website, l.cuisine_type, l.google_rating, l.google_review_count,
              l.market_type, l.tier, l.status, l.total_score,
              l.contact_quality_score, l.business_strength_score, l.delivery_potential_score,
              l.tech_stack_score, l.win_pattern_score, l.mrr_potential_score,
              l.email_subject, l.email_body, l.email_angle, l.email_variant_id,
              l.campaign_template_id, l.campaign_step,
              l.has_replied, l.reply_sentiment, l.reply_summary, l.reply_date,
              l.created_at, l.updated_at
       FROM bdr.leads l
       WHERE ${whereClause}
       ORDER BY l.total_score DESC NULLS LAST, l.updated_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Get total count for pagination
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM bdr.leads l WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult[0]?.count || '0');

    // Get pipeline summary
    const pipeline = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count FROM bdr.leads WHERE org_id = $1 GROUP BY status ORDER BY count DESC`,
      [tenant.org_id]
    );

    return NextResponse.json({
      leads,
      total,
      limit,
      offset,
      pipeline: pipeline.map(r => ({ status: r.status, count: parseInt(r.count) })),
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[bdr-campaigns] error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateCampaignSequence, loadEmailBrainContext, loadROIContext, loadFathomContext } from '@/lib/ai';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgConfig } from '@/lib/org-config';
import { getOrgPlan, requireFeature } from '@/lib/feature-gate';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/bdr/campaigns/preview-campaign
 *
 * Generate a preview campaign without storing it.
 * Picks a sample lead from the given tier to generate realistic content.
 *
 * Body: {
 *   theme: string,
 *   step_count: number,
 *   campaign_notes?: string,
 *   tier: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const plan = await getOrgPlan(orgId);
    requireFeature(plan, 'campaigns');

    const { theme, step_count, campaign_notes, tier } = await request.json();

    if (!theme) {
      return NextResponse.json({ error: 'theme required' }, { status: 400 });
    }
    const steps = Math.min(Math.max(step_count || 5, 3), 7);
    const targetTier = tier || 'tier_3';

    // Pick a sample lead from this tier for realistic preview
    const sampleLeads = await query<{
      lead_id: number;
      business_name: string;
      contact_name: string;
      contact_email: string;
      city: string;
      state: string;
      tier: string;
      cuisine_type: string;
      google_rating: number;
      google_review_count: number;
      estimated_orders: number | null;
      avg_order_value: number | null;
      commission_rate: number | null;
    }>(
      `SELECT lead_id, business_name, contact_name, contact_email, city, state,
              tier, cuisine_type, google_rating, google_review_count,
              estimated_orders, avg_order_value, commission_rate
       FROM bdr.leads
       WHERE tier = $1 AND org_id = $2 AND status != 'archived'
       ORDER BY RANDOM() LIMIT 1`,
      [targetTier, orgId]
    );

    // Fallback to any lead if tier has none
    const lead = sampleLeads[0] || {
      lead_id: 0,
      business_name: 'Sample Restaurant',
      contact_name: 'Owner',
      contact_email: '',
      city: 'Austin',
      state: 'TX',
      tier: targetTier,
      cuisine_type: 'American',
      google_rating: 4.5,
      google_review_count: 120,
      estimated_orders: targetTier === 'tier_1' ? 500 : targetTier === 'tier_2' ? 150 : 50,
      avg_order_value: 35,
      commission_rate: 0.30,
    };

    // Load brain context + ROI + Fathom
    const orgConfig = await getOrgConfig(orgId).catch(() => undefined);
    let brainContext = await loadEmailBrainContext(undefined, orgId);

    const roiContext = loadROIContext({
      tier: lead.tier,
      estimated_orders: lead.estimated_orders ?? undefined,
      avg_order_value: lead.avg_order_value ?? undefined,
      commission_rate: lead.commission_rate ?? undefined,
    }, orgConfig);
    if (roiContext) {
      brainContext += `\n\n## ROI Projection for This Lead\n${roiContext}`;
    }

    if (lead.contact_email) {
      const fathomContext = await loadFathomContext(lead.contact_email, orgId);
      if (fathomContext) {
        brainContext += `\n\n${fathomContext}`;
      }
    }

    const sequence = await generateCampaignSequence({
      theme,
      step_count: steps,
      campaign_notes,
      lead: {
        business_name: String(lead.business_name || 'Sample Restaurant'),
        contact_name: String(lead.contact_name || 'Owner'),
        city: lead.city ? String(lead.city) : undefined,
        state: lead.state ? String(lead.state) : undefined,
        cuisine_type: lead.cuisine_type ? String(lead.cuisine_type) : undefined,
        tier: lead.tier ? String(lead.tier) : undefined,
        google_rating: lead.google_rating ? Number(lead.google_rating) : null,
        google_review_count: lead.google_review_count ? Number(lead.google_review_count) : null,
      },
    }, brainContext, orgConfig);

    return NextResponse.json({
      preview: true,
      theme,
      step_count: steps,
      tier: targetTier,
      sample_lead: {
        business_name: lead.business_name,
        contact_name: lead.contact_name,
        city: lead.city,
        state: lead.state,
      },
      steps: sequence,
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[preview-campaign] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Campaign preview failed' },
      { status: 500 }
    );
  }
}

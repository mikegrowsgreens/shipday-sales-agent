import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateCampaignSequence, loadEmailBrainContext, loadROIContext, loadFathomContext } from '@/lib/ai';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgConfig } from '@/lib/org-config';
import { getOrgPlan, requireFeature } from '@/lib/feature-gate';
import { trackUsage } from '@/lib/usage';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/bdr/campaigns/generate-campaign
 *
 * Generate a full multi-step campaign using theme-based generation (single Claude call).
 * Uses generateCampaignSequence() to produce all emails as a cohesive sequence.
 * Stores in bdr.campaign_emails and sets first email on each lead.
 *
 * Body: {
 *   lead_ids: number[],
 *   theme: string,
 *   step_count: number,
 *   campaign_notes?: string,
 *   template_id?: number
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

    const { lead_ids, theme, step_count, campaign_notes, template_id } = await request.json();

    if (!lead_ids?.length) {
      return NextResponse.json({ error: 'lead_ids required' }, { status: 400 });
    }
    if (!theme) {
      return NextResponse.json({ error: 'theme required' }, { status: 400 });
    }
    const steps = Math.min(Math.max(step_count || 5, 3), 7);

    // Fetch leads
    const placeholders = lead_ids.map((_: number, i: number) => `$${i + 1}`).join(',');
    const leads = await query<{
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
       FROM bdr.leads WHERE lead_id IN (${placeholders}) AND org_id = $${lead_ids.length + 1}`,
      [...lead_ids, orgId]
    );

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No leads found' }, { status: 404 });
    }

    // Resolve or create template
    let templateId = template_id;
    if (!templateId) {
      // Create a campaign template record for this theme-based campaign
      const templateResult = await query<{ id: number }>(
        `INSERT INTO bdr.campaign_templates (org_id, tier, name, description, steps, generation_mode, campaign_notes)
         VALUES ($1, $2, $3, $4, $5, 'theme_based', $6)
         RETURNING id`,
        [
          orgId,
          leads[0].tier || 'tier_3',
          `${theme} Campaign`,
          `Theme-based campaign: ${theme}`,
          JSON.stringify([]),
          campaign_notes || null,
        ]
      );
      templateId = templateResult[0].id;
    }

    // Load org config and brain intelligence once
    const orgConfig = await getOrgConfig(orgId).catch(() => undefined);
    const brainContext = await loadEmailBrainContext(undefined, orgId);

    const results: Array<{
      lead_id: number;
      template_id: number;
      steps_generated: number;
      first_step_subject: string;
    }> = [];

    for (const lead of leads) {
      // Delete existing campaign emails for this lead+template if any
      await query(
        `DELETE FROM bdr.campaign_emails WHERE lead_id = $1 AND template_id = $2 AND org_id = $3`,
        [lead.lead_id, templateId, orgId]
      );

      // Build per-lead brain context with ROI + Fathom
      let leadBrainContext = brainContext;
      const roiContext = loadROIContext({
        tier: lead.tier,
        estimated_orders: lead.estimated_orders ?? undefined,
        avg_order_value: lead.avg_order_value ?? undefined,
        commission_rate: lead.commission_rate ?? undefined,
      }, orgConfig);
      if (roiContext) {
        leadBrainContext += `\n\n## ROI Projection for This Lead\n${roiContext}`;
      }

      if (lead.contact_email) {
        const fathomContext = await loadFathomContext(lead.contact_email, orgId);
        if (fathomContext) {
          leadBrainContext += `\n\n${fathomContext}`;
        }
      }

      try {
        // Single Claude call generates all steps as cohesive sequence
        const sequence = await generateCampaignSequence({
          theme,
          step_count: steps,
          campaign_notes,
          lead: {
            business_name: String(lead.business_name || 'Unknown'),
            contact_name: String(lead.contact_name || 'Owner'),
            city: lead.city ? String(lead.city) : undefined,
            state: lead.state ? String(lead.state) : undefined,
            cuisine_type: lead.cuisine_type ? String(lead.cuisine_type) : undefined,
            tier: lead.tier ? String(lead.tier) : undefined,
            google_rating: lead.google_rating ? Number(lead.google_rating) : null,
            google_review_count: lead.google_review_count ? Number(lead.google_review_count) : null,
          },
        }, leadBrainContext, orgConfig);

        // Insert all generated emails
        for (const step of sequence) {
          const stepStatus = step.step_number === 1 ? 'ready' : 'pending';
          await query(
            `INSERT INTO bdr.campaign_emails
              (lead_id, template_id, step_number, channel, delay_days, angle, tone, subject, body, status, org_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              lead.lead_id, templateId, step.step_number,
              'email', step.delay_days, step.angle, step.tone,
              step.subject, step.body, stepStatus, orgId,
            ]
          );
        }

        // Set first email on the lead
        const firstStep = sequence[0];
        if (firstStep) {
          await query(
            `UPDATE bdr.leads
             SET email_subject = $1, email_body = $2, email_angle = $3,
                 campaign_template_id = $4, campaign_step = 1,
                 status = 'email_ready', updated_at = NOW()
             WHERE lead_id = $5 AND org_id = $6`,
            [firstStep.subject, firstStep.body, firstStep.angle, templateId, lead.lead_id, orgId]
          );
        }

        results.push({
          lead_id: lead.lead_id,
          template_id: templateId,
          steps_generated: sequence.length,
          first_step_subject: firstStep?.subject || '',
        });
      } catch (err) {
        console.error(`[generate-campaign] AI generation failed for lead ${lead.lead_id}:`, err);
        results.push({
          lead_id: lead.lead_id,
          template_id: templateId,
          steps_generated: 0,
          first_step_subject: '[Generation failed]',
        });
      }
    }

    if (results.some(r => r.steps_generated > 0)) {
      trackUsage(orgId, 'ai_generations');
    }

    return NextResponse.json({
      generated: results.filter(r => r.steps_generated > 0).length,
      template_id: templateId,
      results,
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[generate-campaign] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Campaign generation failed' },
      { status: 500 }
    );
  }
}

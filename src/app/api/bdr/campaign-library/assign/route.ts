import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateEmail, loadEmailBrainContext, loadROIContext, loadFathomContext } from '@/lib/ai';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgConfig } from '@/lib/org-config';
import { getOrgPlan, requireFeature } from '@/lib/feature-gate';
import { trackUsage } from '@/lib/usage';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';

interface TemplateStep {
  step_number: number;
  delay_days: number;
  channel: string;
  angle: string;
  tone: string;
  instructions: string;
}

interface CampaignTemplate {
  id: number;
  tier: string;
  name: string;
  variant: string;
  steps: TemplateStep[];
}

/**
 * POST /api/bdr/campaign-library/assign
 *
 * Auto-assign library campaigns to leads based on tier.
 * Randomly assigns A/B variant (50/50 split) unless specified.
 * Then generates full email sequences for each lead.
 *
 * Body: {
 *   lead_ids: number[],
 *   tier?: string,        // override tier (otherwise uses lead's tier)
 *   variant?: 'A' | 'B',  // force variant (otherwise random 50/50)
 *   force?: boolean        // regenerate even if previously contacted
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

    const { lead_ids, tier: tierOverride, variant: variantOverride, force } = await request.json();

    if (!lead_ids?.length) {
      return NextResponse.json({ error: 'lead_ids required' }, { status: 400 });
    }

    if (variantOverride && !['A', 'B', 'C'].includes(variantOverride)) {
      return NextResponse.json({ error: 'variant must be A, B, or C' }, { status: 400 });
    }

    // Filter out previously-contacted leads unless force=true
    let filteredIds = lead_ids;
    let skippedContacted = 0;
    if (!force) {
      const contactedPlaceholders = lead_ids.map((_: string, i: number) => `$${i + 1}`).join(',');
      const contacted = await query<{ lead_id: string }>(
        `SELECT DISTINCT lead_id FROM bdr.email_sends WHERE lead_id IN (${contactedPlaceholders}) AND org_id = $${lead_ids.length + 1}`,
        [...lead_ids, orgId]
      );
      const contactedSet = new Set(contacted.map(c => String(c.lead_id)));
      filteredIds = lead_ids.filter((id: string) => !contactedSet.has(String(id)));
      skippedContacted = lead_ids.length - filteredIds.length;
    }

    if (filteredIds.length === 0) {
      return NextResponse.json({
        generated: 0,
        skipped_contacted: skippedContacted,
        results: [],
        message: skippedContacted > 0
          ? `All ${skippedContacted} leads were previously contacted. Use force=true to override.`
          : 'No leads to process',
      });
    }

    // Fetch leads
    const placeholders = filteredIds.map((_: string, i: number) => `$${i + 1}`).join(',');
    const leads = await query<{
      lead_id: string;
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
       FROM bdr.leads WHERE lead_id IN (${placeholders}) AND org_id = $${filteredIds.length + 1}`,
      [...filteredIds, orgId]
    );

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No leads found' }, { status: 404 });
    }

    // Fetch library templates for this org
    const libraryTemplates = await query<CampaignTemplate>(
      `SELECT id, tier, name, variant, steps FROM bdr.campaign_templates
       WHERE is_library_template = true AND is_active = true AND auto_assignable = true AND org_id = $1`,
      [orgId]
    );

    if (libraryTemplates.length === 0) {
      return NextResponse.json({ error: 'No library templates found. Call GET /api/bdr/campaign-library first to seed them.' }, { status: 404 });
    }

    // Parse steps if string
    for (const t of libraryTemplates) {
      if (typeof t.steps === 'string') {
        t.steps = JSON.parse(t.steps);
      }
    }

    // Build tier+variant → template lookup
    const templateLookup: Record<string, CampaignTemplate> = {};
    for (const t of libraryTemplates) {
      templateLookup[`${t.tier}:${t.variant}`] = t;
    }

    // Load org config and brain context once for batch
    const orgConfig = await getOrgConfig(orgId).catch(() => undefined);
    const brainContext = await loadEmailBrainContext(undefined, orgId);

    const results: Array<{
      lead_id: string;
      template_id: number;
      template_name: string;
      variant: string;
      steps_generated: number;
      first_step_subject: string;
    }> = [];

    const variantCounts = { A: 0, B: 0, C: 0 };

    for (const lead of leads) {
      const tier = tierOverride || lead.tier || 'tier_3';

      // Assign variant: forced, or random 1/3 split
      const rand = Math.random();
      const variant = variantOverride || (rand < 0.333 ? 'A' : rand < 0.666 ? 'B' : 'C');
      variantCounts[variant as 'A' | 'B' | 'C']++;

      const template = templateLookup[`${tier}:${variant}`];
      if (!template) {
        console.warn(`[campaign-library/assign] No template for ${tier}:${variant}, skipping lead ${lead.lead_id}`);
        continue;
      }

      // Delete existing campaign emails for this lead+template if any
      await query(
        `DELETE FROM bdr.campaign_emails WHERE lead_id = $1 AND template_id = $2 AND org_id = $3`,
        [lead.lead_id, template.id, orgId]
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

      // Generate emails for each step with prior step threading
      const generatedEmails: Array<{
        step_number: number;
        channel: string;
        delay_days: number;
        angle: string;
        tone: string;
        instructions: string;
        subject: string;
        body: string;
      }> = [];

      const priorSteps: { step_number: number; angle: string; subject: string; body: string }[] = [];
      const totalSteps = template.steps.filter(s => s.channel === 'email').length;

      for (const step of template.steps) {
        if (step.channel !== 'email') {
          generatedEmails.push({
            step_number: step.step_number,
            channel: step.channel,
            delay_days: step.delay_days,
            angle: step.angle,
            tone: step.tone,
            instructions: step.instructions,
            subject: '',
            body: step.instructions || `${step.channel} outreach for ${lead.business_name}`,
          });
          continue;
        }

        try {
          const email = await generateEmail({
            business_name: String(lead.business_name || 'Unknown'),
            contact_name: String(lead.contact_name || 'Owner'),
            city: lead.city ? String(lead.city) : undefined,
            state: lead.state ? String(lead.state) : undefined,
            cuisine_type: lead.cuisine_type ? String(lead.cuisine_type) : undefined,
            tier: lead.tier ? String(lead.tier) : undefined,
            google_rating: lead.google_rating ? Number(lead.google_rating) : null,
            google_review_count: lead.google_review_count ? Number(lead.google_review_count) : null,
            angle: step.angle,
            tone: step.tone,
            instructions: step.instructions,
            priorSteps: priorSteps.length > 0 ? priorSteps : undefined,
            totalSteps,
          }, leadBrainContext, orgConfig);

          generatedEmails.push({
            step_number: step.step_number,
            channel: step.channel,
            delay_days: step.delay_days,
            angle: step.angle,
            tone: step.tone,
            instructions: step.instructions,
            subject: email.subject,
            body: email.body,
          });

          priorSteps.push({
            step_number: step.step_number,
            angle: step.angle,
            subject: email.subject,
            body: email.body,
          });
        } catch (err) {
          console.error(`[campaign-library/assign] AI failed for lead ${lead.lead_id} step ${step.step_number}:`, err);
          generatedEmails.push({
            step_number: step.step_number,
            channel: step.channel,
            delay_days: step.delay_days,
            angle: step.angle,
            tone: step.tone,
            instructions: step.instructions,
            subject: '[Generation failed - please regenerate]',
            body: `Email generation failed for step ${step.step_number}. Please regenerate this step.`,
          });
        }
      }

      // Insert generated emails
      for (const email of generatedEmails) {
        const stepStatus = email.step_number === 1 ? 'ready' : 'pending';
        await query(
          `INSERT INTO bdr.campaign_emails
            (lead_id, template_id, step_number, channel, delay_days, angle, tone, subject, body, instructions, status, org_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            lead.lead_id, template.id, email.step_number,
            email.channel, email.delay_days, email.angle, email.tone,
            email.subject, email.body, email.instructions, stepStatus, orgId,
          ]
        );
      }

      // Set first email on the lead
      const firstEmail = generatedEmails.find(e => e.channel === 'email');
      if (firstEmail) {
        await query(
          `UPDATE bdr.leads
           SET email_subject = $1, email_body = $2, email_angle = $3,
               campaign_template_id = $4, campaign_step = 1,
               status = 'email_ready', updated_at = NOW()
           WHERE lead_id = $5 AND org_id = $6`,
          [firstEmail.subject, firstEmail.body, firstEmail.angle, template.id, lead.lead_id, orgId]
        );
      }

      results.push({
        lead_id: lead.lead_id,
        template_id: template.id,
        template_name: template.name,
        variant,
        steps_generated: generatedEmails.length,
        first_step_subject: firstEmail?.subject || '',
      });
    }

    if (results.length > 0) {
      trackUsage(orgId, 'ai_generations');
    }

    return NextResponse.json({
      generated: results.length,
      skipped_contacted: skippedContacted,
      variant_split: variantCounts,
      results,
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[campaign-library/assign] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Campaign assignment failed' },
      { status: 500 }
    );
  }
}

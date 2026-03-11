import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateEmail, loadEmailBrainContext } from '@/lib/ai';

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
  steps: TemplateStep[];
}

/**
 * POST /api/bdr/campaigns/generate-sequence
 *
 * Generate a full multi-step campaign for lead(s) based on their tier's template.
 * For each step in the template, uses AI to generate personalized email content.
 * Stores all generated emails in bdr.campaign_emails.
 * Sets the first email as the lead's active email (email_subject, email_body).
 *
 * Body: { lead_ids: number[], template_id?: number }
 * - If template_id is provided, uses that template regardless of tier.
 * - Otherwise, finds the active template for each lead's tier.
 */
export async function POST(request: NextRequest) {
  try {
    const { lead_ids, template_id, force } = await request.json();

    if (!lead_ids?.length) {
      return NextResponse.json({ error: 'lead_ids required' }, { status: 400 });
    }

    // Filter out previously-contacted leads (have existing email_sends) unless force=true
    let filteredIds = lead_ids;
    let skippedContacted = 0;
    if (!force) {
      const contactedPlaceholders = lead_ids.map((_: number, i: number) => `$${i + 1}`).join(',');
      const contacted = await query<{ lead_id: string }>(
        `SELECT DISTINCT lead_id FROM bdr.email_sends WHERE lead_id IN (${contactedPlaceholders})`,
        lead_ids
      );
      const contactedSet = new Set(contacted.map(c => String(c.lead_id)));
      filteredIds = lead_ids.filter((id: number) => !contactedSet.has(String(id)));
      skippedContacted = lead_ids.length - filteredIds.length;

      if (skippedContacted > 0) {
        console.log(`[generate-sequence] Skipped ${skippedContacted} previously-contacted leads`);
      }
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
    const placeholders = filteredIds.map((_: number, i: number) => `$${i + 1}`).join(',');
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
    }>(
      `SELECT lead_id, business_name, contact_name, contact_email, city, state,
              tier, cuisine_type, google_rating, google_review_count
       FROM bdr.leads WHERE lead_id IN (${placeholders})`,
      filteredIds
    );

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No leads found' }, { status: 404 });
    }

    // Fetch templates (either specific or by tier)
    let templates: CampaignTemplate[];
    if (template_id) {
      templates = await query<CampaignTemplate>(
        `SELECT id, tier, name, steps FROM bdr.campaign_templates WHERE id = $1 AND is_active = true`,
        [template_id]
      );
    } else {
      // Get all active templates indexed by tier
      templates = await query<CampaignTemplate>(
        `SELECT id, tier, name, steps FROM bdr.campaign_templates WHERE is_active = true ORDER BY id`
      );
    }

    if (templates.length === 0) {
      return NextResponse.json({ error: 'No active campaign templates found' }, { status: 404 });
    }

    // Build tier → template map
    const templateByTier: Record<string, CampaignTemplate> = {};
    for (const t of templates) {
      // Parse steps if it's a string
      if (typeof t.steps === 'string') {
        t.steps = JSON.parse(t.steps);
      }
      if (!templateByTier[t.tier]) {
        templateByTier[t.tier] = t;
      }
    }

    // Load brain intelligence once for all emails in this batch
    const brainContext = await loadEmailBrainContext();

    const results: Array<{
      lead_id: number;
      template_id: number;
      steps_generated: number;
      first_step_subject: string;
    }> = [];

    for (const lead of leads) {
      const template = template_id
        ? templates[0]
        : templateByTier[lead.tier || 'tier_3'];

      if (!template) {
        console.warn(`[generate-sequence] No template found for tier ${lead.tier}, skipping lead ${lead.lead_id}`);
        continue;
      }

      // Check if campaign emails already exist for this lead+template
      const existing = await query<{ id: number }>(
        `SELECT id FROM bdr.campaign_emails WHERE lead_id = $1 AND template_id = $2 LIMIT 1`,
        [lead.lead_id, template.id]
      );

      if (existing.length > 0) {
        // Delete old campaign emails to regenerate
        await query(
          `DELETE FROM bdr.campaign_emails WHERE lead_id = $1 AND template_id = $2`,
          [lead.lead_id, template.id]
        );
      }

      // Generate email for each step
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

      for (const step of template.steps) {
        if (step.channel !== 'email') {
          // For non-email steps (call, linkedin), just store the instructions
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

        // Generate personalized email via Claude
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
            instructions: step.instructions +
              (step.step_number > 1
                ? `\n\nThis is follow-up #${step.step_number} in a ${template.steps.length}-step sequence. The prospect has received ${step.step_number - 1} previous email(s). Do NOT repeat the same opening or angle — use a fresh approach while staying on-topic.`
                : ''),
          }, brainContext);

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
        } catch (err) {
          console.error(`[generate-sequence] AI generation failed for lead ${lead.lead_id} step ${step.step_number}:`, err);
          // Store placeholder so the step isn't lost
          generatedEmails.push({
            step_number: step.step_number,
            channel: step.channel,
            delay_days: step.delay_days,
            angle: step.angle,
            tone: step.tone,
            instructions: step.instructions,
            subject: `[Generation failed - please regenerate]`,
            body: `Email generation failed for step ${step.step_number}. Please regenerate this step.`,
          });
        }
      }

      // Insert all generated emails into bdr.campaign_emails
      for (const email of generatedEmails) {
        const stepStatus = email.step_number === 1 ? 'ready' : 'pending';
        await query(
          `INSERT INTO bdr.campaign_emails
            (lead_id, template_id, step_number, channel, delay_days, angle, tone, subject, body, instructions, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            lead.lead_id, template.id, email.step_number,
            email.channel, email.delay_days, email.angle, email.tone,
            email.subject, email.body, email.instructions, stepStatus,
          ]
        );
      }

      // Set first email step on the lead + mark as email_ready
      const firstEmail = generatedEmails.find(e => e.channel === 'email');
      if (firstEmail) {
        await query(
          `UPDATE bdr.leads
           SET email_subject = $1, email_body = $2, email_angle = $3,
               campaign_template_id = $4, campaign_step = 1,
               status = 'email_ready', updated_at = NOW()
           WHERE lead_id = $5`,
          [firstEmail.subject, firstEmail.body, firstEmail.angle, template.id, lead.lead_id]
        );
      }

      results.push({
        lead_id: lead.lead_id,
        template_id: template.id,
        steps_generated: generatedEmails.length,
        first_step_subject: firstEmail?.subject || '',
      });
    }

    return NextResponse.json({
      generated: results.length,
      skipped_contacted: skippedContacted,
      results,
    });
  } catch (error) {
    console.error('[generate-sequence] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sequence generation failed' },
      { status: 500 }
    );
  }
}

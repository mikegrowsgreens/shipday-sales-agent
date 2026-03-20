import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateEmail, loadEmailBrainContext } from '@/lib/ai';
import { randomUUID } from 'crypto';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/bdr/campaigns/ab-test
 * Generate A/B variant emails for leads. Creates two variants (A and B)
 * with different angles or tones, stores both, and lets the user pick or auto-split.
 *
 * Body: {
 *   lead_ids: number[],
 *   variant_a: { angle: string, tone?: string },
 *   variant_b: { angle: string, tone?: string },
 *   auto_split?: boolean  // If true, randomly assign leads to A or B
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();
    const { lead_ids, variant_a, variant_b, auto_split = false } = body;

    if (!lead_ids?.length) {
      return NextResponse.json({ error: 'lead_ids required' }, { status: 400 });
    }
    if (!variant_a?.angle || !variant_b?.angle) {
      return NextResponse.json({ error: 'variant_a and variant_b with angle required' }, { status: 400 });
    }

    const abTestId = randomUUID();

    // Fetch leads
    const placeholders = lead_ids.map((_: number, i: number) => `$${i + 1}`).join(',');
    const leads = await query<{
      lead_id: number;
      business_name: string;
      contact_name: string;
      city: string;
      state: string;
      tier: string;
      cuisine_type: string;
      google_rating: number;
      google_review_count: number;
      email_subject: string;
      email_body: string;
    }>(
      `SELECT lead_id, business_name, contact_name, city, state, tier,
              cuisine_type, google_rating, google_review_count,
              email_subject, email_body
       FROM bdr.leads WHERE lead_id IN (${placeholders}) AND org_id = $${lead_ids.length + 1}`,
      [...lead_ids, orgId]
    );

    if (leads.length === 0) {
      return NextResponse.json({ error: 'No leads found' }, { status: 404 });
    }

    const brainContext = await loadEmailBrainContext();

    const results: Array<{
      lead_id: number;
      ab_test_id: string;
      assigned_variant: string;
      variant_a: { subject: string; body: string; angle: string };
      variant_b: { subject: string; body: string; angle: string };
    }> = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      // Generate both variants
      const [emailA, emailB] = await Promise.all([
        generateEmail({
          business_name: lead.business_name,
          contact_name: lead.contact_name,
          city: lead.city,
          state: lead.state,
          cuisine_type: lead.cuisine_type,
          tier: lead.tier,
          google_rating: lead.google_rating,
          google_review_count: lead.google_review_count,
          angle: variant_a.angle,
          tone: variant_a.tone,
          previous_subject: lead.email_subject,
          previous_body: lead.email_body,
        }, brainContext),
        generateEmail({
          business_name: lead.business_name,
          contact_name: lead.contact_name,
          city: lead.city,
          state: lead.state,
          cuisine_type: lead.cuisine_type,
          tier: lead.tier,
          google_rating: lead.google_rating,
          google_review_count: lead.google_review_count,
          angle: variant_b.angle,
          tone: variant_b.tone,
          previous_subject: lead.email_subject,
          previous_body: lead.email_body,
        }, brainContext),
      ]);

      // Decide which variant this lead gets
      const assignedVariant = auto_split
        ? (i % 2 === 0 ? 'A' : 'B')
        : 'A'; // Default to A if not auto-splitting

      const activeEmail = assignedVariant === 'A' ? emailA : emailB;
      const activeAngle = assignedVariant === 'A' ? variant_a.angle : variant_b.angle;

      // Update lead with the assigned variant's email
      await query(
        `UPDATE bdr.leads
         SET email_subject = $1, email_body = $2, email_angle = $3,
             email_variant_id = $4, status = 'email_ready', updated_at = NOW()
         WHERE lead_id = $5 AND org_id = $6`,
        [activeEmail.subject, activeEmail.body, activeAngle, `ab_${assignedVariant}_${abTestId.slice(0, 8)}`, lead.lead_id, orgId]
      );

      results.push({
        lead_id: lead.lead_id,
        ab_test_id: abTestId,
        assigned_variant: assignedVariant,
        variant_a: { subject: emailA.subject, body: emailA.body, angle: variant_a.angle },
        variant_b: { subject: emailB.subject, body: emailB.body, angle: variant_b.angle },
      });
    }

    return NextResponse.json({
      ab_test_id: abTestId,
      total_leads: results.length,
      variant_a_count: results.filter(r => r.assigned_variant === 'A').length,
      variant_b_count: results.filter(r => r.assigned_variant === 'B').length,
      results,
    });
  } catch (error) {
    console.error('[ab-test] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'A/B test generation failed' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateEmail } from '@/lib/ai';

/**
 * POST /api/bdr/campaign-templates/test
 * Generate a test email for a given step config, optionally with a real lead.
 * Body: { step: { angle, tone, instructions }, lead_id?: number }
 * If no lead_id, picks a random email_ready lead from the matching tier.
 */
export async function POST(request: NextRequest) {
  try {
    const { step, lead_id, tier } = await request.json();

    if (!step || !step.angle) {
      return NextResponse.json({ error: 'step with angle is required' }, { status: 400 });
    }

    // Get a sample lead
    let lead;
    if (lead_id) {
      const rows = await query<Record<string, unknown>>(
        `SELECT lead_id, business_name, contact_name, contact_email, city, state,
                tier, cuisine_type, google_rating, google_review_count
         FROM bdr.leads WHERE lead_id = $1`,
        [lead_id]
      );
      lead = rows[0];
    } else {
      // Pick a random lead from the tier (or any email_ready lead)
      const conditions = ["status = 'email_ready'"];
      const params: unknown[] = [];
      if (tier) {
        conditions.push('tier = $1');
        params.push(tier);
      }
      const rows = await query<Record<string, unknown>>(
        `SELECT lead_id, business_name, contact_name, contact_email, city, state,
                tier, cuisine_type, google_rating, google_review_count
         FROM bdr.leads
         WHERE ${conditions.join(' AND ')}
         ORDER BY RANDOM()
         LIMIT 1`,
        params
      );
      lead = rows[0];
    }

    if (!lead) {
      // Use a synthetic sample if no leads exist
      lead = {
        business_name: 'Sample Pizza Kitchen',
        contact_name: 'John Smith',
        city: 'Seattle',
        state: 'WA',
        cuisine_type: 'Italian',
        tier: tier || 'tier_2',
        google_rating: 4.3,
        google_review_count: 87,
      };
    }

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
    });

    return NextResponse.json({
      subject: email.subject,
      body: email.body,
      lead: {
        business_name: lead.business_name,
        contact_name: lead.contact_name,
        city: lead.city,
        state: lead.state,
        tier: lead.tier,
      },
    });
  } catch (error) {
    console.error('[campaign-templates/test] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Test generation failed' },
      { status: 500 }
    );
  }
}

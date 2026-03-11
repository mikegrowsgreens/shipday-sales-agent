import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { generateEmail, loadEmailBrainContext } from '@/lib/ai';

/**
 * POST /api/bdr/campaigns/regenerate
 * Regenerate email content for a lead using Claude AI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, lead_id, angle, tone, instructions, length_preference } = body;
    const resolvedLeadId = leadId || lead_id;

    if (!resolvedLeadId) {
      return NextResponse.json({ error: 'leadId required' }, { status: 400 });
    }

    // Fetch current lead data
    const lead = await queryOne<{
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
      email_subject: string;
      email_body: string;
      email_angle: string;
    }>(
      `SELECT lead_id, business_name, contact_name, contact_email, city, state,
              tier, cuisine_type, google_rating, google_review_count,
              email_subject, email_body, email_angle
       FROM bdr.leads WHERE lead_id = $1`,
      [resolvedLeadId]
    );

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const selectedAngle = angle || lead.email_angle || 'missed_calls';

    // Load brain intelligence for email copy
    const brainContext = await loadEmailBrainContext();

    const email = await generateEmail({
      business_name: lead.business_name,
      contact_name: lead.contact_name,
      city: lead.city,
      state: lead.state,
      cuisine_type: lead.cuisine_type,
      tier: lead.tier,
      google_rating: lead.google_rating,
      google_review_count: lead.google_review_count,
      angle: selectedAngle,
      tone,
      instructions: [
        instructions,
        length_preference === 'short' ? 'Keep the email body to 2-3 sentences maximum. Be extremely concise.' :
        length_preference === 'long' ? 'Write a longer, more detailed email with 7+ sentences. Include more context and social proof.' :
        undefined,
      ].filter(Boolean).join('\n') || undefined,
      previous_subject: lead.email_subject,
      previous_body: lead.email_body,
    }, brainContext);

    // Update the lead with new email content
    await query(
      `UPDATE bdr.leads
       SET email_subject = $1, email_body = $2, email_angle = $3,
           email_variant_id = $4, status = 'email_ready', updated_at = NOW()
       WHERE lead_id = $5`,
      [email.subject, email.body, selectedAngle, `regen_${Date.now()}`, resolvedLeadId]
    );

    return NextResponse.json({
      leadId: resolvedLeadId,
      subject: email.subject,
      body: email.body,
      angle: selectedAngle,
      regenerated: true,
    });
  } catch (error) {
    console.error('[bdr-regenerate] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Regeneration failed' },
      { status: 500 }
    );
  }
}

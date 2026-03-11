import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { generateEmail, loadEmailBrainContext } from '@/lib/ai';

/**
 * POST /api/bdr/campaigns/bulk-regenerate
 * Regenerate email content for multiple leads at once.
 * Body: { lead_ids: number[], angle?: string, tone?: string, instructions?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_ids, angle, tone, instructions } = body as {
      lead_ids: number[];
      angle?: string;
      tone?: string;
      instructions?: string;
    };

    if (!lead_ids?.length) {
      return NextResponse.json({ error: 'lead_ids required' }, { status: 400 });
    }

    const results: Array<{ lead_id: number; subject: string; success: boolean }> = [];

    // Load brain intelligence once for all emails in this batch
    const brainContext = await loadEmailBrainContext();

    // Process leads sequentially to avoid API rate limits
    for (const leadId of lead_ids) {
      try {
        const lead = await queryOne<{
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
          email_angle: string;
        }>(
          `SELECT lead_id, business_name, contact_name, city, state,
                  tier, cuisine_type, google_rating, google_review_count,
                  email_subject, email_body, email_angle
           FROM bdr.leads WHERE lead_id = $1`,
          [leadId]
        );

        if (!lead) {
          results.push({ lead_id: leadId, subject: '', success: false });
          continue;
        }

        const selectedAngle = angle || lead.email_angle || 'missed_calls';

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
          instructions,
          previous_subject: lead.email_subject,
          previous_body: lead.email_body,
        }, brainContext);

        await query(
          `UPDATE bdr.leads
           SET email_subject = $1, email_body = $2, email_angle = $3,
               email_variant_id = $4, status = 'email_ready', updated_at = NOW()
           WHERE lead_id = $5`,
          [email.subject, email.body, selectedAngle, `bulk_regen_${Date.now()}`, leadId]
        );

        results.push({ lead_id: leadId, subject: email.subject, success: true });
      } catch (err) {
        console.error(`[bulk-regenerate] failed for lead ${leadId}:`, err);
        results.push({ lead_id: leadId, subject: '', success: false });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      regenerated: successCount,
      total: lead_ids.length,
      results,
    });
  } catch (error) {
    console.error('[bulk-regenerate] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk regeneration failed' },
      { status: 500 }
    );
  }
}

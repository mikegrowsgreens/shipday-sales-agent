import { NextRequest, NextResponse } from 'next/server';
import { queryDealsOne, queryDeals } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { generateFollowUpCampaign } from '@/lib/ai';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/followups/generate
 * Generate an adaptive follow-up campaign for a deal via Claude AI.
 * Touch count adapts based on: next call date, demo recency, or pipeline stage.
 * Saves drafts to the deals DB email_drafts table.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();
    const { deal_id, additional_context, next_call_date } = body as {
      deal_id: string;
      additional_context?: string;
      next_call_date?: string;
    };

    if (!deal_id) {
      return NextResponse.json({ error: 'deal_id is required' }, { status: 400 });
    }

    // Load deal context
    const deal = await queryDealsOne<{
      deal_id: string;
      contact_name: string;
      contact_email: string;
      business_name: string;
      pipeline_stage: string;
      pain_points: unknown;
      fathom_summary: string;
      action_items: string;
      next_touch_due: string | null;
      demo_date: string | null;
    }>(
      `SELECT deal_id, contact_name, contact_email, business_name, pipeline_stage,
              pain_points, fathom_summary, action_items, next_touch_due, demo_date
       FROM deals.deals WHERE deal_id = $1`,
      [deal_id],
    );

    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    // Parse pain points
    const painPoints = Array.isArray(deal.pain_points)
      ? (deal.pain_points as string[]).join(', ')
      : typeof deal.pain_points === 'string'
        ? deal.pain_points
        : '';

    // Determine timeline and compute adaptive touch count/spacing
    const effectiveCallDate = next_call_date || deal.next_touch_due;
    const now = new Date();
    let touchCount = 7;
    let touchDaySpacing = [0, 2, 5, 8, 12, 18, 25];
    let hoursUntilCall: number | null = null;
    let campaignMode: 'imminent' | 'short' | 'medium' | 'standard' | 'long' = 'standard';

    if (effectiveCallDate) {
      const callDate = new Date(effectiveCallDate);
      const msUntilCall = callDate.getTime() - now.getTime();
      hoursUntilCall = Math.max(0, msUntilCall / (1000 * 60 * 60));
      const daysUntilCall = Math.max(0, Math.ceil(msUntilCall / (1000 * 60 * 60 * 24)));

      if (hoursUntilCall <= 24) {
        // IMMINENT: Call is today or within 24 hours
        // Just 1 email — a "see you soon" / confirmation email
        campaignMode = 'imminent';
        touchCount = 1;
        touchDaySpacing = [0];
      } else if (daysUntilCall <= 3) {
        // SHORT: Call in 1-3 days — 2 touches: prep email + confirmation
        campaignMode = 'short';
        touchCount = 2;
        touchDaySpacing = [0, Math.max(1, daysUntilCall - 1)];
      } else if (daysUntilCall <= 7) {
        // MEDIUM: Call in 4-7 days — 3 touches
        campaignMode = 'medium';
        touchCount = 3;
        const gap = Math.floor(daysUntilCall / 2);
        touchDaySpacing = [0, gap, daysUntilCall - 1];
      } else if (daysUntilCall <= 14) {
        touchCount = 5;
        const gap = Math.floor(daysUntilCall / 4);
        touchDaySpacing = [0, gap, gap * 2, gap * 3, daysUntilCall + 3];
      } else if (daysUntilCall <= 21) {
        touchCount = 6;
        const gap = Math.floor(daysUntilCall / 5);
        touchDaySpacing = [0, gap, gap * 2, gap * 3, gap * 4, daysUntilCall + 3];
      } else {
        campaignMode = 'long';
        touchCount = 7;
        const gap = Math.floor(daysUntilCall / 6);
        touchDaySpacing = [0, gap, gap * 2, gap * 3, gap * 4, gap * 5, daysUntilCall + 5];
      }

      // Save the next call date to the deal if provided via request
      if (next_call_date) {
        await queryDeals(
          `UPDATE deals.deals SET next_touch_due = $1, updated_at = NOW() WHERE deal_id = $2`,
          [next_call_date, deal_id],
        );
      }
    } else {
      // NO CALL DATE SET — use demo_date recency as a fallback
      // More recent demos need fewer, faster touches; older demos need more nurturing
      if (deal.demo_date) {
        const demoDate = new Date(deal.demo_date);
        const daysSinceDemo = Math.floor((now.getTime() - demoDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysSinceDemo <= 1) {
          // Demo was today or yesterday — short burst
          touchCount = 3;
          touchDaySpacing = [0, 2, 5];
        } else if (daysSinceDemo <= 3) {
          touchCount = 4;
          touchDaySpacing = [0, 1, 3, 7];
        } else if (daysSinceDemo <= 7) {
          touchCount = 5;
          touchDaySpacing = [0, 1, 3, 6, 10];
        } else if (daysSinceDemo <= 14) {
          touchCount = 5;
          touchDaySpacing = [0, 2, 5, 9, 14];
        } else {
          // Demo was 2+ weeks ago — full 7-touch re-engagement
          touchCount = 7;
          touchDaySpacing = [0, 2, 5, 8, 12, 18, 25];
        }
      }
      // If no demo_date and no call date, keep default 7 touches
    }

    // Fetch email context from Gmail via n8n
    // n8n 2.x typeVersion 2 webhooks use path: /webhook/{workflowId}/webhook/{path}
    let emailHistory = '';
    if (deal.contact_email) {
      try {
        const n8nBase = process.env.N8N_BASE_URL || '';
        const emailContextWorkflowId = process.env.N8N_EMAIL_CONTEXT_WORKFLOW_ID || 'VG0KpWu437gYmVJS';
        const webhookUrl = `${n8nBase}/webhook/${emailContextWorkflowId}/webhook/email-context`;
        const emailResp = await fetchWithTimeout(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: deal.contact_email }),
          timeout: 30000,
        });
        if (emailResp.ok) {
          const emailData = await emailResp.json();
          emailHistory = emailData.context_summary || '';
        } else {
          // n8n returns 500 with "No item to return" when Gmail has no results
          const errBody = await emailResp.text();
          if (!errBody.includes('No item to return')) {
            console.warn('[followups/generate] email context fetch failed:', emailResp.status);
          }
        }
      } catch (err) {
        console.warn('[followups/generate] email context fetch failed (continuing without):', err);
      }
    }

    // Generate campaign via Claude with adaptive touch count + email history
    const drafts = await generateFollowUpCampaign({
      contact_name: deal.contact_name || 'there',
      business_name: deal.business_name || 'your restaurant',
      email: deal.contact_email || '',
      stage: deal.pipeline_stage || 'demo_completed',
      pain_points: painPoints,
      demo_notes: deal.fathom_summary || '',
      additional_context: additional_context || deal.action_items || '',
      next_call_date: effectiveCallDate || undefined,
      touch_count: touchCount,
      email_history: emailHistory || undefined,
      campaign_mode: campaignMode,
      hours_until_call: hoursUntilCall,
      demo_date: deal.demo_date || undefined,
    });

    // Delete existing drafts for this deal (regeneration)
    await queryDeals(
      `DELETE FROM deals.email_drafts WHERE deal_id = $1`,
      [deal_id],
    );

    // Insert generated drafts with computed scheduled dates
    for (const draft of drafts) {
      const dayOffset = touchDaySpacing[draft.touch_number - 1] ?? draft.delay_days ?? (draft.touch_number * 3);
      const sendDate = new Date(now);
      sendDate.setDate(sendDate.getDate() + dayOffset);
      sendDate.setHours(9, 0, 0, 0); // Default 9 AM send time

      await queryDeals(
        `INSERT INTO deals.email_drafts (deal_id, touch_number, subject, body_plain, suggested_send_time, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'draft', NOW(), NOW())`,
        [deal_id, draft.touch_number, draft.subject, draft.body, sendDate.toISOString()],
      );
    }

    // Update deal touch scheduling for first 7 fields
    for (let i = 0; i < Math.min(touchDaySpacing.length, 7); i++) {
      const field = i === 0 ? 'touch1_sent_at' : `touch${i + 1}_scheduled_at`;
      if (i === 0) continue;
      await queryDeals(
        `UPDATE deals.deals SET ${field} = NOW() + interval '${touchDaySpacing[i]} days', updated_at = NOW() WHERE deal_id = $1`,
        [deal_id],
      );
    }

    // Log activity
    await queryDeals(
      `INSERT INTO deals.activity_log (deal_id, action_type, notes, created_at)
       VALUES ($1, 'campaign_generated', $2, NOW())`,
      [deal_id, JSON.stringify({ touch_count: drafts.length })],
    );

    // Update deal agent_status to active
    await queryDeals(
      `UPDATE deals.deals SET agent_status = 'active', updated_at = NOW() WHERE deal_id = $1`,
      [deal_id],
    );

    // Reload saved drafts
    const savedDrafts = await queryDeals(
      `SELECT * FROM deals.email_drafts WHERE deal_id = $1 ORDER BY touch_number ASC`,
      [deal_id],
    );

    return NextResponse.json({ drafts: savedDrafts, generated: drafts.length });
  } catch (error) {
    console.error('[followups/generate] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 },
    );
  }
}

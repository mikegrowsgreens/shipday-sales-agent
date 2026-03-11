import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { prospectChat, extractQualificationSlots } from '@/lib/ai';
import { computeROI, formatROIForChat, buildCalculatorURL } from '@/lib/roi';
import crypto from 'crypto';

/**
 * POST /api/chat/prospect
 * Public (no auth) chat endpoint for prospect-facing sales assistant.
 * Loads brain content, calls Claude, captures lead info.
 */
export async function POST(request: NextRequest) {
  // Step 1: Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (parseErr) {
    console.error('[chat/prospect] request body parse error:', parseErr);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { message, history, lead_info } = body as {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    lead_info?: { name?: string; email?: string; company?: string };
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  try {
    // Step 2: Load active brain content + live sales intelligence
    let brainContent: Array<Record<string, unknown>> = [];
    try {
      brainContent = await query<Record<string, unknown>>(
        `SELECT content_type, title, raw_text, key_claims, value_props, pain_points_addressed
         FROM brain.internal_content
         WHERE is_active = true
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 30`
      );
    } catch {
      // Brain tables may not exist yet — continue without knowledge base
    }

    // Also pull live deal stats and top phrases for real-time accuracy
    try {
      const [dealRow] = await query<{ win_rate: number; avg_mrr: number; won: number }>(`
        SELECT
          round(100.0 * count(CASE WHEN outcome='won' THEN 1 END) / NULLIF(count(CASE WHEN outcome IN ('won','lost') THEN 1 END), 0), 1) as win_rate,
          round(avg(CASE WHEN outcome='won' THEN mrr END), 0) as avg_mrr,
          count(CASE WHEN outcome='won' THEN 1 END) as won
        FROM public.deals
      `);
      if (dealRow) {
        brainContent.push({
          content_type: 'live_stats',
          title: 'Current Sales Metrics (live)',
          raw_text: `Right now: ${dealRow.won} businesses onboarded, ${dealRow.win_rate}% conversion from demo to close, average customer invests $${dealRow.avg_mrr}/month.`,
          key_claims: [],
          value_props: [],
          pain_points_addressed: [],
        });
      }

      const topPhrases = await query<{ phrase: string; win_rate_lift: number; category: string }>(`
        SELECT phrase, win_rate_lift, category
        FROM public.phrase_stats
        WHERE win_rate_lift > 15
        ORDER BY win_rate_lift DESC
        LIMIT 10
      `);
      if (topPhrases.length > 0) {
        brainContent.push({
          content_type: 'live_stats',
          title: 'Top Converting Conversation Approaches (live)',
          raw_text: topPhrases.map(p =>
            `[${p.category}] "${p.phrase}" — +${p.win_rate_lift}% conversion lift`
          ).join('\n'),
          key_claims: [],
          value_props: [],
          pain_points_addressed: [],
        });
      }
    } catch {
      // Live stats unavailable — continue with brain content only
    }

    // Step 3: Build messages array for Claude (history + current message)
    const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...(history || []),
      { role: 'user' as const, content: message },
    ];

    // Step 3.5: Extract qualification slots from conversation history
    const qualificationSlots = extractQualificationSlots(chatMessages, lead_info);

    // Step 3.6: Compute ROI when we have the 3 core slots (orders, AOV, commission tier)
    let roiContext: string | undefined;
    let calculatorURL: string | undefined;
    if (
      qualificationSlots.orders_per_week &&
      qualificationSlots.aov &&
      qualificationSlots.commission_tier
    ) {
      const monthlyDeliveries = qualificationSlots.orders_per_week * 4;
      const roiInput = {
        orderValue: qualificationSlots.aov,
        monthlyDeliveries,
        commissionRate: qualificationSlots.commission_tier / 100,
      };
      const roi = computeROI(roiInput);
      roiContext = formatROIForChat(roi, roiInput);
      calculatorURL = buildCalculatorURL(roiInput);
    }

    // Step 4: Call Claude with qualification context + computed ROI
    let result: { reply: string; detected_info?: { name?: string; email?: string; company?: string }; suggested_prompts?: string[]; qualification?: Record<string, unknown> | undefined };
    try {
      result = await prospectChat(chatMessages, brainContent, qualificationSlots, roiContext) as typeof result;
    } catch (aiErr) {
      console.error('[chat/prospect] Claude API error:', aiErr);
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again.' },
        { status: 502 }
      );
    }

    // Step 5: Handle lead capture — merge any previously known info with newly detected info
    const mergedInfo = {
      ...(lead_info || {}),
      ...(result.detected_info || {}),
    };

    let leadCaptured = false;

    if (mergedInfo.email) {
      try {
        // Check if lead with this email already exists
        const existing = await query<{ lead_id: string }>(
          `SELECT lead_id FROM bdr.leads WHERE contact_email = $1 LIMIT 1`,
          [mergedInfo.email]
        );

        if (existing.length > 0) {
          // Update existing lead
          await query(
            `UPDATE bdr.leads SET
               business_name = COALESCE(NULLIF($1, ''), business_name),
               contact_name = COALESCE(NULLIF($2, ''), contact_name),
               updated_at = NOW()
             WHERE contact_email = $3`,
            [
              mergedInfo.company || '',
              mergedInfo.name || '',
              mergedInfo.email,
            ]
          );
        } else {
          // Insert new lead
          const leadId = `chat_${crypto.randomBytes(6).toString('hex')}`;
          await query(
            `INSERT INTO bdr.leads (lead_id, business_name, contact_name, contact_email, status, market_type, created_at)
             VALUES ($1, $2, $3, $4, 'new', 'chatbot', NOW())`,
            [
              leadId,
              mergedInfo.company || null,
              mergedInfo.name || null,
              mergedInfo.email,
            ]
          );
        }
        leadCaptured = true;
      } catch (err) {
        console.error('[chat/prospect] lead capture error:', err);
        // Don't fail the response if lead capture fails
      }
    }

    return NextResponse.json({
      reply: result.reply,
      lead_captured: leadCaptured,
      detected_info: result.detected_info || null,
      suggested_prompts: result.suggested_prompts || null,
      qualification: result.qualification || null,
      calculator_url: calculatorURL || null,
    });
  } catch (error) {
    console.error('[chat/prospect] unexpected error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

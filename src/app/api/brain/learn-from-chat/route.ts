import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import Anthropic from '@anthropic-ai/sdk';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';
import { armorSystemPrompt, wrapUserData, sanitizeInput, INPUT_LIMITS } from '@/lib/prompt-guard';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationAnalysis {
  qualification_triggers: string[];
  objection_handling_quality: 'excellent' | 'good' | 'fair' | 'poor';
  roi_framing_effectiveness: string;
  abandonment_cause: string | null;
  effective_patterns: Array<{
    pattern_type: string;
    pattern_text: string;
    effectiveness: string;
  }>;
  competitive_intel: Array<{
    intel_type: string;
    competitor_name: string | null;
    content: string;
  }>;
  conversation_quality_score: number;
  key_takeaways: string[];
}

const ANALYSIS_SYSTEM_PROMPT = armorSystemPrompt(`You are an elite sales conversation analyst. Analyze completed chatbot conversations to extract learning patterns, competitive intelligence, and quality signals.

For each conversation, return a JSON object with:

1. **qualification_triggers** (string[]): What statements or questions successfully got the prospect to share qualification info (orders/week, AOV, pain points, etc.)

2. **objection_handling_quality** ("excellent"|"good"|"fair"|"poor"): How well did the chatbot handle objections? Consider: did it acknowledge, reframe, and advance?

3. **roi_framing_effectiveness** (string): Which ROI framing worked? What numbers/angles resonated? "none" if ROI wasn't presented.

4. **abandonment_cause** (string|null): If the conversation didn't reach demo booking, what caused the drop-off? null if demo was booked.

5. **effective_patterns** (array): Specific patterns that worked well in this conversation:
   - pattern_type: "hook"|"discovery_question"|"objection_response"|"roi_framing"|"closing_technique"|"rapport_building"
   - pattern_text: The actual text/approach that worked (1-3 sentences)
   - effectiveness: "high"|"medium"|"low"

6. **competitive_intel** (array): Any competitive intelligence mentioned:
   - intel_type: "competitor_mention"|"pricing_intel"|"feature_request"|"market_trend"|"prospect_pain"
   - competitor_name: Name of competitor if mentioned, null otherwise
   - content: The intelligence extracted

7. **conversation_quality_score** (number 0-100): Overall quality of the sales conversation

8. **key_takeaways** (string[]): 2-3 actionable takeaways from this conversation

Return ONLY valid JSON, no markdown.`);

/**
 * POST /api/brain/learn-from-chat
 *
 * Triggers when a chatbot conversation reaches a terminal state.
 * Extracts patterns, competitive intel, and quality signals.
 *
 * Body: {
 *   conversation_id: string,
 *   messages: ChatMessage[],
 *   terminal_state: 'demo_booked' | 'lead_captured' | 'abandoned' | 'escalated',
 *   qualification_slots?: Record<string, unknown>,
 *   lead_info?: { name?: string, email?: string, company?: string },
 *   roi_presented?: boolean,
 *   visitor_context?: Record<string, unknown>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json();
    const {
      conversation_id,
      messages,
      terminal_state,
      qualification_slots,
      lead_info,
      roi_presented,
      visitor_context,
    } = body as {
      conversation_id: string;
      messages: ChatMessage[];
      terminal_state: string;
      qualification_slots?: Record<string, unknown>;
      lead_info?: { name?: string; email?: string; company?: string };
      roi_presented?: boolean;
      visitor_context?: Record<string, unknown>;
    };

    if (!conversation_id || !messages?.length || !terminal_state) {
      return NextResponse.json(
        { error: 'conversation_id, messages, and terminal_state are required' },
        { status: 400 },
      );
    }

    const validStates = ['demo_booked', 'lead_captured', 'abandoned', 'escalated'];
    if (!validStates.includes(terminal_state)) {
      return NextResponse.json(
        { error: `terminal_state must be one of: ${validStates.join(', ')}` },
        { status: 400 },
      );
    }

    // Calculate qualification completeness
    const slots = qualification_slots || {};
    const qualFields = ['orders_per_week', 'aov', 'commission_tier', 'restaurant_type', 'name', 'email', 'company'];
    const filledSlots = qualFields.filter(f => slots[f] !== undefined && slots[f] !== null).length;
    const qualificationCompleteness = Math.round((filledSlots / qualFields.length) * 100);

    // Calculate duration from first/last message timestamps (approx via message count)
    const startedAt = new Date();
    startedAt.setMinutes(startedAt.getMinutes() - messages.length * 2); // rough estimate

    // Step 1: Store the conversation outcome
    await query(
      `INSERT INTO brain.conversation_outcomes
        (conversation_id, org_id, started_at, ended_at, messages_count,
         qualification_completeness, demo_booked, lead_captured,
         terminal_state, qualification_slots, roi_presented, visitor_context)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (conversation_id) DO UPDATE SET
         ended_at = NOW(),
         messages_count = $4,
         qualification_completeness = $5,
         demo_booked = $6,
         lead_captured = $7,
         terminal_state = $8,
         qualification_slots = $9,
         roi_presented = $10,
         updated_at = NOW()`,
      [
        conversation_id,
        orgId,
        startedAt.toISOString(),
        messages.length,
        qualificationCompleteness,
        terminal_state === 'demo_booked',
        !!lead_info?.email,
        terminal_state,
        JSON.stringify(slots),
        roi_presented || false,
        JSON.stringify(visitor_context || {}),
      ],
    );

    // Step 2: Run Claude analysis on the conversation
    const conversationText = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const sanitizedConversation = sanitizeInput(conversationText, INPUT_LIMITS.transcript);

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analyze this sales chatbot conversation that ended with: ${terminal_state}

Qualification data collected: ${JSON.stringify(slots)}
Lead info captured: ${JSON.stringify(lead_info || {})}
ROI presented: ${roi_presented ? 'yes' : 'no'}

${wrapUserData('conversation', sanitizedConversation)}`,
      }],
    });

    const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';

    let analysis: ConversationAnalysis | null = null;
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      analysis = null;
    }

    const results: string[] = [];

    if (analysis) {
      // Step 3: Store effective patterns into brain.auto_learned
      const confidenceMap: Record<string, number> = {
        demo_booked: 0.85,
        lead_captured: 0.7,
        escalated: 0.5,
        abandoned: 0.3,
      };
      const baseConfidence = confidenceMap[terminal_state] || 0.5;

      if (analysis.effective_patterns?.length) {
        for (const pattern of analysis.effective_patterns) {
          if (!pattern.pattern_text || pattern.pattern_text.length < 10) continue;

          const effectivenessBoost = pattern.effectiveness === 'high' ? 0.1 : pattern.effectiveness === 'medium' ? 0 : -0.1;
          const confidence = Math.min(1, Math.max(0, baseConfidence + effectivenessBoost));

          await query(
            `INSERT INTO brain.auto_learned
              (source_type, source_id, pattern_type, content, context, confidence, org_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              'chatbot_conversation',
              conversation_id,
              pattern.pattern_type,
              pattern.pattern_text,
              JSON.stringify({
                terminal_state,
                qualification_completeness: qualificationCompleteness,
                conversation_quality: analysis.conversation_quality_score,
                lead_info: lead_info || {},
              }),
              confidence,
              orgId,
            ],
          );
          results.push(`Learned ${pattern.pattern_type}: ${pattern.pattern_text.slice(0, 50)}...`);
        }
      }

      // Step 4: Store competitive intelligence
      if (analysis.competitive_intel?.length) {
        for (const intel of analysis.competitive_intel) {
          if (!intel.content || intel.content.length < 10) continue;

          const validIntelTypes = ['competitor_mention', 'pricing_intel', 'feature_request', 'market_trend', 'prospect_pain'];
          const intelType = validIntelTypes.includes(intel.intel_type) ? intel.intel_type : 'prospect_pain';

          await query(
            `INSERT INTO brain.external_intelligence
              (org_id, intel_type, source_type, source_id, competitor_name, content, context, confidence)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              orgId,
              intelType,
              'chatbot',
              conversation_id,
              intel.competitor_name || null,
              intel.content,
              JSON.stringify({
                terminal_state,
                lead_info: lead_info || {},
                qualification_slots: slots,
              }),
              baseConfidence,
            ],
          );
          results.push(`Intel: [${intelType}] ${intel.content.slice(0, 50)}...`);
        }
      }

      // Step 5: Update the conversation outcome with analysis data
      await query(
        `UPDATE brain.conversation_outcomes
         SET effective_patterns = $1,
             objections_raised = $2,
             abandonment_point = $3,
             updated_at = NOW()
         WHERE conversation_id = $4 AND org_id = $5`,
        [
          JSON.stringify(analysis.effective_patterns || []),
          analysis.key_takeaways || [],
          analysis.abandonment_cause || null,
          conversation_id,
          orgId,
        ],
      );

      // Step 6: Log effectiveness
      await query(
        `INSERT INTO brain.effectiveness_log
          (content_type, event_type, outcome, org_id)
         VALUES ($1, $2, $3, $4)`,
        ['chat_learning', 'conversation_analyzed', terminal_state, orgId],
      );
    }

    return NextResponse.json({
      success: true,
      conversation_id,
      terminal_state,
      qualification_completeness: qualificationCompleteness,
      patterns_learned: analysis?.effective_patterns?.length || 0,
      intel_extracted: analysis?.competitive_intel?.length || 0,
      conversation_quality: analysis?.conversation_quality_score || null,
      key_takeaways: analysis?.key_takeaways || [],
      results,
    });
  } catch (error) {
    console.error('[brain/learn-from-chat] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat learning failed' },
      { status: 500 },
    );
  }
}

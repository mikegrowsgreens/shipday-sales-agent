import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import Anthropic from '@anthropic-ai/sdk';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';
import { sanitizeInput, armorSystemPrompt, INPUT_LIMITS } from '@/lib/prompt-guard';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

/**
 * POST /api/brain/learn
 * Auto-learning endpoint: called when an email gets a positive reply.
 * Extracts winning patterns (subject line, opening line, CTA, angle) from the
 * original email and stores them as auto-learned patterns.
 *
 * Body: { email_send_id, lead_id, subject, body, reply_text, reply_sentiment, angle }
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const {
      email_send_id,
      lead_id,
      subject,
      body,
      reply_text,
      reply_sentiment,
      angle,
      business_name,
      cuisine_type,
    } = await request.json();

    if (!subject || !body) {
      return NextResponse.json({ error: 'subject and body are required' }, { status: 400 });
    }

    // Sanitize user-supplied inputs
    const safeSubject = sanitizeInput(subject, INPUT_LIMITS.contact_field);
    const safeBody = sanitizeInput(body, INPUT_LIMITS.email_body);
    const safeReplyText = sanitizeInput(reply_text, INPUT_LIMITS.email_body);
    const safeBusinessName = sanitizeInput(business_name, INPUT_LIMITS.contact_field);
    const safeCuisineType = sanitizeInput(cuisine_type, INPUT_LIMITS.contact_field);
    const safeAngle = sanitizeInput(angle, INPUT_LIMITS.angle);

    // Use Claude to extract winning patterns from the email
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: armorSystemPrompt(`You are a sales intelligence analyst. Extract winning patterns from emails that received positive replies. Return a JSON object with these fields:
- subject_line_pattern: What made this subject line effective (string)
- opening_line: The opening line approach that worked (string)
- cta_pattern: The call-to-action approach used (string)
- value_prop_angle: The main value proposition angle (string)
- personalization_elements: What personalization was used (string[])
- tone_description: The tone and style that worked (string)
- key_phrases: 2-3 specific phrases worth reusing (string[])

Be specific and actionable. Focus on what can be reused in future emails.`),
      messages: [{
        role: 'user',
        content: `Analyze this cold email that received a ${reply_sentiment || 'positive'} reply:

<user-data label="email">
SUBJECT: ${safeSubject}

BODY:
${safeBody}

${safeReplyText ? `REPLY FROM PROSPECT:\n${safeReplyText}` : ''}

${safeAngle ? `ANGLE USED: ${safeAngle}` : ''}
${safeBusinessName ? `BUSINESS: ${safeBusinessName}` : ''}
${safeCuisineType ? `CUISINE: ${safeCuisineType}` : ''}
</user-data>

Extract the winning patterns from this email.`,
      }],
    });

    const analysisText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse the JSON from Claude's response
    let analysis;
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      analysis = null;
    }

    if (!analysis) {
      return NextResponse.json({ error: 'Failed to parse analysis' }, { status: 500 });
    }

    const results: string[] = [];
    const sourceContext = {
      email_send_id,
      lead_id,
      business_name,
      cuisine_type,
      angle,
      reply_sentiment,
    };

    // Store each extracted pattern
    const patterns = [
      { type: 'subject_line', content: analysis.subject_line_pattern },
      { type: 'opening_line', content: analysis.opening_line },
      { type: 'cta', content: analysis.cta_pattern },
      { type: 'value_prop', content: analysis.value_prop_angle },
      { type: 'tone', content: analysis.tone_description },
    ];

    for (const p of patterns) {
      if (p.content) {
        await query(
          `INSERT INTO brain.auto_learned (source_type, source_id, pattern_type, content, context, confidence, org_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            'email_reply',
            email_send_id || null,
            p.type,
            p.content,
            JSON.stringify(sourceContext),
            reply_sentiment === 'positive' ? 0.8 : 0.6,
            orgId,
          ]
        );
        results.push(`Learned ${p.type}: ${p.content.slice(0, 50)}...`);
      }
    }

    // Store key phrases
    if (analysis.key_phrases && Array.isArray(analysis.key_phrases)) {
      for (const phrase of analysis.key_phrases) {
        await query(
          `INSERT INTO brain.auto_learned (source_type, source_id, pattern_type, content, context, confidence, org_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            'email_reply',
            email_send_id || null,
            'key_phrase',
            phrase,
            JSON.stringify(sourceContext),
            reply_sentiment === 'positive' ? 0.8 : 0.6,
            orgId,
          ]
        );
        results.push(`Learned phrase: ${phrase}`);
      }
    }

    // Log effectiveness
    await query(
      `INSERT INTO brain.effectiveness_log (content_type, email_send_id, lead_id, event_type, outcome, org_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['auto_learn', email_send_id || null, lead_id || null, 'reply_received', reply_sentiment || 'positive', orgId]
    );

    return NextResponse.json({ success: true, patterns_learned: results.length, results });
  } catch (error) {
    console.error('[brain/learn] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Learning failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/brain/learn
 * Returns learning stats across all sources (email, calls, chatbot).
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const stats = await query<{
      source_type: string;
      total: string;
      active: string;
      avg_confidence: string;
      last_learned: string | null;
    }>(
      `SELECT
         source_type,
         count(*)::text as total,
         count(CASE WHEN is_active THEN 1 END)::text as active,
         round(avg(confidence)::numeric, 2)::text as avg_confidence,
         max(created_at)::text as last_learned
       FROM brain.auto_learned
       WHERE org_id = $1
       GROUP BY source_type
       ORDER BY count(*) DESC`,
      [orgId],
    );

    // Conversation outcomes summary
    let conversationStats = null;
    try {
      const convRows = await query<{
        total: string;
        demo_booked: string;
        lead_captured: string;
        abandoned: string;
        avg_messages: string;
        avg_qual: string;
      }>(
        `SELECT
           count(*)::text as total,
           count(CASE WHEN terminal_state = 'demo_booked' THEN 1 END)::text as demo_booked,
           count(CASE WHEN terminal_state = 'lead_captured' THEN 1 END)::text as lead_captured,
           count(CASE WHEN terminal_state = 'abandoned' THEN 1 END)::text as abandoned,
           round(avg(messages_count))::text as avg_messages,
           round(avg(qualification_completeness))::text as avg_qual
         FROM brain.conversation_outcomes
         WHERE org_id = $1`,
        [orgId],
      );
      if (convRows.length > 0) conversationStats = convRows[0];
    } catch {
      // Table may not exist yet
    }

    return NextResponse.json({
      learning_sources: stats,
      conversation_outcomes: conversationStats,
    });
  } catch (error) {
    console.error('[brain/learn] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get learning stats' },
      { status: 500 },
    );
  }
}

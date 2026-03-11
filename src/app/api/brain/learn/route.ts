import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

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

    // Use Claude to extract winning patterns from the email
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `You are a sales intelligence analyst. Extract winning patterns from emails that received positive replies. Return a JSON object with these fields:
- subject_line_pattern: What made this subject line effective (string)
- opening_line: The opening line approach that worked (string)
- cta_pattern: The call-to-action approach used (string)
- value_prop_angle: The main value proposition angle (string)
- personalization_elements: What personalization was used (string[])
- tone_description: The tone and style that worked (string)
- key_phrases: 2-3 specific phrases worth reusing (string[])

Be specific and actionable. Focus on what can be reused in future emails.`,
      messages: [{
        role: 'user',
        content: `Analyze this cold email that received a ${reply_sentiment || 'positive'} reply:

SUBJECT: ${subject}

BODY:
${body}

${reply_text ? `REPLY FROM PROSPECT:\n${reply_text}` : ''}

${angle ? `ANGLE USED: ${angle}` : ''}
${business_name ? `BUSINESS: ${business_name}` : ''}
${cuisine_type ? `CUISINE: ${cuisine_type}` : ''}

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
          `INSERT INTO brain.auto_learned (source_type, source_id, pattern_type, content, context, confidence)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            'email_reply',
            email_send_id || null,
            p.type,
            p.content,
            JSON.stringify(sourceContext),
            reply_sentiment === 'positive' ? 0.8 : 0.6,
          ]
        );
        results.push(`Learned ${p.type}: ${p.content.slice(0, 50)}...`);
      }
    }

    // Store key phrases
    if (analysis.key_phrases && Array.isArray(analysis.key_phrases)) {
      for (const phrase of analysis.key_phrases) {
        await query(
          `INSERT INTO brain.auto_learned (source_type, source_id, pattern_type, content, context, confidence)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            'email_reply',
            email_send_id || null,
            'key_phrase',
            phrase,
            JSON.stringify(sourceContext),
            reply_sentiment === 'positive' ? 0.8 : 0.6,
          ]
        );
        results.push(`Learned phrase: ${phrase}`);
      }
    }

    // Log effectiveness
    await query(
      `INSERT INTO brain.effectiveness_log (content_type, email_send_id, lead_id, event_type, outcome)
       VALUES ($1, $2, $3, $4, $5)`,
      ['auto_learn', email_send_id || null, lead_id || null, 'reply_received', reply_sentiment || 'positive']
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

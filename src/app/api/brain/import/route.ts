import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import Anthropic from '@anthropic-ai/sdk';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';
import { sanitizeInput, detectInjection, INPUT_LIMITS, armorSystemPrompt } from '@/lib/prompt-guard';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

/**
 * POST /api/brain/import
 * Import content into the Knowledge Brain from various sources:
 * - fathom_transcript: Paste a Fathom call transcript, AI extracts key snippets
 * - email_reply: Paste a successful email + reply, AI extracts winning patterns
 * - bulk_text: Paste raw text (e.g. competitor research, product notes), AI structures it
 *
 * Body: { source_type, content, metadata? }
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const { source_type, content, metadata } = await request.json();

    if (!source_type || !content) {
      return NextResponse.json(
        { error: 'source_type and content are required' },
        { status: 400 }
      );
    }

    // Validate content length
    if (content.length > INPUT_LIMITS.brain_content) {
      return NextResponse.json(
        { error: `Content exceeds ${INPUT_LIMITS.brain_content} character limit` },
        { status: 400 }
      );
    }

    // Check for prompt injection patterns
    const injectionMatch = detectInjection(content);
    if (injectionMatch) {
      console.warn(`[brain/import] Injection pattern detected: "${injectionMatch}" from org ${orgId}`);
      return NextResponse.json(
        { error: 'Content contains potentially malicious patterns. Please remove instruction-like text and retry.' },
        { status: 400 }
      );
    }

    // Sanitize metadata fields
    const safeMetadata = {
      business_name: sanitizeInput(metadata?.business_name, INPUT_LIMITS.contact_field),
      call_outcome: sanitizeInput(metadata?.call_outcome, INPUT_LIMITS.contact_field),
      angle: sanitizeInput(metadata?.angle, INPUT_LIMITS.angle),
      reply_sentiment: sanitizeInput(metadata?.reply_sentiment, INPUT_LIMITS.contact_field),
      category: sanitizeInput(metadata?.category, INPUT_LIMITS.contact_field),
    };

    let systemPrompt = '';
    let userPrompt = '';

    switch (source_type) {
      case 'fathom_transcript':
        systemPrompt = `You are a sales intelligence analyst. Extract actionable sales intelligence from a Fathom call transcript. Return a JSON array of objects, each with:
- title: A descriptive title for this insight (string)
- content_type: One of: "winning_phrases", "objections", "competitor_intel", "pricing", "case_studies", "product_knowledge", "call_intelligence" (string)
- raw_text: The extracted insight with enough context to be useful (string)
- key_claims: Key claims or talking points (string[])
- value_props: Value propositions demonstrated (string[])
- pain_points_addressed: Pain points this addresses (string[])

Focus on extracting:
1. Phrases/approaches that clearly resonated with the prospect
2. Objections raised and how they were handled (successful or not)
3. Competitor mentions and context
4. Pricing discussions and outcomes
5. Discovery questions that unlocked useful information
6. Value props that landed well

Be specific and actionable. Each entry should be independently useful.`;
        userPrompt = `Extract sales intelligence from this Fathom call transcript:\n\n<user-data label="transcript">\n${content}\n</user-data>${safeMetadata.business_name ? `\n\nBusiness: ${safeMetadata.business_name}` : ''}${safeMetadata.call_outcome ? `\nCall Outcome: ${safeMetadata.call_outcome}` : ''}`;
        break;

      case 'email_reply':
        systemPrompt = `You are a sales intelligence analyst. Analyze a cold email that received a reply and extract winning patterns. Return a JSON object with two sections:

1. "brain_entries": Array of objects for brain.internal_content, each with:
   - title, content_type, raw_text, key_claims, value_props, pain_points_addressed

2. "auto_learned": Array of objects for brain.auto_learned, each with:
   - pattern_type: One of "subject_line", "opening_line", "cta", "value_prop", "tone", "key_phrase"
   - content: The specific pattern or phrase worth learning

Focus on what made this email successful and what patterns can be reused.`;
        userPrompt = `Analyze this email exchange:\n\n<user-data label="email-exchange">\n${content}\n</user-data>${safeMetadata.angle ? `\n\nAngle used: ${safeMetadata.angle}` : ''}${safeMetadata.reply_sentiment ? `\nReply sentiment: ${safeMetadata.reply_sentiment}` : ''}`;
        break;

      case 'bulk_text':
        systemPrompt = `You are a sales intelligence analyst. Structure raw text into useful brain entries. Return a JSON array of objects, each with:
- title: A descriptive title (string)
- content_type: Best matching type from: "product_knowledge", "objections", "winning_phrases", "competitor_intel", "pricing", "case_studies", "industry_research" (string)
- raw_text: The structured content (string)
- key_claims: Key claims or facts (string[])
- value_props: Value propositions if applicable (string[])
- pain_points_addressed: Pain points if applicable (string[])

Break the text into logical, independently useful entries. Each should have a clear purpose.`;
        userPrompt = `Structure this content into brain entries:\n\n<user-data label="content">\n${content}\n</user-data>${safeMetadata.category ? `\n\nIntended category: ${safeMetadata.category}` : ''}`;
        break;

      default:
        return NextResponse.json(
          { error: `Unknown source_type: ${source_type}. Use: fathom_transcript, email_reply, bulk_text` },
          { status: 400 }
        );
    }

    // Call Claude to extract/structure the content
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: armorSystemPrompt(systemPrompt),
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON from response
    let parsed;
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    if (!parsed) {
      return NextResponse.json({ error: 'No structured data extracted' }, { status: 500 });
    }

    const results: string[] = [];

    // Handle email_reply format (has brain_entries + auto_learned)
    if (source_type === 'email_reply' && !Array.isArray(parsed)) {
      const brainEntries = parsed.brain_entries || [];
      const autoLearned = parsed.auto_learned || [];

      for (const entry of brainEntries) {
        if (!entry.title || !entry.raw_text) continue;
        await query(
          `INSERT INTO brain.internal_content
           (id, content_hash, content_type, title, raw_text, key_claims, value_props, pain_points_addressed, source_type, is_active, org_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'import', true, $8, NOW(), NOW())`,
          [
            `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            entry.content_type || 'winning_phrases',
            entry.title,
            entry.raw_text,
            JSON.stringify(entry.key_claims || []),
            JSON.stringify(entry.value_props || []),
            JSON.stringify(entry.pain_points_addressed || []),
            orgId,
          ]
        );
        results.push(`Brain: ${entry.title}`);
      }

      for (const pattern of autoLearned) {
        if (!pattern.content) continue;
        await query(
          `INSERT INTO brain.auto_learned (source_type, source_id, pattern_type, content, context, confidence, org_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            'email_import',
            null,
            pattern.pattern_type || 'key_phrase',
            pattern.content,
            JSON.stringify(metadata || {}),
            0.7,
            orgId,
          ]
        );
        results.push(`Learned: ${pattern.content.slice(0, 50)}...`);
      }
    } else {
      // Handle array format (fathom_transcript, bulk_text)
      const entries = Array.isArray(parsed) ? parsed : [parsed];

      for (const entry of entries) {
        if (!entry.title || !entry.raw_text) continue;
        await query(
          `INSERT INTO brain.internal_content
           (id, content_hash, content_type, title, raw_text, key_claims, value_props, pain_points_addressed, source_type, is_active, org_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW(), NOW())`,
          [
            `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            entry.content_type || 'call_intelligence',
            entry.title,
            entry.raw_text,
            JSON.stringify(entry.key_claims || []),
            JSON.stringify(entry.value_props || []),
            JSON.stringify(entry.pain_points_addressed || []),
            source_type === 'fathom_transcript' ? 'fathom_import' : 'import',
            orgId,
          ]
        );
        results.push(`Imported: ${entry.title}`);
      }
    }

    return NextResponse.json({
      success: true,
      entries_created: results.length,
      results,
    });
  } catch (error) {
    console.error('[brain/import] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}

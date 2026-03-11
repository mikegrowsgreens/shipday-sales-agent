import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

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
    const { source_type, content, metadata } = await request.json();

    if (!source_type || !content) {
      return NextResponse.json(
        { error: 'source_type and content are required' },
        { status: 400 }
      );
    }

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
        userPrompt = `Extract sales intelligence from this Fathom call transcript:\n\n${content}${metadata?.business_name ? `\n\nBusiness: ${metadata.business_name}` : ''}${metadata?.call_outcome ? `\nCall Outcome: ${metadata.call_outcome}` : ''}`;
        break;

      case 'email_reply':
        systemPrompt = `You are a sales intelligence analyst. Analyze a cold email that received a reply and extract winning patterns. Return a JSON object with two sections:

1. "brain_entries": Array of objects for brain.internal_content, each with:
   - title, content_type, raw_text, key_claims, value_props, pain_points_addressed

2. "auto_learned": Array of objects for brain.auto_learned, each with:
   - pattern_type: One of "subject_line", "opening_line", "cta", "value_prop", "tone", "key_phrase"
   - content: The specific pattern or phrase worth learning

Focus on what made this email successful and what patterns can be reused.`;
        userPrompt = `Analyze this email exchange:\n\n${content}${metadata?.angle ? `\n\nAngle used: ${metadata.angle}` : ''}${metadata?.reply_sentiment ? `\nReply sentiment: ${metadata.reply_sentiment}` : ''}`;
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
        userPrompt = `Structure this content into brain entries:\n\n${content}${metadata?.category ? `\n\nIntended category: ${metadata.category}` : ''}`;
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
      system: systemPrompt,
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
           (id, content_hash, content_type, title, raw_text, key_claims, value_props, pain_points_addressed, source_type, is_active, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'import', true, NOW(), NOW())`,
          [
            `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            entry.content_type || 'winning_phrases',
            entry.title,
            entry.raw_text,
            JSON.stringify(entry.key_claims || []),
            JSON.stringify(entry.value_props || []),
            JSON.stringify(entry.pain_points_addressed || []),
          ]
        );
        results.push(`Brain: ${entry.title}`);
      }

      for (const pattern of autoLearned) {
        if (!pattern.content) continue;
        await query(
          `INSERT INTO brain.auto_learned (source_type, source_id, pattern_type, content, context, confidence)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            'email_import',
            null,
            pattern.pattern_type || 'key_phrase',
            pattern.content,
            JSON.stringify(metadata || {}),
            0.7,
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
           (id, content_hash, content_type, title, raw_text, key_claims, value_props, pain_points_addressed, source_type, is_active, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())`,
          [
            `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            entry.content_type || 'call_intelligence',
            entry.title,
            entry.raw_text,
            JSON.stringify(entry.key_claims || []),
            JSON.stringify(entry.value_props || []),
            JSON.stringify(entry.pain_points_addressed || []),
            source_type === 'fathom_transcript' ? 'fathom_import' : 'import',
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

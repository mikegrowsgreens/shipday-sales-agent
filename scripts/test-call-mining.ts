/**
 * Test script: Validate the call pattern mining pipeline (Session 1).
 *
 * Runs directly against the database (bypasses API auth) to:
 * 1. Find processed, unmined sales calls
 * 2. Run Claude extraction on a single call
 * 3. Store patterns in brain.call_patterns
 * 4. Print results
 *
 * Usage: npx tsx scripts/test-call-mining.ts
 */

import dotenv from 'dotenv';
import path from 'path';
// Load env files - override: true to ensure values are set
const prodEnv = dotenv.config({ path: path.join(__dirname, '..', '.env.production') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });
// Manually apply parsed values since dotenv may not set them on process.env
if (prodEnv.parsed) {
  for (const [k, v] of Object.entries(prodEnv.parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

import { Pool } from 'pg';
import Anthropic from '@anthropic-ai/sdk';

const DATABASE_URL = process.env.DATABASE_URL_WINCALL || '';
const pool = new Pool({
  connectionString: DATABASE_URL.replace(/[?&]sslmode=require/g, ''),
  ssl: DATABASE_URL.includes('digitalocean') ? { rejectUnauthorized: false } : false,
});

const apiKey = process.env.ANTHROPIC_API_KEY || '';
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not found in environment. Check .env.production');
  process.exit(1);
}
const client = new Anthropic({ apiKey });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

interface TranscriptEntry {
  text: string;
  speaker?: { display_name?: string; matched_calendar_invitee_email?: string | null };
  timestamp?: string;
}

const EXTRACTION_PROMPT = `You are an elite sales intelligence analyst specializing in B2B SaaS sales pattern extraction.

Analyze the call transcript and extract actionable sales patterns. For EACH pattern found, classify it into exactly one of these 6 types:

1. **objection_handling** — An objection the prospect raised and how the rep handled it.
2. **discovery_question** — A question the rep asked that led to important qualification info.
3. **roi_story** — An ROI framing that engaged the prospect.
4. **closing_technique** — A close attempt that worked.
5. **competitor_counter** — How the rep handled a competitor mention.
6. **prospect_pain_verbatim** — Pain points in the prospect's own words.

Return a JSON object with key "patterns" containing an array of objects with:
- pattern_type: one of the 6 types
- pattern_text: the pattern (1-3 sentences)
- effectiveness_hint: "high", "medium", or "low"
- context_note: brief note about context

Return ONLY valid JSON, no markdown.`;

async function main() {
  console.log('=== Call Pattern Mining Test ===\n');

  // 1. Find a processed, unmined sales call
  const result = await pool.query(
    `SELECT call_id, title, raw_transcript, owner_email, call_type
     FROM public.calls
     WHERE extraction_status = 'processed'
       AND brain_mined = FALSE
       AND call_type = 'sales'
       AND raw_transcript IS NOT NULL
     LIMIT 1`,
  );

  if (result.rows.length === 0) {
    console.log('No unmined processed sales calls found.');
    await pool.end();
    return;
  }

  const call = result.rows[0];
  console.log(`Processing: ${call.title} (${call.call_id})`);
  console.log(`Owner: ${call.owner_email}`);

  const transcript = call.raw_transcript as TranscriptEntry[];
  if (!Array.isArray(transcript) || transcript.length === 0) {
    console.log('No transcript entries.');
    await pool.end();
    return;
  }

  // 2. Format transcript
  const formatted = transcript
    .map(e => `[${e.timestamp || ''}] ${e.speaker?.display_name || 'Unknown'}: ${e.text}`)
    .join('\n');

  console.log(`\nTranscript: ${transcript.length} entries, ${formatted.length} chars`);

  // 3. Run Claude extraction
  console.log('\nCalling Claude for pattern extraction...');
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: EXTRACTION_PROMPT,
    messages: [{
      role: 'user',
      content: `Call: ${call.title || 'Untitled'}\nRep: ${call.owner_email}\n\nTranscript:\n${formatted.slice(0, 30000)}`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log('Failed to parse JSON from Claude response.');
    console.log('Raw response:', text.slice(0, 500));
    await pool.end();
    return;
  }

  const extraction = JSON.parse(jsonMatch[0]) as {
    patterns: Array<{
      pattern_type: string;
      pattern_text: string;
      effectiveness_hint: string;
      context_note: string;
    }>;
  };

  const patterns = extraction.patterns || [];
  console.log(`\nExtracted ${patterns.length} patterns:\n`);

  const scoreMap: Record<string, number> = { high: 0.85, medium: 0.65, low: 0.4 };
  const validTypes = [
    'objection_handling', 'discovery_question', 'roi_story',
    'closing_technique', 'competitor_counter', 'prospect_pain_verbatim',
  ];

  let inserted = 0;
  for (const p of patterns) {
    if (!validTypes.includes(p.pattern_type)) {
      console.log(`  SKIP (invalid type): ${p.pattern_type}`);
      continue;
    }
    if (!p.pattern_text || p.pattern_text.length < 10) {
      console.log(`  SKIP (too short): ${p.pattern_text}`);
      continue;
    }

    const score = scoreMap[p.effectiveness_hint] || 0.5;

    console.log(`  [${p.pattern_type}] (score: ${score}) ${p.pattern_text.slice(0, 100)}...`);
    console.log(`    Context: ${p.context_note}`);

    // 4. Insert into brain.call_patterns
    await pool.query(
      `INSERT INTO brain.call_patterns
        (pattern_type, pattern_text, context, effectiveness_score, owner_email, org_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        p.pattern_type,
        p.pattern_text,
        JSON.stringify({
          call_id: call.call_id,
          call_title: call.title,
          outcome: 'unknown',
          context_note: p.context_note,
        }),
        score,
        call.owner_email,
        1, // org_id
      ],
    );
    inserted++;
  }

  // 5. Mark call as mined
  await pool.query(`UPDATE public.calls SET brain_mined = TRUE WHERE call_id = $1`, [call.call_id]);

  console.log(`\n=== Results ===`);
  console.log(`Patterns inserted: ${inserted}`);

  // 6. Verify patterns in DB
  const check = await pool.query(
    `SELECT pattern_type, count(*) as cnt
     FROM brain.call_patterns
     WHERE org_id = 1
     GROUP BY pattern_type
     ORDER BY cnt DESC`,
  );
  console.log('\nPatterns in brain.call_patterns by type:');
  for (const row of check.rows) {
    console.log(`  ${row.pattern_type}: ${row.cnt}`);
  }

  await pool.end();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import Anthropic from '@anthropic-ai/sdk';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';
import { sanitizeInput, armorSystemPrompt, wrapUserData, INPUT_LIMITS } from '@/lib/prompt-guard';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

interface TranscriptEntry {
  text: string;
  speaker?: { display_name?: string; matched_calendar_invitee_email?: string | null };
  timestamp?: string;
}

interface CallRow {
  call_id: string;
  title: string | null;
  raw_transcript: TranscriptEntry[];
  owner_email: string | null;
  call_type: string;
  attendee_emails: string[] | null;
  duration_seconds: number | null;
  call_date: string | null;
  org_id: number;
}

interface ExtractedPattern {
  pattern_type: string;
  pattern_text: string;
  effectiveness_hint: string;
  context_note: string;
}

const EXTRACTION_SYSTEM_PROMPT = armorSystemPrompt(`You are an elite sales intelligence analyst specializing in B2B SaaS sales pattern extraction.

Analyze the call transcript and extract actionable sales patterns. For EACH pattern found, classify it into exactly one of these 6 types:

1. **objection_handling** — An objection the prospect raised and how the rep handled it. Include: what was raised, how it was handled, and whether the handling seemed effective (prospect moved forward or remained stuck).

2. **discovery_question** — A question the rep asked that led to the prospect revealing important qualification info, pain points, or buying signals. Focus on questions that generated substantial, useful answers.

3. **roi_story** — An ROI framing, cost comparison, or savings narrative the rep used that clearly engaged the prospect (e.g., they asked follow-up questions, expressed interest, or shared their own numbers).

4. **closing_technique** — A specific close attempt or commitment-seeking move that worked. Include: what the rep asked for and how the prospect responded.

5. **competitor_counter** — How the rep handled a competitor mention. What competitor was named, what the prospect's concern was, and how the rep differentiated.

6. **prospect_pain_verbatim** — Pain points expressed in the prospect's OWN words, not paraphrased by the rep. These are gold for future outreach because they use the prospect's exact language.

Return a JSON object with a single key "patterns" containing an array of objects, each with:
- pattern_type: one of the 6 types above
- pattern_text: the extracted pattern (be specific and actionable, 1-3 sentences)
- effectiveness_hint: "high", "medium", or "low" based on how well it worked in context
- context_note: brief note about when/why this pattern was relevant

Extract ALL patterns you find. A single call might have 0-15+ patterns. Quality over quantity — only include genuinely reusable insights.

If the transcript is an internal meeting or has no sales patterns, return {"patterns": []}.

Return ONLY valid JSON, no markdown.`);

/**
 * POST /api/brain/learn-from-calls
 *
 * Queries all unprocessed (brain_mined = false) calls from public.calls,
 * runs Claude-powered extraction of 6 pattern types, and stores results
 * in brain.call_patterns. Marks calls as mined to avoid reprocessing.
 *
 * Body: { call_ids?: string[], limit?: number }
 * - call_ids: specific calls to mine (optional)
 * - limit: max calls to process in one batch (default: 10, max: 50)
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json().catch(() => ({}));
    const { call_ids, limit: rawLimit } = body as { call_ids?: string[]; limit?: number };
    const limit = Math.min(Math.max(rawLimit || 10, 1), 50);

    // Find calls to mine
    let callsToMine: CallRow[];

    if (call_ids?.length) {
      callsToMine = await query<CallRow>(
        `SELECT call_id, title, raw_transcript, owner_email, call_type,
                attendee_emails, duration_seconds, call_date, org_id
         FROM public.calls
         WHERE call_id = ANY($1)
           AND raw_transcript IS NOT NULL
           AND org_id = $2`,
        [call_ids, orgId],
      );
    } else {
      // All unmined calls with transcripts
      callsToMine = await query<CallRow>(
        `SELECT call_id, title, raw_transcript, owner_email, call_type,
                attendee_emails, duration_seconds, call_date, org_id
         FROM public.calls
         WHERE brain_mined = FALSE
           AND raw_transcript IS NOT NULL
           AND extraction_status = 'processed'
           AND org_id = $1
         ORDER BY call_date DESC
         LIMIT $2`,
        [orgId, limit],
      );
    }

    if (!callsToMine.length) {
      return NextResponse.json({
        processed: 0,
        total_patterns: 0,
        message: 'No unmined calls found. Either all calls have been mined or none have transcripts yet.',
      });
    }

    let totalPatterns = 0;
    const results: {
      call_id: string;
      title: string | null;
      patterns_extracted: number;
      success: boolean;
      error?: string;
    }[] = [];

    for (const call of callsToMine) {
      try {
        const transcript = call.raw_transcript;
        if (!Array.isArray(transcript) || transcript.length === 0) {
          // Mark as mined even if empty so we don't retry
          await query(`UPDATE public.calls SET brain_mined = TRUE WHERE call_id = $1`, [call.call_id]);
          results.push({ call_id: call.call_id, title: call.title, patterns_extracted: 0, success: true });
          continue;
        }

        // Skip internal calls — they don't have sales patterns
        if (call.call_type === 'internal') {
          await query(`UPDATE public.calls SET brain_mined = TRUE WHERE call_id = $1`, [call.call_id]);
          results.push({ call_id: call.call_id, title: call.title, patterns_extracted: 0, success: true });
          continue;
        }

        // Format transcript for Claude
        const formattedTranscript = transcript
          .map(entry => {
            const speaker = entry.speaker?.display_name || 'Unknown';
            const time = entry.timestamp || '';
            return `[${time}] ${speaker}: ${entry.text}`;
          })
          .join('\n');

        const sanitizedTranscript = sanitizeInput(formattedTranscript, INPUT_LIMITS.transcript);
        const sanitizedTitle = sanitizeInput(call.title);

        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4000,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `Call: ${sanitizedTitle || 'Untitled'}\nRep: ${call.owner_email || 'Unknown'}\nType: ${call.call_type}\n\n${wrapUserData('transcript', sanitizedTranscript)}`,
          }],
        });

        const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          await query(`UPDATE public.calls SET brain_mined = TRUE WHERE call_id = $1`, [call.call_id]);
          results.push({ call_id: call.call_id, title: call.title, patterns_extracted: 0, success: true });
          continue;
        }

        const extraction = JSON.parse(jsonMatch[0]) as { patterns: ExtractedPattern[] };
        const patterns = extraction.patterns || [];

        // Look up deal outcome for this call's contacts if possible
        const outcome = await lookupDealOutcome(call.attendee_emails, orgId);

        // Compute effectiveness score from hint + deal outcome
        const scoreMap: Record<string, number> = { high: 0.85, medium: 0.65, low: 0.4 };

        // Insert each pattern
        let insertedCount = 0;
        for (const p of patterns) {
          // Validate pattern_type
          const validTypes = [
            'objection_handling', 'discovery_question', 'roi_story',
            'closing_technique', 'competitor_counter', 'prospect_pain_verbatim',
          ];
          if (!validTypes.includes(p.pattern_type)) continue;
          if (!p.pattern_text || p.pattern_text.length < 10) continue;

          const baseScore = scoreMap[p.effectiveness_hint] || 0.5;
          // Boost score if deal was won, penalize if lost
          let finalScore = baseScore;
          if (outcome === 'won') finalScore = Math.min(1, baseScore + 0.1);
          if (outcome === 'lost') finalScore = Math.max(0, baseScore - 0.15);

          const context = {
            call_id: call.call_id,
            call_title: call.title,
            industry: null, // Could be enriched later
            company_size: null,
            outcome: outcome || 'unknown',
            attendee_emails: call.attendee_emails || [],
            context_note: p.context_note || '',
          };

          await query(
            `INSERT INTO brain.call_patterns
              (pattern_type, pattern_text, context, effectiveness_score, owner_email, org_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              p.pattern_type,
              p.pattern_text,
              JSON.stringify(context),
              finalScore,
              call.owner_email,
              orgId,
            ],
          );
          insertedCount++;
        }

        // Mark call as mined
        await query(`UPDATE public.calls SET brain_mined = TRUE WHERE call_id = $1`, [call.call_id]);

        totalPatterns += insertedCount;
        results.push({
          call_id: call.call_id,
          title: call.title,
          patterns_extracted: insertedCount,
          success: true,
        });
      } catch (err) {
        console.error(`[brain/learn-from-calls] failed for ${call.call_id}:`, err);
        results.push({
          call_id: call.call_id,
          title: call.title,
          patterns_extracted: 0,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      total_patterns: totalPatterns,
      results,
    });
  } catch (error) {
    console.error('[brain/learn-from-calls] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Learning from calls failed' },
      { status: 500 },
    );
  }
}

/**
 * Look up deal outcome for contacts associated with a call.
 * Checks the deals DB to see if any attendee email maps to a won/lost deal.
 */
async function lookupDealOutcome(
  attendeeEmails: string[] | null,
  orgId: number,
): Promise<string | null> {
  if (!attendeeEmails?.length) return null;

  try {
    // Check if any attendee has a deal with a known outcome
    const { queryDeals } = await import('@/lib/db');
    const deals = await queryDeals<{ stage: string }>(
      `SELECT stage FROM deals.deals
       WHERE owner_email = ANY($1)
       LIMIT 1`,
      [attendeeEmails],
    );

    if (!deals.length) return null;

    const stage = deals[0].stage?.toLowerCase() || '';
    if (stage.includes('won') || stage.includes('closed won')) return 'won';
    if (stage.includes('lost') || stage.includes('closed lost')) return 'lost';
    return 'pending';
  } catch {
    // Deals DB might not have matching data — that's fine
    return null;
  }
}

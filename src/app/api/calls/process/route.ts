import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';
import { requireTenantSession } from '@/lib/tenant';
import { sanitizeInput, armorSystemPrompt, wrapUserData, INPUT_LIMITS } from '@/lib/prompt-guard';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

interface TranscriptEntry {
  text: string;
  speaker?: { display_name?: string; matched_calendar_invitee_email?: string | null };
  timestamp?: string;
}

/**
 * POST /api/calls/process
 * Process raw call transcript(s) with Claude to extract summaries, action items,
 * topics, and coaching metrics. Saves results back to public.calls.
 *
 * Body: { call_ids?: string[], all_team?: boolean } — if omitted, processes unprocessed calls for the configured owner.
 *   Set all_team=true to process calls from all team members (needed for team-wide brain mining).
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const config = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
    const ownerEmail = config.persona?.sender_email || '';
    const ownerName = config.persona?.sender_name || '';

    const body = await request.json().catch(() => ({}));
    const { call_ids, all_team } = body as { call_ids?: string[]; all_team?: boolean };

    // Find calls to process
    let callsToProcess;
    if (call_ids?.length) {
      callsToProcess = await query<{
        call_id: string;
        title: string | null;
        raw_transcript: TranscriptEntry[];
        owner_email: string;
      }>(
        `SELECT call_id, title, raw_transcript, owner_email
         FROM public.calls
         WHERE call_id = ANY($1) AND raw_transcript IS NOT NULL AND org_id = $2`,
        [call_ids, orgId],
      );
    } else if (all_team) {
      // Process all unprocessed calls across the entire team
      callsToProcess = await query<{
        call_id: string;
        title: string | null;
        raw_transcript: TranscriptEntry[];
        owner_email: string;
      }>(
        `SELECT call_id, title, raw_transcript, owner_email
         FROM public.calls
         WHERE raw_transcript IS NOT NULL
           AND meeting_summary IS NULL
           AND org_id = $1
         ORDER BY call_date DESC
         LIMIT 20`,
        [orgId],
      );
    } else {
      // Process unprocessed calls for the configured owner only
      callsToProcess = await query<{
        call_id: string;
        title: string | null;
        raw_transcript: TranscriptEntry[];
        owner_email: string;
      }>(
        `SELECT call_id, title, raw_transcript, owner_email
         FROM public.calls
         WHERE owner_email = $1
           AND raw_transcript IS NOT NULL
           AND meeting_summary IS NULL
           AND org_id = $2
         ORDER BY call_date DESC
         LIMIT 20`,
        [ownerEmail, orgId],
      );
    }

    if (!callsToProcess.length) {
      return NextResponse.json({ processed: 0, message: 'No calls to process' });
    }

    const results: { call_id: string; title: string | null; success: boolean }[] = [];

    for (const call of callsToProcess) {
      try {
        const transcript = call.raw_transcript;
        if (!Array.isArray(transcript) || transcript.length === 0) {
          results.push({ call_id: call.call_id, title: call.title, success: false });
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

        // Identify the rep's speaking parts for coaching metrics
        const isRepSpeaker = (e: TranscriptEntry) =>
          e.speaker?.display_name === ownerName ||
          e.speaker?.matched_calendar_invitee_email === ownerEmail;

        const repLines = transcript.filter(isRepSpeaker);
        const otherLines = transcript.filter(e => !isRepSpeaker(e));

        const repWordCount = repLines.reduce((sum, e) => sum + (e.text?.split(/\s+/).length || 0), 0);
        const otherWordCount = otherLines.reduce((sum, e) => sum + (e.text?.split(/\s+/).length || 0), 0);
        const totalWords = repWordCount + otherWordCount;
        const talkListenRatio = totalWords > 0 ? +(repWordCount / totalWords).toFixed(2) : 0.5;

        // Count rep's questions
        const questionCount = repLines.filter(e => e.text?.includes('?')).length;

        // Count filler words
        const fillerPattern = /\b(um|uh|like|you know|basically|actually|sort of|kind of)\b/gi;
        const fillerWordCount = repLines.reduce((sum, e) => {
          const matches = e.text?.match(fillerPattern);
          return sum + (matches?.length || 0);
        }, 0);

        // Longest monologue: find consecutive rep lines
        let longestMonologue = 0;
        let currentMonologue = 0;
        for (const entry of transcript) {
          const isRep = isRepSpeaker(entry);
          if (isRep) {
            currentMonologue += entry.text?.split(/\s+/).length || 0;
          } else {
            longestMonologue = Math.max(longestMonologue, currentMonologue);
            currentMonologue = 0;
          }
        }
        longestMonologue = Math.max(longestMonologue, currentMonologue);
        // Rough estimate: 150 words per minute speaking rate
        const longestMonologueSeconds = Math.round(longestMonologue / 2.5);

        // Call Claude for summary, action items, and topics
        const callSystemPrompt = armorSystemPrompt(`You are a sales call analyst. Analyze the transcript and return a JSON object with these fields:
- meeting_summary: A concise 2-3 sentence summary of the call including the key discussion points and outcome.
- action_items: An array of strings listing specific next steps or action items mentioned during the call.
- topics_discussed: An array of short topic labels (2-4 words each) covering the main subjects discussed.
- decisions: An array of strings listing any decisions made during the call.

Return ONLY valid JSON, no markdown.`);

        const sanitizedTitle = sanitizeInput(call.title);
        const sanitizedTranscript = sanitizeInput(formattedTranscript, INPUT_LIMITS.transcript);

        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 1500,
          system: callSystemPrompt,
          messages: [{
            role: 'user',
            content: `Call title: ${sanitizedTitle || 'Untitled Call'}\n\n${wrapUserData('transcript', sanitizedTranscript)}`,
          }],
        });

        const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
        // Parse JSON from response, handle markdown code blocks
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          results.push({ call_id: call.call_id, title: call.title, success: false });
          continue;
        }

        const analysis = JSON.parse(jsonMatch[0]) as {
          meeting_summary: string;
          action_items: string[];
          topics_discussed: string[];
          decisions: string[];
        };

        // Update the call record
        await query(
          `UPDATE public.calls SET
             meeting_summary = $1,
             action_items = $2,
             topics_discussed = $3,
             decisions = $4,
             talk_listen_ratio = $5,
             question_count = $6,
             filler_word_count = $7,
             longest_monologue_seconds = $8,
             extraction_status = 'processed'
           WHERE call_id = $9`,
          [
            analysis.meeting_summary,
            JSON.stringify(analysis.action_items),
            JSON.stringify(analysis.topics_discussed),
            JSON.stringify(analysis.decisions),
            talkListenRatio,
            questionCount,
            fillerWordCount,
            longestMonologueSeconds,
            call.call_id,
          ],
        );

        results.push({ call_id: call.call_id, title: call.title, success: true });
      } catch (err) {
        console.error(`[calls/process] failed for ${call.call_id}:`, err);
        results.push({ call_id: call.call_id, title: call.title, success: false });
      }
    }

    return NextResponse.json({
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    console.error('[calls/process] error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

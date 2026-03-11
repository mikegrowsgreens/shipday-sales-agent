import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

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
 * Body: { call_ids?: string[] } — if omitted, processes all unprocessed calls for Mike.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { call_ids } = body as { call_ids?: string[] };

    // Find calls to process
    let callsToProcess;
    if (call_ids?.length) {
      const placeholders = call_ids.map((_, i) => `$${i + 1}`).join(',');
      callsToProcess = await query<{
        call_id: string;
        title: string | null;
        raw_transcript: TranscriptEntry[];
        owner_email: string;
      }>(
        `SELECT call_id, title, raw_transcript, owner_email
         FROM public.calls
         WHERE call_id IN (${placeholders}) AND raw_transcript IS NOT NULL`,
        call_ids,
      );
    } else {
      // Process all unprocessed calls for Mike
      callsToProcess = await query<{
        call_id: string;
        title: string | null;
        raw_transcript: TranscriptEntry[];
        owner_email: string;
      }>(
        `SELECT call_id, title, raw_transcript, owner_email
         FROM public.calls
         WHERE owner_email = 'mike.paulus@shipday.com'
           AND raw_transcript IS NOT NULL
           AND meeting_summary IS NULL
         ORDER BY call_date DESC
         LIMIT 20`,
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

        // Identify Mike's speaking parts for coaching metrics
        const mikeLines = transcript.filter(
          e => e.speaker?.display_name === 'Mike Paulus' ||
               e.speaker?.matched_calendar_invitee_email === 'mike.paulus@shipday.com'
        );
        const otherLines = transcript.filter(
          e => e.speaker?.display_name !== 'Mike Paulus' &&
               e.speaker?.matched_calendar_invitee_email !== 'mike.paulus@shipday.com'
        );

        const mikeWordCount = mikeLines.reduce((sum, e) => sum + (e.text?.split(/\s+/).length || 0), 0);
        const otherWordCount = otherLines.reduce((sum, e) => sum + (e.text?.split(/\s+/).length || 0), 0);
        const totalWords = mikeWordCount + otherWordCount;
        const talkListenRatio = totalWords > 0 ? +(mikeWordCount / totalWords).toFixed(2) : 0.5;

        // Count Mike's questions
        const questionCount = mikeLines.filter(e => e.text?.includes('?')).length;

        // Count filler words
        const fillerPattern = /\b(um|uh|like|you know|basically|actually|sort of|kind of)\b/gi;
        const fillerWordCount = mikeLines.reduce((sum, e) => {
          const matches = e.text?.match(fillerPattern);
          return sum + (matches?.length || 0);
        }, 0);

        // Longest monologue: find consecutive Mike lines
        let longestMonologue = 0;
        let currentMonologue = 0;
        for (const entry of transcript) {
          const isMike = entry.speaker?.display_name === 'Mike Paulus' ||
                         entry.speaker?.matched_calendar_invitee_email === 'mike.paulus@shipday.com';
          if (isMike) {
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
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 1500,
          system: `You are a sales call analyst. Analyze the transcript and return a JSON object with these fields:
- meeting_summary: A concise 2-3 sentence summary of the call including the key discussion points and outcome.
- action_items: An array of strings listing specific next steps or action items mentioned during the call.
- topics_discussed: An array of short topic labels (2-4 words each) covering the main subjects discussed.
- decisions: An array of strings listing any decisions made during the call.

Return ONLY valid JSON, no markdown.`,
          messages: [{
            role: 'user',
            content: `Call title: ${call.title || 'Untitled Call'}\n\nTranscript:\n${formattedTranscript.slice(0, 30000)}`,
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

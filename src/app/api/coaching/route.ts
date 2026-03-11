import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/coaching
 * Rep performance metrics, call patterns, and improvement suggestions.
 */
export async function GET(_request: NextRequest) {
  try {
    // Call metrics summary (last 30 days) — Mike only
    const callMetrics = await query<{
      total_calls: string;
      avg_duration: string;
      avg_talk_ratio: string;
      avg_questions: string;
      avg_fillers: string;
      processed_count: string;
    }>(
      `SELECT COUNT(*) AS total_calls,
              ROUND(AVG(duration_seconds)) AS avg_duration,
              ROUND(AVG(talk_listen_ratio)::numeric, 2) AS avg_talk_ratio,
              ROUND(AVG(question_count)::numeric, 1) AS avg_questions,
              ROUND(AVG(filler_word_count)::numeric, 1) AS avg_fillers,
              COUNT(CASE WHEN meeting_summary IS NOT NULL THEN 1 END) AS processed_count
       FROM public.calls
       WHERE call_date >= NOW() - interval '30 days'
         AND owner_email = 'mike.paulus@shipday.com'`
    );

    // Unprocessed calls count
    const unprocessed = await query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM public.calls
       WHERE owner_email = 'mike.paulus@shipday.com'
         AND raw_transcript IS NOT NULL
         AND meeting_summary IS NULL`
    );

    // Recent calls with full data — Mike only
    const recentCalls = await query(
      `SELECT c.call_id, c.title, c.call_date, c.duration_seconds,
              c.talk_listen_ratio, c.question_count, c.filler_word_count,
              c.longest_monologue_seconds, c.call_type,
              c.meeting_summary, c.action_items, c.topics_discussed,
              c.fathom_url, c.extraction_status
       FROM public.calls c
       WHERE c.call_date >= NOW() - interval '60 days'
         AND c.owner_email = 'mike.paulus@shipday.com'
       ORDER BY c.call_date DESC
       LIMIT 30`
    );

    return NextResponse.json({
      callMetrics,
      recentCalls,
      unprocessedCount: parseInt(unprocessed[0]?.cnt || '0'),
    });
  } catch (error) {
    console.error('[coaching] error:', error);
    return NextResponse.json({ error: 'Failed to load coaching data' }, { status: 500 });
  }
}

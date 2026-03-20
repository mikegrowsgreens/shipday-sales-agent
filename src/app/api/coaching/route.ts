import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgPlan, requireFeature } from '@/lib/feature-gate';
import { getUserEmails } from '@/lib/user-emails';

/**
 * GET /api/coaching
 * Rep performance metrics, call patterns, and improvement suggestions.
 * Scoped to current user via email matching (login + work email).
 */
export async function GET(_request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const plan = await getOrgPlan(tenant.org_id);
    requireFeature(plan, 'coaching');

    // Get all emails associated with this user (login + work email)
    const userEmails = await getUserEmails(tenant.user_id, tenant.email);

    // Filter calls by owner_email or attendee_emails matching ANY of user's emails
    const userCallFilter = `AND (owner_email = ANY($2::text[]) OR attendee_emails && $2::text[])`;

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
         AND org_id = $1
         ${userCallFilter}`,
      [orgId, userEmails.all]
    );

    // Unprocessed calls count
    const unprocessed = await query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM public.calls
       WHERE org_id = $1
         ${userCallFilter}
         AND raw_transcript IS NOT NULL
         AND meeting_summary IS NULL`,
      [orgId, userEmails.all]
    );

    // Recent calls with full data
    const recentCalls = await query(
      `SELECT c.call_id, c.title, c.call_date, c.duration_seconds,
              c.talk_listen_ratio, c.question_count, c.filler_word_count,
              c.longest_monologue_seconds, c.call_type,
              c.meeting_summary, c.action_items, c.topics_discussed,
              c.fathom_url, c.extraction_status
       FROM public.calls c
       WHERE c.call_date >= NOW() - interval '60 days'
         AND c.org_id = $1
         ${userCallFilter}
       ORDER BY c.call_date DESC
       LIMIT 30`,
      [orgId, userEmails.all]
    );

    return NextResponse.json({
      callMetrics,
      recentCalls,
      unprocessedCount: parseInt(unprocessed[0]?.cnt || '0'),
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[coaching] error:', error);
    return NextResponse.json({ error: 'Failed to load coaching data' }, { status: 500 });
  }
}

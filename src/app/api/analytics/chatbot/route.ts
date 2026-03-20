import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

const periodToDays: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * GET /api/analytics/chatbot?period=7d|30d|90d
 * Chatbot conversation metrics: volume, qualification, booking, abandonment.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const period = request.nextUrl.searchParams.get('period') || '30d';
    const days = periodToDays[period] || 30;

    // Summary metrics
    const summary = await query<{
      total_conversations: string;
      avg_messages: string;
      demo_booked_count: string;
      lead_captured_count: string;
      abandoned_count: string;
      avg_qualification: string;
      avg_duration_minutes: string;
    }>(
      `SELECT
        COUNT(*) AS total_conversations,
        ROUND(AVG(messages_count), 1) AS avg_messages,
        COUNT(*) FILTER (WHERE demo_booked = true) AS demo_booked_count,
        COUNT(*) FILTER (WHERE lead_captured = true) AS lead_captured_count,
        COUNT(*) FILTER (WHERE terminal_state = 'abandoned') AS abandoned_count,
        ROUND(AVG(qualification_completeness), 1) AS avg_qualification,
        ROUND(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0), 1) AS avg_duration_minutes
      FROM brain.conversation_outcomes
      WHERE org_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2`,
      [orgId, days]
    );

    // Conversations per day trend
    const dailyTrend = await query<{ day: string; count: string }>(
      `SELECT DATE(started_at) AS day, COUNT(*) AS count
       FROM brain.conversation_outcomes
       WHERE org_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(started_at)
       ORDER BY day ASC`,
      [orgId, days]
    );

    // Terminal state breakdown
    const terminalStates = await query<{ terminal_state: string; count: string }>(
      `SELECT COALESCE(terminal_state, 'in_progress') AS terminal_state, COUNT(*) AS count
       FROM brain.conversation_outcomes
       WHERE org_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY terminal_state
       ORDER BY count DESC`,
      [orgId, days]
    );

    // Abandonment by qualification stage (how far they got before leaving)
    const abandonmentByQual = await query<{ bucket: string; count: string }>(
      `SELECT
        CASE
          WHEN qualification_completeness >= 80 THEN '80-100%'
          WHEN qualification_completeness >= 60 THEN '60-79%'
          WHEN qualification_completeness >= 40 THEN '40-59%'
          WHEN qualification_completeness >= 20 THEN '20-39%'
          ELSE '0-19%'
        END AS bucket,
        COUNT(*) AS count
      FROM brain.conversation_outcomes
      WHERE org_id = $1
        AND started_at >= NOW() - INTERVAL '1 day' * $2
        AND terminal_state = 'abandoned'
      GROUP BY bucket
      ORDER BY bucket ASC`,
      [orgId, days]
    );

    // Top objections raised across conversations
    const topObjections = await query<{ objection: string; count: string }>(
      `SELECT obj AS objection, COUNT(*) AS count
       FROM brain.conversation_outcomes,
            LATERAL unnest(objections_raised) AS obj
       WHERE org_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY obj
       ORDER BY count DESC
       LIMIT 10`,
      [orgId, days]
    );

    // Effective patterns used in conversations
    const topEffectivePatterns = await query<{ pattern: string; count: string }>(
      `SELECT pat AS pattern, COUNT(*) AS count
       FROM brain.conversation_outcomes,
            LATERAL unnest(effective_patterns) AS pat
       WHERE org_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY pat
       ORDER BY count DESC
       LIMIT 10`,
      [orgId, days]
    );

    const s = summary[0] || {};
    const totalConvos = parseInt(s.total_conversations || '0');
    const demoBooked = parseInt(s.demo_booked_count || '0');
    const leadCaptured = parseInt(s.lead_captured_count || '0');
    const abandoned = parseInt(s.abandoned_count || '0');

    return NextResponse.json({
      summary: {
        total_conversations: totalConvos,
        avg_messages: parseFloat(s.avg_messages || '0'),
        demo_booking_rate: totalConvos > 0 ? ((demoBooked / totalConvos) * 100).toFixed(1) : '0',
        lead_capture_rate: totalConvos > 0 ? ((leadCaptured / totalConvos) * 100).toFixed(1) : '0',
        abandonment_rate: totalConvos > 0 ? ((abandoned / totalConvos) * 100).toFixed(1) : '0',
        avg_qualification: parseFloat(s.avg_qualification || '0'),
        avg_duration_minutes: parseFloat(s.avg_duration_minutes || '0'),
        demo_booked_count: demoBooked,
        lead_captured_count: leadCaptured,
      },
      dailyTrend,
      terminalStates,
      abandonmentByQual,
      topObjections,
      topEffectivePatterns,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[analytics/chatbot] error:', error);
    return NextResponse.json({ error: 'Failed to load chatbot analytics' }, { status: 500 });
  }
}

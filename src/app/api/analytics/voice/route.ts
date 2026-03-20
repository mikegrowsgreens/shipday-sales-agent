import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

const periodToDays: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * GET /api/analytics/voice?period=7d|30d|90d
 * Voice agent call metrics: volume, duration, qualification, handoffs, stages.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const period = request.nextUrl.searchParams.get('period') || '30d';
    const days = periodToDays[period] || 30;

    // Summary metrics
    const summary = await query<{
      total_calls: string;
      avg_duration: string;
      completed_calls: string;
      transferred_calls: string;
      handoff_count: string;
      avg_messages: string;
      has_roi: string;
    }>(
      `SELECT
        COUNT(*) AS total_calls,
        ROUND(AVG(duration_seconds) / 60.0, 1) AS avg_duration,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_calls,
        COUNT(*) FILTER (WHERE status = 'transferred') AS transferred_calls,
        COUNT(*) FILTER (WHERE handoff_triggered = true) AS handoff_count,
        ROUND(AVG(messages_count), 1) AS avg_messages,
        COUNT(*) FILTER (WHERE computed_roi IS NOT NULL) AS has_roi
      FROM crm.voice_agent_calls
      WHERE org_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2`,
      [orgId, days]
    );

    // Daily call trend
    const dailyTrend = await query<{ day: string; count: string }>(
      `SELECT DATE(started_at) AS day, COUNT(*) AS count
       FROM crm.voice_agent_calls
       WHERE org_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(started_at)
       ORDER BY day ASC`,
      [orgId, days]
    );

    // Status breakdown
    const statusBreakdown = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count
       FROM crm.voice_agent_calls
       WHERE org_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY status
       ORDER BY count DESC`,
      [orgId, days]
    );

    // Final stage distribution
    const stageDistribution = await query<{ final_stage: string; count: string }>(
      `SELECT COALESCE(final_stage, 'unknown') AS final_stage, COUNT(*) AS count
       FROM crm.voice_agent_calls
       WHERE org_id = $1 AND started_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY final_stage
       ORDER BY count DESC`,
      [orgId, days]
    );

    // Handoff reasons
    const handoffReasons = await query<{ handoff_reason: string; count: string }>(
      `SELECT COALESCE(handoff_reason, 'none') AS handoff_reason, COUNT(*) AS count
       FROM crm.voice_agent_calls
       WHERE org_id = $1
         AND started_at >= NOW() - INTERVAL '1 day' * $2
         AND handoff_triggered = true
       GROUP BY handoff_reason
       ORDER BY count DESC`,
      [orgId, days]
    );

    // Duration distribution
    const durationBuckets = await query<{ bucket: string; count: string }>(
      `SELECT
        CASE
          WHEN duration_seconds < 60 THEN '< 1 min'
          WHEN duration_seconds < 180 THEN '1-3 min'
          WHEN duration_seconds < 300 THEN '3-5 min'
          WHEN duration_seconds < 480 THEN '5-8 min'
          ELSE '8+ min'
        END AS bucket,
        COUNT(*) AS count
      FROM crm.voice_agent_calls
      WHERE org_id = $1
        AND started_at >= NOW() - INTERVAL '1 day' * $2
        AND duration_seconds IS NOT NULL
      GROUP BY bucket
      ORDER BY MIN(duration_seconds) ASC`,
      [orgId, days]
    );

    const s = summary[0] || {};
    const totalCalls = parseInt(s.total_calls || '0');
    const handoffCount = parseInt(s.handoff_count || '0');
    const completedCalls = parseInt(s.completed_calls || '0');

    return NextResponse.json({
      summary: {
        total_calls: totalCalls,
        avg_duration_minutes: parseFloat(s.avg_duration || '0'),
        completed_calls: completedCalls,
        transferred_calls: parseInt(s.transferred_calls || '0'),
        handoff_rate: totalCalls > 0 ? ((handoffCount / totalCalls) * 100).toFixed(1) : '0',
        completion_rate: totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(1) : '0',
        avg_messages: parseFloat(s.avg_messages || '0'),
        roi_presented_rate: totalCalls > 0 ? ((parseInt(s.has_roi || '0') / totalCalls) * 100).toFixed(1) : '0',
      },
      dailyTrend,
      statusBreakdown,
      stageDistribution,
      handoffReasons,
      durationBuckets,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[analytics/voice] error:', error);
    return NextResponse.json({ error: 'Failed to load voice analytics' }, { status: 500 });
  }
}

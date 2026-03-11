import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const periodToDays: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/**
 * GET /api/analytics?period=7d|30d|90d
 * Funnel rates, channel effectiveness, sequence performance, time series.
 */
export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') || '30d';
    const days = periodToDays[period] || 30;

    // Lifecycle funnel (always shows all contacts regardless of period)
    const funnel = await query<{ stage: string; count: string }>(
      `SELECT lifecycle_stage AS stage, COUNT(*) AS count
       FROM crm.contacts
       GROUP BY lifecycle_stage
       ORDER BY CASE lifecycle_stage
         WHEN 'raw' THEN 1 WHEN 'enriched' THEN 2 WHEN 'outreach' THEN 3
         WHEN 'engaged' THEN 4 WHEN 'demo_completed' THEN 5
         WHEN 'negotiation' THEN 6 WHEN 'won' THEN 7 WHEN 'lost' THEN 8
         WHEN 'nurture' THEN 9 ELSE 10 END`
    );

    // Channel performance (scoped to period)
    const channels = await query<{ channel: string; total: string; replied: string; booked: string }>(
      `SELECT channel,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE event_type = 'replied') AS replied,
              COUNT(*) FILTER (WHERE event_type = 'booked') AS booked
       FROM crm.touchpoints
       WHERE occurred_at >= NOW() - INTERVAL '1 day' * $1
       GROUP BY channel
       ORDER BY total DESC`,
      [days]
    );

    // Sequence performance
    const sequences = await query<{ name: string; enrolled: string; completed: string; replied: string }>(
      `SELECT s.name,
              COUNT(DISTINCT e.enrollment_id) AS enrolled,
              COUNT(DISTINCT e.enrollment_id) FILTER (WHERE e.status = 'completed') AS completed,
              COUNT(DISTINCT e.enrollment_id) FILTER (WHERE e.status = 'replied') AS replied
       FROM crm.sequences s
       LEFT JOIN crm.sequence_enrollments e ON e.sequence_id = s.sequence_id
       GROUP BY s.sequence_id, s.name
       ORDER BY enrolled DESC`
    );

    // Daily touchpoints trend (scoped to period)
    const trend = await query<{ day: string; count: string }>(
      `SELECT DATE(occurred_at) AS day, COUNT(*) AS count
       FROM crm.touchpoints
       WHERE occurred_at >= NOW() - INTERVAL '1 day' * $1
       GROUP BY DATE(occurred_at)
       ORDER BY day ASC`,
      [days]
    );

    // BDR stats
    const bdrFunnel = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count FROM bdr.leads GROUP BY status`
    );

    return NextResponse.json({ funnel, channels, sequences, trend, bdrFunnel });
  } catch (error) {
    console.error('[analytics] error:', error);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}

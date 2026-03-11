import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/bdr/send-times
 *
 * Analyzes historical email send data to determine optimal send times.
 * Returns:
 * - Hourly open/reply rates (0-23)
 * - Day-of-week open/reply rates (0=Sun, 6=Sat)
 * - Heatmap data (hour × day-of-week)
 * - Recommended optimal windows
 * - Per-tier breakdown if sufficient data
 */
export async function GET() {
  try {
    // ─── Hourly performance ─────────────────────────────────────────────
    const hourlyData = await query<{
      hour: number;
      sent: number;
      opened: number;
      clicked: number;
      replied: number;
      open_rate: number;
      reply_rate: number;
    }>(`
      SELECT
        EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')::int as hour,
        COUNT(*)::int as sent,
        COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::int as opened,
        COUNT(CASE WHEN es.click_count > 0 THEN 1 END)::int as clicked,
        COUNT(CASE WHEN es.replied THEN 1 END)::int as replied,
        ROUND(COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::float as open_rate,
        ROUND(COUNT(CASE WHEN es.replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::float as reply_rate
      FROM bdr.email_sends es
      WHERE es.sent_at >= NOW() - INTERVAL '90 days'
        AND es.sent_at IS NOT NULL
      GROUP BY EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')
      ORDER BY hour
    `);

    // ─── Day-of-week performance ────────────────────────────────────────
    const dowData = await query<{
      dow: number;
      day_name: string;
      sent: number;
      opened: number;
      clicked: number;
      replied: number;
      open_rate: number;
      reply_rate: number;
    }>(`
      SELECT
        EXTRACT(DOW FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')::int as dow,
        TO_CHAR(es.sent_at AT TIME ZONE 'America/Los_Angeles', 'Day') as day_name,
        COUNT(*)::int as sent,
        COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::int as opened,
        COUNT(CASE WHEN es.click_count > 0 THEN 1 END)::int as clicked,
        COUNT(CASE WHEN es.replied THEN 1 END)::int as replied,
        ROUND(COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::float as open_rate,
        ROUND(COUNT(CASE WHEN es.replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::float as reply_rate
      FROM bdr.email_sends es
      WHERE es.sent_at >= NOW() - INTERVAL '90 days'
        AND es.sent_at IS NOT NULL
      GROUP BY EXTRACT(DOW FROM es.sent_at AT TIME ZONE 'America/Los_Angeles'),
               TO_CHAR(es.sent_at AT TIME ZONE 'America/Los_Angeles', 'Day')
      ORDER BY dow
    `);

    // ─── Heatmap: hour × day-of-week ───────────────────────────────────
    const heatmapData = await query<{
      dow: number;
      hour: number;
      sent: number;
      opened: number;
      open_rate: number;
    }>(`
      SELECT
        EXTRACT(DOW FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')::int as dow,
        EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')::int as hour,
        COUNT(*)::int as sent,
        COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::int as opened,
        ROUND(COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::float as open_rate
      FROM bdr.email_sends es
      WHERE es.sent_at >= NOW() - INTERVAL '90 days'
        AND es.sent_at IS NOT NULL
      GROUP BY EXTRACT(DOW FROM es.sent_at AT TIME ZONE 'America/Los_Angeles'),
               EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')
      HAVING COUNT(*) >= 3
      ORDER BY dow, hour
    `);

    // ─── Per-tier breakdown ─────────────────────────────────────────────
    const tierHourly = await query<{
      tier: string;
      hour: number;
      sent: number;
      opened: number;
      open_rate: number;
      reply_rate: number;
    }>(`
      SELECT
        l.tier,
        EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')::int as hour,
        COUNT(*)::int as sent,
        COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::int as opened,
        ROUND(COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::float as open_rate,
        ROUND(COUNT(CASE WHEN es.replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::float as reply_rate
      FROM bdr.email_sends es
      JOIN bdr.leads l ON l.lead_id = es.lead_id
      WHERE es.sent_at >= NOW() - INTERVAL '90 days'
        AND es.sent_at IS NOT NULL
        AND l.tier IS NOT NULL
      GROUP BY l.tier, EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')
      HAVING COUNT(*) >= 3
      ORDER BY l.tier, hour
    `);

    // ─── Open time analysis (when opens happen, not sends) ──────────────
    const openTimeData = await query<{
      hour: number;
      total_opens: number;
    }>(`
      SELECT
        EXTRACT(HOUR FROM ee.event_at AT TIME ZONE 'America/Los_Angeles')::int as hour,
        COUNT(*)::int as total_opens
      FROM bdr.email_events ee
      WHERE ee.event_type = 'open'
        AND ee.event_at >= NOW() - INTERVAL '90 days'
      GROUP BY EXTRACT(HOUR FROM ee.event_at AT TIME ZONE 'America/Los_Angeles')
      ORDER BY hour
    `);

    // ─── Calculate optimal windows ──────────────────────────────────────
    const optimalWindows = calculateOptimalWindows(hourlyData, dowData);

    // ─── Total stats ────────────────────────────────────────────────────
    const [totals] = await query<{ total_sent: number; total_days: number }>(`
      SELECT COUNT(*)::int as total_sent,
             GREATEST(EXTRACT(DAYS FROM (MAX(sent_at) - MIN(sent_at))), 1)::int as total_days
      FROM bdr.email_sends
      WHERE sent_at >= NOW() - INTERVAL '90 days'
        AND sent_at IS NOT NULL
    `);

    return NextResponse.json({
      hourly: hourlyData,
      day_of_week: dowData,
      heatmap: heatmapData,
      tier_hourly: tierHourly,
      open_times: openTimeData,
      optimal_windows: optimalWindows,
      total_analyzed: totals?.total_sent || 0,
      analysis_days: totals?.total_days || 0,
      timezone: 'America/Los_Angeles',
    });
  } catch (error) {
    console.error('[send-times] error:', error);
    return NextResponse.json({ error: 'Failed to analyze send times' }, { status: 500 });
  }
}

/**
 * Calculate optimal send windows from hourly and daily data.
 * Returns ranked time windows with confidence scores.
 */
function calculateOptimalWindows(
  hourlyData: Array<{ hour: number; sent: number; open_rate: number; reply_rate: number }>,
  dowData: Array<{ dow: number; day_name: string; sent: number; open_rate: number; reply_rate: number }>
): Array<{
  window_start: string;
  window_end: string;
  best_days: string[];
  avg_open_rate: number;
  avg_reply_rate: number;
  confidence: 'high' | 'medium' | 'low';
  sample_size: number;
}> {
  if (hourlyData.length === 0) return [];

  // Score each hour: weighted combo of open rate (70%) and reply rate (30%)
  const scored = hourlyData
    .filter(h => h.sent >= 5) // Minimum sample size
    .map(h => ({
      hour: h.hour,
      score: (h.open_rate || 0) * 0.7 + (h.reply_rate || 0) * 0.3,
      open_rate: h.open_rate || 0,
      reply_rate: h.reply_rate || 0,
      sent: h.sent,
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];

  // Group consecutive hours into windows
  const windows: Array<{
    hours: number[];
    total_score: number;
    total_open: number;
    total_reply: number;
    total_sent: number;
  }> = [];

  const taken = new Set<number>();
  for (const h of scored) {
    if (taken.has(h.hour)) continue;

    // Grow window around this high-scoring hour
    const windowHours = [h.hour];
    taken.add(h.hour);

    // Try to include adjacent hours if they're also good
    for (const adj of [h.hour - 1, h.hour + 1]) {
      const adjNorm = ((adj % 24) + 24) % 24;
      if (!taken.has(adjNorm)) {
        const adjData = scored.find(s => s.hour === adjNorm);
        if (adjData && adjData.score >= scored[0].score * 0.6) {
          windowHours.push(adjNorm);
          taken.add(adjNorm);
        }
      }
    }

    const windowData = scored.filter(s => windowHours.includes(s.hour));
    windows.push({
      hours: windowHours.sort((a, b) => a - b),
      total_score: windowData.reduce((sum, w) => sum + w.score, 0) / windowData.length,
      total_open: windowData.reduce((sum, w) => sum + w.open_rate, 0) / windowData.length,
      total_reply: windowData.reduce((sum, w) => sum + w.reply_rate, 0) / windowData.length,
      total_sent: windowData.reduce((sum, w) => sum + w.sent, 0),
    });

    if (windows.length >= 3) break;
  }

  // Best days of week
  const bestDays = dowData
    .filter(d => d.sent >= 5 && d.dow >= 1 && d.dow <= 5) // Weekdays with enough data
    .sort((a, b) => {
      const scoreA = (a.open_rate || 0) * 0.7 + (a.reply_rate || 0) * 0.3;
      const scoreB = (b.open_rate || 0) * 0.7 + (b.reply_rate || 0) * 0.3;
      return scoreB - scoreA;
    })
    .slice(0, 3)
    .map(d => d.day_name.trim());

  return windows.map(w => ({
    window_start: `${String(Math.min(...w.hours)).padStart(2, '0')}:00`,
    window_end: `${String(Math.max(...w.hours) + 1).padStart(2, '0')}:00`,
    best_days: bestDays,
    avg_open_rate: Math.round(w.total_open * 10) / 10,
    avg_reply_rate: Math.round(w.total_reply * 10) / 10,
    confidence: w.total_sent >= 50 ? 'high' : w.total_sent >= 20 ? 'medium' : 'low',
    sample_size: w.total_sent,
  }));
}

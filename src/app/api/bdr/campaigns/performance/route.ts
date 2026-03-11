import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/bdr/campaigns/performance
 * Campaign performance dashboard — time-series metrics, angle comparison,
 * best-performing variants, tier breakdown, and A/B test results.
 *
 * Query params: ?days=30 (default 30)
 */
export async function GET(request: NextRequest) {
  try {
    const days = parseInt(request.nextUrl.searchParams.get('days') || '30');

    // 1. Daily send/open/reply/click time series
    const timeSeries = await query<{
      date: string;
      sent: string;
      opened: string;
      clicked: string;
      replied: string;
    }>(`
      SELECT
        DATE(sent_at)::text as date,
        COUNT(*)::text as sent,
        COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opened,
        COUNT(CASE WHEN click_count > 0 THEN 1 END)::text as clicked,
        COUNT(CASE WHEN replied THEN 1 END)::text as replied
      FROM bdr.email_sends
      WHERE sent_at >= NOW() - INTERVAL '1 day' * $1
        AND sent_at IS NOT NULL
      GROUP BY DATE(sent_at)
      ORDER BY date ASC
    `, [days]);

    // 2. Angle performance comparison
    const anglePerf = await query<{
      angle: string;
      sent: string;
      opened: string;
      clicked: string;
      replied: string;
      open_rate: string;
      click_rate: string;
      reply_rate: string;
      avg_opens: string;
    }>(`
      SELECT
        COALESCE(angle, 'unknown') as angle,
        COUNT(*)::text as sent,
        COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opened,
        COUNT(CASE WHEN click_count > 0 THEN 1 END)::text as clicked,
        COUNT(CASE WHEN replied THEN 1 END)::text as replied,
        ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as open_rate,
        ROUND(COUNT(CASE WHEN click_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as click_rate,
        ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as reply_rate,
        ROUND(AVG(open_count)::numeric, 1)::text as avg_opens
      FROM bdr.email_sends
      WHERE sent_at >= NOW() - INTERVAL '1 day' * $1
        AND sent_at IS NOT NULL
      GROUP BY angle
      ORDER BY reply_rate DESC
    `, [days]);

    // 3. Tier performance breakdown
    const tierPerf = await query<{
      tier: string;
      sent: string;
      opened: string;
      replied: string;
      open_rate: string;
      reply_rate: string;
    }>(`
      SELECT
        COALESCE(l.tier, 'unknown') as tier,
        COUNT(es.id)::text as sent,
        COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::text as opened,
        COUNT(CASE WHEN es.replied THEN 1 END)::text as replied,
        ROUND(COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(es.id), 0) * 100, 1)::text as open_rate,
        ROUND(COUNT(CASE WHEN es.replied THEN 1 END)::numeric / NULLIF(COUNT(es.id), 0) * 100, 1)::text as reply_rate
      FROM bdr.email_sends es
      JOIN bdr.leads l ON l.lead_id = es.lead_id
      WHERE es.sent_at >= NOW() - INTERVAL '1 day' * $1
        AND es.sent_at IS NOT NULL
      GROUP BY l.tier
      ORDER BY tier
    `, [days]);

    // 4. Reply sentiment distribution
    const sentimentDist = await query<{ sentiment: string; count: string }>(`
      SELECT
        COALESCE(reply_sentiment, 'unknown') as sentiment,
        COUNT(*)::text as count
      FROM bdr.email_sends
      WHERE replied = true
        AND sent_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY reply_sentiment
      ORDER BY count DESC
    `, [days]);

    // 5. Best hour to send (by open rate)
    const bestHours = await query<{
      hour: string;
      sent: string;
      open_rate: string;
      reply_rate: string;
    }>(`
      SELECT
        EXTRACT(HOUR FROM sent_at AT TIME ZONE 'America/Los_Angeles')::text as hour,
        COUNT(*)::text as sent,
        ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as open_rate,
        ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as reply_rate
      FROM bdr.email_sends
      WHERE sent_at >= NOW() - INTERVAL '1 day' * $1
        AND sent_at IS NOT NULL
      GROUP BY EXTRACT(HOUR FROM sent_at AT TIME ZONE 'America/Los_Angeles')
      HAVING COUNT(*) >= 3
      ORDER BY open_rate DESC
    `, [days]);

    // 6. Overall summary
    const summary = await query<Record<string, string>>(`
      SELECT
        COUNT(*)::text as total_sent,
        COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as total_opened,
        COUNT(CASE WHEN click_count > 0 THEN 1 END)::text as total_clicked,
        COUNT(CASE WHEN replied THEN 1 END)::text as total_replied,
        ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as open_rate,
        ROUND(COUNT(CASE WHEN click_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as click_rate,
        ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as reply_rate
      FROM bdr.email_sends
      WHERE sent_at >= NOW() - INTERVAL '1 day' * $1
        AND sent_at IS NOT NULL
    `, [days]);

    // 7. A/B test results (if any)
    const abResults = await query<{
      ab_test_id: string;
      variant_id: string;
      angle: string;
      sent: string;
      opened: string;
      clicked: string;
      replied: string;
      open_rate: string;
      reply_rate: string;
    }>(`
      SELECT
        ab_test_id::text,
        variant_id,
        angle,
        COUNT(*)::text as sent,
        COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opened,
        COUNT(CASE WHEN click_count > 0 THEN 1 END)::text as clicked,
        COUNT(CASE WHEN replied THEN 1 END)::text as replied,
        ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as open_rate,
        ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as reply_rate
      FROM bdr.email_sends
      WHERE ab_test_id IS NOT NULL
        AND sent_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY ab_test_id, variant_id, angle
      ORDER BY ab_test_id, reply_rate DESC
    `, [days]);

    return NextResponse.json({
      days,
      summary: summary[0] || {},
      timeSeries: timeSeries.map(r => ({
        date: r.date,
        sent: parseInt(r.sent),
        opened: parseInt(r.opened),
        clicked: parseInt(r.clicked),
        replied: parseInt(r.replied),
      })),
      anglePerf: anglePerf.map(r => ({
        angle: r.angle,
        sent: parseInt(r.sent),
        opened: parseInt(r.opened),
        clicked: parseInt(r.clicked),
        replied: parseInt(r.replied),
        openRate: parseFloat(r.open_rate),
        clickRate: parseFloat(r.click_rate),
        replyRate: parseFloat(r.reply_rate),
        avgOpens: parseFloat(r.avg_opens),
      })),
      tierPerf: tierPerf.map(r => ({
        tier: r.tier,
        sent: parseInt(r.sent),
        opened: parseInt(r.opened),
        replied: parseInt(r.replied),
        openRate: parseFloat(r.open_rate),
        replyRate: parseFloat(r.reply_rate),
      })),
      sentimentDist: sentimentDist.map(r => ({ sentiment: r.sentiment, count: parseInt(r.count) })),
      bestHours: bestHours.map(r => ({
        hour: parseInt(r.hour),
        sent: parseInt(r.sent),
        openRate: parseFloat(r.open_rate),
        replyRate: parseFloat(r.reply_rate),
      })),
      abResults,
    });
  } catch (error) {
    console.error('[campaign-performance] error:', error);
    return NextResponse.json({ error: 'Failed to fetch performance data' }, { status: 500 });
  }
}

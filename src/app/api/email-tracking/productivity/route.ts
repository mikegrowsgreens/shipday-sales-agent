import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';

/**
 * GET /api/email-tracking/productivity?period=30d
 * Returns email productivity metrics: KPIs, heatmaps, top emails, daily trend.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const params = req.nextUrl.searchParams;
    const period = params.get('period') || '30d';

    // Calculate date range
    let daysBack = 30;
    if (period === '7d') daysBack = 7;
    else if (period === '90d') daysBack = 90;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const sinceISO = sinceDate.toISOString();

    // Run all queries in parallel
    const [kpiResult, sendHeatmap, openHeatmap, topEmails, dailyTrend] = await Promise.all([
      // 1. KPI aggregates
      query<{
        emails_sent: string;
        unique_recipients: string;
        total_opens: string;
        total_clicks: string;
        total_replies: string;
        emails_with_opens: string;
        emails_with_clicks: string;
      }>(
        `SELECT
           COUNT(*)::text AS emails_sent,
           COUNT(DISTINCT to_email)::text AS unique_recipients,
           COALESCE(SUM(open_count), 0)::text AS total_opens,
           COALESCE(SUM(click_count), 0)::text AS total_clicks,
           COUNT(*) FILTER (WHERE replied = true)::text AS total_replies,
           COUNT(*) FILTER (WHERE open_count > 0)::text AS emails_with_opens,
           COUNT(*) FILTER (WHERE click_count > 0)::text AS emails_with_clicks
         FROM bdr.email_sends
         WHERE org_id = $1 AND sent_at >= $2`,
        [orgId, sinceISO]
      ),

      // 2. Send heatmap (day-of-week x hour-of-day)
      query<{ dow: string; hour: string; count: string }>(
        `SELECT
           EXTRACT(DOW FROM sent_at)::text AS dow,
           EXTRACT(HOUR FROM sent_at)::text AS hour,
           COUNT(*)::text AS count
         FROM bdr.email_sends
         WHERE org_id = $1 AND sent_at >= $2
         GROUP BY 1, 2
         ORDER BY 1, 2`,
        [orgId, sinceISO]
      ),

      // 3. Open heatmap (day-of-week x hour-of-day from events)
      query<{ dow: string; hour: string; count: string }>(
        `SELECT
           EXTRACT(DOW FROM event_at)::text AS dow,
           EXTRACT(HOUR FROM event_at)::text AS hour,
           COUNT(*)::text AS count
         FROM bdr.email_events
         WHERE org_id = $1 AND event_type = 'open' AND event_at >= $2
         GROUP BY 1, 2
         ORDER BY 1, 2`,
        [orgId, sinceISO]
      ),

      // 4. Top performing emails by engagement
      query<{
        id: string;
        subject: string;
        to_email: string;
        open_count: number;
        click_count: number;
        replied: boolean;
        sent_at: string;
        contact_name: string | null;
      }>(
        `SELECT
           es.id,
           es.subject,
           es.to_email,
           es.open_count,
           es.click_count,
           es.replied,
           es.sent_at,
           TRIM(CONCAT(c.first_name, ' ', c.last_name)) AS contact_name
         FROM bdr.email_sends es
         LEFT JOIN crm.contacts c ON c.email = es.to_email AND c.org_id = es.org_id
         WHERE es.org_id = $1 AND es.sent_at >= $2
         ORDER BY (es.open_count + es.click_count) DESC, es.sent_at DESC
         LIMIT 5`,
        [orgId, sinceISO]
      ),

      // 5. Daily trend (sent, opened, clicked counts per day)
      query<{ day: string; sent: string; opened: string; clicked: string }>(
        `WITH days AS (
           SELECT generate_series(
             ($2::timestamp)::date,
             CURRENT_DATE,
             '1 day'::interval
           )::date AS day
         ),
         daily_sends AS (
           SELECT sent_at::date AS day, COUNT(*) AS cnt
           FROM bdr.email_sends
           WHERE org_id = $1 AND sent_at >= $2
           GROUP BY 1
         ),
         daily_opens AS (
           SELECT event_at::date AS day, COUNT(*) AS cnt
           FROM bdr.email_events
           WHERE org_id = $1 AND event_type = 'open' AND event_at >= $2
           GROUP BY 1
         ),
         daily_clicks AS (
           SELECT event_at::date AS day, COUNT(*) AS cnt
           FROM bdr.email_events
           WHERE org_id = $1 AND event_type = 'click' AND event_at >= $2
           GROUP BY 1
         )
         SELECT
           d.day::text,
           COALESCE(ds.cnt, 0)::text AS sent,
           COALESCE(do2.cnt, 0)::text AS opened,
           COALESCE(dc.cnt, 0)::text AS clicked
         FROM days d
         LEFT JOIN daily_sends ds ON ds.day = d.day
         LEFT JOIN daily_opens do2 ON do2.day = d.day
         LEFT JOIN daily_clicks dc ON dc.day = d.day
         ORDER BY d.day`,
        [orgId, sinceISO]
      ),
    ]);

    // Process KPIs
    const kpi = kpiResult[0];
    const emailsSent = parseInt(kpi?.emails_sent || '0');
    const emailsWithOpens = parseInt(kpi?.emails_with_opens || '0');
    const emailsWithClicks = parseInt(kpi?.emails_with_clicks || '0');
    const totalReplies = parseInt(kpi?.total_replies || '0');

    const kpis = {
      emailsSent,
      uniqueRecipients: parseInt(kpi?.unique_recipients || '0'),
      totalOpens: parseInt(kpi?.total_opens || '0'),
      totalClicks: parseInt(kpi?.total_clicks || '0'),
      totalReplies,
      openRate: emailsSent > 0 ? ((emailsWithOpens / emailsSent) * 100).toFixed(1) : '0',
      clickRate: emailsSent > 0 ? ((emailsWithClicks / emailsSent) * 100).toFixed(1) : '0',
      replyRate: emailsSent > 0 ? ((totalReplies / emailsSent) * 100).toFixed(1) : '0',
      avgOpensPerEmail: emailsSent > 0
        ? (parseInt(kpi?.total_opens || '0') / emailsSent).toFixed(1)
        : '0',
    };

    // Build heatmap grids (7 days x 24 hours)
    const buildHeatmapGrid = (rows: { dow: string; hour: string; count: string }[]) => {
      const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      for (const row of rows) {
        const dow = parseInt(row.dow);
        const hour = parseInt(row.hour);
        grid[dow][hour] = parseInt(row.count);
      }
      return grid;
    };

    return NextResponse.json({
      kpis,
      sendHeatmap: buildHeatmapGrid(sendHeatmap),
      openHeatmap: buildHeatmapGrid(openHeatmap),
      topEmails,
      dailyTrend,
      period,
    });
  } catch (error) {
    console.error('[email-tracking/productivity] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load productivity data' },
      { status: 500 }
    );
  }
});

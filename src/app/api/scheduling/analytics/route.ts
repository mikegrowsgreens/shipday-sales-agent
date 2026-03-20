/**
 * GET /api/scheduling/analytics — Scheduling metrics and analytics data.
 *
 * Query params:
 *   days: Number of days to look back (default 30, max 365)
 *
 * Returns:
 *   - KPI stats (total bookings, cancellation rate, no-show rate, avg lead time)
 *   - Bookings by event type
 *   - Bookings by day (trend)
 *   - Popular days/times heatmap
 */

import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';

export const GET = withAuth(async (request, { orgId }) => {
  try {
    const url = new URL(request.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30'), 1), 365);

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();

    // Run all queries in parallel
    const [
      totalsRow,
      byEventType,
      byDay,
      heatmapData,
      webhookStats,
    ] = await Promise.all([
      // KPI totals
      queryOne<{
        total: string;
        cancelled: string;
        completed: string;
        no_show: string;
        avg_lead_hours: string;
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status = 'no_show') AS no_show,
           COALESCE(AVG(EXTRACT(EPOCH FROM (starts_at - created_at)) / 3600)
             FILTER (WHERE status != 'cancelled'), 0) AS avg_lead_hours
         FROM crm.scheduling_bookings
         WHERE org_id = $1 AND created_at >= $2::timestamptz`,
        [orgId, sinceStr],
      ),

      // Bookings by event type
      query<{ event_type_name: string; count: string; color: string }>(
        `SELECT et.name AS event_type_name, et.color, COUNT(b.booking_id)::text AS count
         FROM crm.scheduling_bookings b
         JOIN crm.scheduling_event_types et ON b.event_type_id = et.event_type_id
         WHERE b.org_id = $1 AND b.created_at >= $2::timestamptz
         GROUP BY et.name, et.color
         ORDER BY count DESC`,
        [orgId, sinceStr],
      ),

      // Bookings by day (trend chart)
      query<{ date: string; count: string }>(
        `SELECT DATE(created_at) AS date, COUNT(*)::text AS count
         FROM crm.scheduling_bookings
         WHERE org_id = $1 AND created_at >= $2::timestamptz AND status != 'cancelled'
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [orgId, sinceStr],
      ),

      // Popular times heatmap (day of week x hour)
      query<{ dow: string; hour: string; count: string }>(
        `SELECT
           EXTRACT(DOW FROM starts_at)::int AS dow,
           EXTRACT(HOUR FROM starts_at)::int AS hour,
           COUNT(*)::text AS count
         FROM crm.scheduling_bookings
         WHERE org_id = $1 AND created_at >= $2::timestamptz AND status != 'cancelled'
         GROUP BY dow, hour
         ORDER BY dow, hour`,
        [orgId, sinceStr],
      ),

      // Webhook delivery stats
      queryOne<{ total: string; successful: string; failed: string }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE success = true) AS successful,
           COUNT(*) FILTER (WHERE success = false) AS failed
         FROM crm.scheduling_webhook_log
         WHERE org_id = $1 AND attempted_at >= $2::timestamptz`,
        [orgId, sinceStr],
      ),
    ]);

    const total = parseInt(totalsRow?.total || '0');
    const cancelled = parseInt(totalsRow?.cancelled || '0');
    const completed = parseInt(totalsRow?.completed || '0');
    const noShow = parseInt(totalsRow?.no_show || '0');
    const avgLeadHours = parseFloat(totalsRow?.avg_lead_hours || '0');

    return NextResponse.json({
      kpis: {
        total_bookings: total,
        cancellation_rate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
        no_show_rate: total > 0 ? Math.round((noShow / total) * 100) : 0,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        avg_lead_time_hours: Math.round(avgLeadHours * 10) / 10,
      },
      by_event_type: byEventType.map(r => ({
        name: r.event_type_name,
        count: parseInt(r.count),
        color: r.color,
      })),
      daily_trend: byDay.map(r => ({
        date: r.date,
        count: parseInt(r.count),
      })),
      heatmap: heatmapData.map(r => ({
        day: parseInt(r.dow),
        hour: parseInt(r.hour),
        count: parseInt(r.count),
      })),
      webhook_stats: {
        total: parseInt(webhookStats?.total || '0'),
        successful: parseInt(webhookStats?.successful || '0'),
        failed: parseInt(webhookStats?.failed || '0'),
      },
      period_days: days,
    });
  } catch (error) {
    console.error('[scheduling/analytics] GET error:', error);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
});

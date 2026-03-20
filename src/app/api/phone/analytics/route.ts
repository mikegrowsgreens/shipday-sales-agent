import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgPlan, requireFeature } from '@/lib/feature-gate';

/**
 * GET /api/phone/analytics - Call analytics: volume trends, connect rates, avg duration, best times
 * Query params: days (default 30)
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();

    const plan = await getOrgPlan(tenant.org_id);
    requireFeature(plan, 'phoneDialer');

    const days = parseInt(request.nextUrl.searchParams.get('days') || '30');

    // 1. Summary stats
    const summary = await query<{
      total_calls: number;
      connected: number;
      voicemails: number;
      no_answers: number;
      meetings_booked: number;
      avg_duration: number;
      total_duration: number;
    }>(`
      SELECT
        COUNT(*)::int as total_calls,
        COUNT(CASE WHEN disposition = 'connected' THEN 1 END)::int as connected,
        COUNT(CASE WHEN disposition = 'voicemail' THEN 1 END)::int as voicemails,
        COUNT(CASE WHEN disposition = 'no-answer' THEN 1 END)::int as no_answers,
        COUNT(CASE WHEN disposition = 'meeting-booked' THEN 1 END)::int as meetings_booked,
        COALESCE(ROUND(AVG(CASE WHEN duration_secs > 0 THEN duration_secs END)), 0)::int as avg_duration,
        COALESCE(SUM(duration_secs), 0)::int as total_duration
      FROM crm.phone_calls
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
    `, [days]);

    // 2. Daily volume trend
    const volumeTrend = await query<{
      date: string;
      calls: number;
      connected: number;
    }>(`
      SELECT
        DATE(created_at)::text as date,
        COUNT(*)::int as calls,
        COUNT(CASE WHEN disposition = 'connected' THEN 1 END)::int as connected
      FROM crm.phone_calls
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [days]);

    // 3. Disposition breakdown
    const dispositionBreakdown = await query<{
      disposition: string;
      count: number;
    }>(`
      SELECT
        COALESCE(disposition, 'unknown') as disposition,
        COUNT(*)::int as count
      FROM crm.phone_calls
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY disposition
      ORDER BY count DESC
    `, [days]);

    // 4. Best calling times (hour of day analysis)
    const hourlyAnalysis = await query<{
      hour: number;
      total: number;
      connected: number;
      connect_rate: number;
    }>(`
      SELECT
        EXTRACT(HOUR FROM created_at)::int as hour,
        COUNT(*)::int as total,
        COUNT(CASE WHEN disposition = 'connected' THEN 1 END)::int as connected,
        ROUND(100.0 * COUNT(CASE WHEN disposition = 'connected' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as connect_rate
      FROM crm.phone_calls
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `, [days]);

    // 5. Day of week analysis
    const dayOfWeekAnalysis = await query<{
      dow: number;
      day_name: string;
      total: number;
      connected: number;
      connect_rate: number;
    }>(`
      SELECT
        EXTRACT(DOW FROM created_at)::int as dow,
        TO_CHAR(created_at, 'Day') as day_name,
        COUNT(*)::int as total,
        COUNT(CASE WHEN disposition = 'connected' THEN 1 END)::int as connected,
        ROUND(100.0 * COUNT(CASE WHEN disposition = 'connected' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as connect_rate
      FROM crm.phone_calls
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY EXTRACT(DOW FROM created_at), TO_CHAR(created_at, 'Day')
      ORDER BY dow
    `, [days]);

    // 6. Top callers (by contact - who gets called most)
    const topContacts = await query<{
      contact_id: number;
      first_name: string | null;
      business_name: string | null;
      call_count: number;
      connected_count: number;
      total_duration: number;
    }>(`
      SELECT
        pc.contact_id,
        c.first_name,
        c.business_name,
        COUNT(*)::int as call_count,
        COUNT(CASE WHEN pc.disposition = 'connected' THEN 1 END)::int as connected_count,
        COALESCE(SUM(pc.duration_secs), 0)::int as total_duration
      FROM crm.phone_calls pc
      JOIN crm.contacts c ON c.contact_id = pc.contact_id
      WHERE pc.created_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY pc.contact_id, c.first_name, c.business_name
      ORDER BY call_count DESC
      LIMIT 10
    `, [days]);

    const stats = summary[0] || {
      total_calls: 0, connected: 0, voicemails: 0,
      no_answers: 0, meetings_booked: 0, avg_duration: 0, total_duration: 0,
    };

    const connectRate = stats.total_calls > 0
      ? Math.round(100 * stats.connected / stats.total_calls)
      : 0;

    // Find best hour and day
    const bestHour = hourlyAnalysis.length > 0
      ? hourlyAnalysis.reduce((best, h) => h.connect_rate > best.connect_rate ? h : best)
      : null;
    const bestDay = dayOfWeekAnalysis.length > 0
      ? dayOfWeekAnalysis.reduce((best, d) => d.connect_rate > best.connect_rate ? d : best)
      : null;

    return NextResponse.json({
      summary: { ...stats, connect_rate: connectRate },
      volume_trend: volumeTrend,
      disposition_breakdown: dispositionBreakdown,
      hourly_analysis: hourlyAnalysis,
      day_of_week: dayOfWeekAnalysis,
      top_contacts: topContacts,
      best_calling_time: bestHour ? `${bestHour.hour}:00 (${bestHour.connect_rate}% connect rate)` : 'Not enough data',
      best_calling_day: bestDay ? `${bestDay.day_name.trim()} (${bestDay.connect_rate}% connect rate)` : 'Not enough data',
      days,
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[phone/analytics] error:', error);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}

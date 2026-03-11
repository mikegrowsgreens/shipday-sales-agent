import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/linkedin/activity
 * LinkedIn activity log — recent actions, connection statuses, message history.
 *
 * ?days=30 — lookback period
 * ?action_type=connect|message|view
 * ?limit=50
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get('days') || '30'), 90);
    const actionType = searchParams.get('action_type') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    let sql = `SELECT la.*,
                 c.first_name, c.last_name, c.email, c.business_name, c.linkedin_url
               FROM crm.linkedin_activity la
               JOIN crm.contacts c ON c.contact_id = la.contact_id
               WHERE la.executed_at > NOW() - INTERVAL '1 day' * $1`;
    const params: unknown[] = [days];
    let pi = 2;

    if (actionType) {
      sql += ` AND la.action_type = $${pi}`;
      params.push(actionType);
      pi++;
    }

    sql += ` ORDER BY la.executed_at DESC LIMIT $${pi}`;
    params.push(limit);

    const activities = await query(sql, params);

    // Summary stats
    const stats = await query<{
      action_type: string;
      total: string;
      pending: string;
      sent: string;
      accepted: string;
      failed: string;
    }>(
      `SELECT action_type,
         COUNT(*)::text as total,
         COUNT(*) FILTER (WHERE status = 'pending')::text as pending,
         COUNT(*) FILTER (WHERE status = 'sent')::text as sent,
         COUNT(*) FILTER (WHERE status = 'accepted')::text as accepted,
         COUNT(*) FILTER (WHERE status = 'failed')::text as failed
       FROM crm.linkedin_activity
       WHERE executed_at > NOW() - INTERVAL '1 day' * $1
       GROUP BY action_type`,
      [days]
    );

    return NextResponse.json({
      activities,
      stats: stats.map(s => ({
        action_type: s.action_type,
        total: parseInt(s.total),
        pending: parseInt(s.pending),
        sent: parseInt(s.sent),
        accepted: parseInt(s.accepted),
        failed: parseInt(s.failed),
      })),
      days,
    });
  } catch (error) {
    console.error('[linkedin/activity] error:', error);
    return NextResponse.json({ error: 'Failed to load LinkedIn activity' }, { status: 500 });
  }
}

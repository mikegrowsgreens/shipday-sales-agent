/**
 * GET /api/scheduling/webhooks — List webhook delivery log.
 *
 * Query params: limit (default 50), offset, event_name, success (true/false)
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';

export const GET = withAuth(async (request, { orgId }) => {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const eventName = url.searchParams.get('event_name');
    const successFilter = url.searchParams.get('success');

    const conditions = ['org_id = $1'];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (eventName) {
      conditions.push(`event_name = $${idx++}`);
      params.push(eventName);
    }

    if (successFilter !== null && successFilter !== '') {
      conditions.push(`success = $${idx++}`);
      params.push(successFilter === 'true');
    }

    const where = conditions.join(' AND ');

    const [logs, countRow] = await Promise.all([
      query(
        `SELECT log_id, booking_id, event_name, webhook_url, response_status, success, attempted_at
         FROM crm.scheduling_webhook_log
         WHERE ${where}
         ORDER BY attempted_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM crm.scheduling_webhook_log WHERE ${where}`,
        params,
      ),
    ]);

    return NextResponse.json({
      logs,
      total: parseInt(countRow?.count || '0'),
      limit,
      offset,
    });
  } catch (error) {
    console.error('[scheduling/webhooks] GET error:', error);
    return NextResponse.json({ error: 'Failed to load webhook logs' }, { status: 500 });
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ActivityFeedItem } from '@/lib/types';

// GET /api/activity - Real-time activity feed across all contacts
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = parseInt(searchParams.get('limit') || '50');
  const after = searchParams.get('after'); // ISO timestamp for polling
  const channel = searchParams.get('channel');

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (after) {
    conditions.push(`t.occurred_at > $${idx++}`);
    params.push(after);
  }

  if (channel && channel !== 'all') {
    conditions.push(`t.channel = $${idx++}`);
    params.push(channel);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const items = await query<ActivityFeedItem>(
    `SELECT t.touchpoint_id, t.contact_id, t.channel, t.event_type,
            t.direction, t.subject, t.body_preview, t.occurred_at,
            COALESCE(c.first_name || ' ' || c.last_name, c.email, 'Unknown') as contact_name,
            c.business_name
     FROM crm.touchpoints t
     LEFT JOIN crm.contacts c ON c.contact_id = t.contact_id
     ${where}
     ORDER BY t.occurred_at DESC
     LIMIT $${idx++}`,
    [...params, limit]
  );

  // Summary counts for the last hour
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentCounts = await query<{ event_type: string; count: string }>(
    `SELECT event_type, COUNT(*)::text as count
     FROM crm.touchpoints
     WHERE occurred_at > $1
     GROUP BY event_type
     ORDER BY count DESC`,
    [hourAgo]
  );

  return NextResponse.json({
    items,
    recent_counts: Object.fromEntries(recentCounts.map(r => [r.event_type, parseInt(r.count)])),
    latest_at: items[0]?.occurred_at || null,
  });
}

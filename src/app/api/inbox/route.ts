import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { InboxItem } from '@/lib/types';

// GET /api/inbox - Unified inbox: all inbound signals
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const channel = searchParams.get('channel');
  const status = searchParams.get('status') || 'active';
  const search = searchParams.get('search');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  // Only inbound by default, or all with direction param
  const direction = searchParams.get('direction');
  if (direction && direction !== 'all') {
    conditions.push(`t.direction = $${idx++}`);
    params.push(direction);
  } else if (!direction) {
    conditions.push(`t.direction = 'inbound'`);
  }

  // Inbox status filter
  if (status === 'active') {
    conditions.push(`(t.inbox_status = 'active' OR t.inbox_status IS NULL)`);
  } else if (status === 'archived') {
    conditions.push(`t.inbox_status = 'archived'`);
  } else if (status === 'snoozed') {
    conditions.push(`t.inbox_status = 'snoozed' AND t.snoozed_until > NOW()`);
  }

  if (channel && channel !== 'all') {
    conditions.push(`t.channel = $${idx++}`);
    params.push(channel);
  }

  if (search) {
    conditions.push(`(
      t.subject ILIKE $${idx} OR
      t.body_preview ILIKE $${idx} OR
      c.business_name ILIKE $${idx} OR
      c.email ILIKE $${idx} OR
      c.first_name ILIKE $${idx} OR
      c.last_name ILIKE $${idx}
    )`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const items = await query<InboxItem>(
    `SELECT t.*,
            COALESCE(c.first_name || ' ' || c.last_name, c.email, 'Unknown') as contact_name,
            c.email as contact_email,
            c.business_name,
            c.lifecycle_stage
     FROM crm.touchpoints t
     LEFT JOIN crm.contacts c ON c.contact_id = t.contact_id
     ${where}
     ORDER BY t.occurred_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM crm.touchpoints t
     LEFT JOIN crm.contacts c ON c.contact_id = t.contact_id
     ${where}`,
    params
  );

  // Channel counts for filter badges
  const channelCounts = await query<{ channel: string; count: string }>(
    `SELECT t.channel, COUNT(*)::text as count
     FROM crm.touchpoints t
     WHERE t.direction = 'inbound'
       AND (t.inbox_status = 'active' OR t.inbox_status IS NULL)
     GROUP BY t.channel
     ORDER BY count DESC`
  );

  return NextResponse.json({
    items,
    total: parseInt(countResult?.count || '0'),
    limit,
    offset,
    channelCounts: Object.fromEntries(channelCounts.map(c => [c.channel, parseInt(c.count)])),
  });
}

// PATCH /api/inbox - Bulk update inbox items (archive, snooze)
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { touchpoint_ids, action, snoozed_until } = body;

  if (!touchpoint_ids?.length || !action) {
    return NextResponse.json({ error: 'Missing touchpoint_ids or action' }, { status: 400 });
  }

  const placeholders = touchpoint_ids.map((_: number, i: number) => `$${i + 1}`).join(',');

  if (action === 'archive') {
    await query(
      `UPDATE crm.touchpoints SET inbox_status = 'archived' WHERE touchpoint_id IN (${placeholders})`,
      touchpoint_ids
    );
  } else if (action === 'snooze') {
    await query(
      `UPDATE crm.touchpoints SET inbox_status = 'snoozed', snoozed_until = $${touchpoint_ids.length + 1}
       WHERE touchpoint_id IN (${placeholders})`,
      [...touchpoint_ids, snoozed_until || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()]
    );
  } else if (action === 'unarchive') {
    await query(
      `UPDATE crm.touchpoints SET inbox_status = 'active', snoozed_until = NULL WHERE touchpoint_id IN (${placeholders})`,
      touchpoint_ids
    );
  }

  return NextResponse.json({ success: true, updated: touchpoint_ids.length });
}

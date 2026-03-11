import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/phone/calls - List phone calls with filters
 * Query params: search, days, disposition, status, limit, offset, sort, order
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const days = parseInt(searchParams.get('days') || '30');
    const disposition = searchParams.get('disposition') || '';
    const status = searchParams.get('status') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

    const allowedSorts = ['created_at', 'duration_seconds', 'disposition', 'status'];
    const sortCol = allowedSorts.includes(sort) ? `pc.${sort}` : 'pc.created_at';

    const params: unknown[] = [days];
    let pi = 2;
    const conditions: string[] = [`pc.created_at >= NOW() - INTERVAL '1 day' * $1`];

    if (search) {
      conditions.push(`(
        c.first_name ILIKE $${pi} OR c.last_name ILIKE $${pi} OR
        c.business_name ILIKE $${pi} OR c.email ILIKE $${pi} OR
        c.phone ILIKE $${pi} OR pc.notes ILIKE $${pi}
      )`);
      params.push(`%${search}%`);
      pi++;
    }

    if (disposition) {
      conditions.push(`pc.disposition = $${pi}`);
      params.push(disposition);
      pi++;
    }

    if (status) {
      conditions.push(`pc.status = $${pi}`);
      params.push(status);
      pi++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countSql = `
      SELECT COUNT(*)::int as total
      FROM crm.phone_calls pc
      LEFT JOIN crm.contacts c ON c.contact_id = pc.contact_id
      ${where}
    `;
    const countResult = await query<{ total: number }>(countSql, params);
    const total = countResult[0]?.total || 0;

    const sql = `
      SELECT
        pc.call_id, pc.contact_id, pc.direction, pc.from_number, pc.to_number,
        pc.twilio_call_sid AS twilio_sid, pc.status, pc.disposition,
        pc.duration_seconds, pc.recording_url, pc.notes,
        pc.started_at, pc.ended_at, pc.created_at, pc.metadata,
        c.first_name, c.last_name, c.business_name, c.email, c.phone,
        c.lifecycle_stage, c.lead_score, c.engagement_score
      FROM crm.phone_calls pc
      LEFT JOIN crm.contacts c ON c.contact_id = pc.contact_id
      ${where}
      ORDER BY ${sortCol} ${order}
      LIMIT $${pi} OFFSET $${pi + 1}
    `;
    params.push(limit, offset);

    const calls = await query(sql, params);

    return NextResponse.json({ calls, total, limit, offset });
  } catch (error) {
    console.error('[phone/calls] error:', error);
    return NextResponse.json({ error: 'Failed to load phone calls' }, { status: 500 });
  }
}

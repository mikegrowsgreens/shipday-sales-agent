import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/calls
 * List calls from public.calls with optional filters.
 * Scoped to current tenant's org_id.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const days = parseInt(searchParams.get('days') || '30');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const type = searchParams.get('type') || ''; // 'fathom' or 'phone_agent'

    let sql = `
      SELECT call_id, deal_id, title, call_date, duration_seconds,
             fathom_url, fathom_summary, meeting_summary,
             talk_listen_ratio, question_count, filler_word_count,
             longest_monologue_seconds, call_type, meeting_type,
             action_items, topics_discussed, match_confidence
      FROM public.calls
      WHERE call_date >= NOW() - INTERVAL '1 day' * $1
        AND org_id = $2
    `;
    const params: unknown[] = [days, orgId];
    let pi = 3;

    // Filter by call source type
    if (type === 'fathom') {
      sql += ` AND call_type IN ('sales', 'onboarding', 'support')`;
    } else if (type === 'phone_agent') {
      sql += ` AND call_type = 'internal'`;
    }

    if (search) {
      sql += ` AND (title ILIKE $${pi} OR fathom_summary ILIKE $${pi} OR meeting_summary ILIKE $${pi})`;
      params.push(`%${search}%`);
      pi++;
    }

    sql += ` ORDER BY call_date DESC LIMIT $${pi}`;
    params.push(limit);

    const calls = await query(sql, params);

    return NextResponse.json({ calls, total: calls.length });
  } catch (error) {
    console.error('[calls] error:', error);
    return NextResponse.json({ error: 'Failed to load calls' }, { status: 500 });
  }
}

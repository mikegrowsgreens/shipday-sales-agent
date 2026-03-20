import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { NewsletterInsight } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireTenantSession();

    const tag = request.nextUrl.searchParams.get('tag');
    const search = request.nextUrl.searchParams.get('q');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

    let sql = 'SELECT * FROM shipday.newsletter_insights';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (tag) {
      conditions.push(`$${params.length + 1} = ANY(tags)`);
      params.push(tag);
    }

    if (search) {
      conditions.push(`insight_text ILIKE $${params.length + 1}`);
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY source_date DESC NULLS LAST LIMIT $${params.length + 1}`;
    params.push(limit);

    const insights = await query<NewsletterInsight>(sql, params);
    return NextResponse.json(insights);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error('[insights] error:', error);
    return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 });
  }
}

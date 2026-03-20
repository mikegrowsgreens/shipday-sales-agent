import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/brain/intelligence
 *
 * Returns competitive intelligence extracted from conversations and calls.
 * Supports filtering by intel_type, competitor_name, and verification status.
 *
 * Query params:
 *   type?: 'competitor_mention' | 'pricing_intel' | 'feature_request' | 'market_trend' | 'prospect_pain'
 *   competitor?: string
 *   verified?: 'true' | 'false'
 *   limit?: number (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const { searchParams } = new URL(request.url);
    const intelType = searchParams.get('type');
    const competitor = searchParams.get('competitor');
    const verifiedParam = searchParams.get('verified');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 200);

    let sql = `
      SELECT id, intel_type, source_type, source_id, competitor_name,
             content, context, confidence, verified, verified_by, verified_at, created_at
      FROM brain.external_intelligence
      WHERE org_id = $1
    `;
    const params: unknown[] = [orgId];
    let paramIdx = 2;

    if (intelType) {
      sql += ` AND intel_type = $${paramIdx++}`;
      params.push(intelType);
    }
    if (competitor) {
      sql += ` AND competitor_name ILIKE $${paramIdx++}`;
      params.push(`%${competitor}%`);
    }
    if (verifiedParam === 'true') {
      sql += ` AND verified = true`;
    } else if (verifiedParam === 'false') {
      sql += ` AND verified = false`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
    params.push(limit);

    const intel = await query(sql, params);

    // Summary stats
    const stats = await query<{
      total: string;
      unverified: string;
      by_type: Record<string, number>;
      top_competitors: Array<{ name: string; count: number }>;
    }>(
      `SELECT
         count(*)::text as total,
         count(CASE WHEN NOT verified THEN 1 END)::text as unverified
       FROM brain.external_intelligence
       WHERE org_id = $1`,
      [orgId],
    );

    const byType = await query<{ intel_type: string; count: string }>(
      `SELECT intel_type, count(*)::text
       FROM brain.external_intelligence
       WHERE org_id = $1
       GROUP BY intel_type
       ORDER BY count(*) DESC`,
      [orgId],
    );

    const topCompetitors = await query<{ competitor_name: string; mention_count: string }>(
      `SELECT competitor_name, count(*)::text as mention_count
       FROM brain.external_intelligence
       WHERE org_id = $1 AND competitor_name IS NOT NULL
       GROUP BY competitor_name
       ORDER BY count(*) DESC
       LIMIT 10`,
      [orgId],
    );

    return NextResponse.json({
      intelligence: intel,
      stats: {
        total: parseInt(stats[0]?.total || '0'),
        unverified: parseInt(stats[0]?.unverified || '0'),
        by_type: Object.fromEntries(byType.map(t => [t.intel_type, parseInt(t.count)])),
        top_competitors: topCompetitors.map(c => ({
          name: c.competitor_name,
          mentions: parseInt(c.mention_count),
        })),
      },
    });
  } catch (error) {
    console.error('[brain/intelligence] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch intelligence' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/brain/intelligence
 *
 * Verify or update intelligence entries.
 * Body: { id: string, verified: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const { id, verified } = await request.json() as { id: string; verified: boolean };

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await query(
      `UPDATE brain.external_intelligence
       SET verified = $1, verified_by = $2, verified_at = NOW()
       WHERE id = $3 AND org_id = $4`,
      [verified, tenant.email || 'admin', id, orgId],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[brain/intelligence] PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 },
    );
  }
}

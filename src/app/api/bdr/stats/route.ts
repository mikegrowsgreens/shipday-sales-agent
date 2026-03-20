import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/bdr/stats
 * BDR overview statistics — pipeline funnel, email performance, angle breakdown.
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    // Pipeline funnel counts
    const pipeline = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count FROM bdr.leads WHERE org_id = $1 GROUP BY status ORDER BY count DESC`,
      [orgId]
    );

    // Email performance
    const emailStats = await query<Record<string, string>>(
      `SELECT
        COUNT(*)::text as total_sent,
        COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opened,
        COUNT(CASE WHEN replied THEN 1 END)::text as replied,
        ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as open_rate,
        ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as reply_rate
      FROM bdr.email_sends
      WHERE org_id = $1`,
      [orgId]
    );

    // Angle performance
    const anglePerf = await query<Record<string, string>>(
      `SELECT angle,
        COUNT(*)::text as sent,
        COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opens,
        COUNT(CASE WHEN replied THEN 1 END)::text as replies,
        ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as open_rate,
        ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as reply_rate
      FROM bdr.email_sends
      WHERE org_id = $1 AND angle IS NOT NULL
      GROUP BY angle`,
      [orgId]
    );

    // Tier distribution
    const tierDist = await query<{ tier: string; count: string }>(
      `SELECT tier, COUNT(*)::text as count FROM bdr.leads WHERE org_id = $1 AND tier IS NOT NULL GROUP BY tier ORDER BY tier`,
      [orgId]
    );

    // Recent replies
    const recentReplies = await query<Record<string, unknown>>(
      `SELECT l.business_name, l.contact_name, l.contact_email,
             l.reply_sentiment, l.reply_summary, l.reply_date
      FROM bdr.leads l
      WHERE l.org_id = $1 AND l.has_replied = true
      ORDER BY l.reply_date DESC LIMIT 5`,
      [orgId]
    );

    // Demos from outreach
    const demoCount = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM bdr.leads WHERE org_id = $1 AND status = 'demo_opportunity'`,
      [orgId]
    );

    return NextResponse.json({
      pipeline: pipeline.map(r => ({ status: r.status, count: parseInt(r.count) })),
      emailStats: emailStats[0] || {},
      anglePerf,
      tierDist: tierDist.map(r => ({ tier: r.tier, count: parseInt(r.count) })),
      recentReplies,
      demosFromOutreach: parseInt(demoCount[0]?.count || '0'),
    });
  } catch (error) {
    console.error('[bdr-stats] error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

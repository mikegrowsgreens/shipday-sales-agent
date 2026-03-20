import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/analytics/brain-health
 * Knowledge base health: patterns, effectiveness, staleness, competitive intel.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    // Total patterns by type
    const patternsByType = await query<{
      pattern_type: string;
      count: string;
      avg_effectiveness: string;
    }>(
      `SELECT pattern_type, COUNT(*) AS count,
              ROUND(AVG(effectiveness_score)::numeric, 2) AS avg_effectiveness
       FROM brain.call_patterns
       WHERE org_id = $1
       GROUP BY pattern_type
       ORDER BY count DESC`,
      [orgId]
    );

    // Patterns learned this week
    const recentPatterns = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM brain.call_patterns
       WHERE org_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
      [orgId]
    );

    // Confidence/effectiveness distribution
    const confidenceDistribution = await query<{ bucket: string; count: string }>(
      `SELECT
        CASE
          WHEN effectiveness_score >= 0.8 THEN 'High (0.8-1.0)'
          WHEN effectiveness_score >= 0.6 THEN 'Good (0.6-0.8)'
          WHEN effectiveness_score >= 0.4 THEN 'Medium (0.4-0.6)'
          WHEN effectiveness_score >= 0.2 THEN 'Low (0.2-0.4)'
          ELSE 'Very Low (0-0.2)'
        END AS bucket,
        COUNT(*) AS count
      FROM brain.call_patterns
      WHERE org_id = $1
      GROUP BY bucket
      ORDER BY MIN(effectiveness_score) DESC`,
      [orgId]
    );

    // Top 10 performing patterns
    const topPatterns = await query<{
      id: string;
      pattern_type: string;
      pattern_text: string;
      effectiveness_score: string;
      times_referenced: string;
      owner_email: string;
    }>(
      `SELECT id, pattern_type, pattern_text, effectiveness_score,
              times_referenced, owner_email
       FROM brain.call_patterns
       WHERE org_id = $1
       ORDER BY effectiveness_score DESC, times_referenced DESC
       LIMIT 10`,
      [orgId]
    );

    // Stale patterns (not referenced in 30 days, low effectiveness)
    const stalePatterns = await query<{
      id: string;
      pattern_type: string;
      pattern_text: string;
      effectiveness_score: string;
      updated_at: string;
    }>(
      `SELECT id, pattern_type, pattern_text, effectiveness_score, updated_at
       FROM brain.call_patterns
       WHERE org_id = $1
         AND updated_at < NOW() - INTERVAL '30 days'
         AND effectiveness_score < 0.4
       ORDER BY effectiveness_score ASC
       LIMIT 10`,
      [orgId]
    );

    // Auto-learned patterns summary
    const autoLearnedSummary = await query<{
      source_type: string;
      count: string;
      avg_confidence: string;
    }>(
      `SELECT source_type, COUNT(*) AS count,
              ROUND(AVG(confidence)::numeric, 2) AS avg_confidence
       FROM brain.auto_learned
       WHERE org_id = $1 AND is_active = true
       GROUP BY source_type
       ORDER BY count DESC`,
      [orgId]
    );

    // External intelligence summary
    const intelSummary = await query<{
      intel_type: string;
      count: string;
      verified_count: string;
    }>(
      `SELECT intel_type, COUNT(*) AS count,
              COUNT(*) FILTER (WHERE verified = true) AS verified_count
       FROM brain.external_intelligence
       WHERE org_id = $1
       GROUP BY intel_type
       ORDER BY count DESC`,
      [orgId]
    );

    // Unverified competitive intel (for training queue)
    const unverifiedIntel = await query<{
      id: string;
      intel_type: string;
      competitor_name: string;
      content: string;
      source_type: string;
      created_at: string;
    }>(
      `SELECT id, intel_type, competitor_name, content, source_type, created_at
       FROM brain.external_intelligence
       WHERE org_id = $1 AND verified = false
       ORDER BY created_at DESC
       LIMIT 20`,
      [orgId]
    );

    // Team leaderboard: whose patterns are getting adopted
    const leaderboard = await query<{
      owner_email: string;
      pattern_count: string;
      avg_effectiveness: string;
      total_references: string;
    }>(
      `SELECT owner_email,
              COUNT(*) AS pattern_count,
              ROUND(AVG(effectiveness_score)::numeric, 2) AS avg_effectiveness,
              SUM(times_referenced) AS total_references
       FROM brain.call_patterns
       WHERE org_id = $1 AND owner_email IS NOT NULL
       GROUP BY owner_email
       ORDER BY avg_effectiveness DESC, total_references DESC
       LIMIT 10`,
      [orgId]
    );

    // Pattern explorer: all patterns for browsing (paginated)
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const typeFilter = request.nextUrl.searchParams.get('type') || '';
    const searchQuery = request.nextUrl.searchParams.get('q') || '';
    const limit = 25;
    const offset = (page - 1) * limit;

    let patternSql = `SELECT id, pattern_type, pattern_text, effectiveness_score,
                             times_referenced, owner_email, created_at, updated_at
                      FROM brain.call_patterns
                      WHERE org_id = $1`;
    const patternParams: unknown[] = [orgId];
    let paramIdx = 2;

    if (typeFilter) {
      patternSql += ` AND pattern_type = $${paramIdx}`;
      patternParams.push(typeFilter);
      paramIdx++;
    }
    if (searchQuery) {
      patternSql += ` AND pattern_text ILIKE $${paramIdx}`;
      patternParams.push(`%${searchQuery}%`);
      paramIdx++;
    }

    patternSql += ` ORDER BY effectiveness_score DESC, times_referenced DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    patternParams.push(limit, offset);

    const patterns = await query<{
      id: string;
      pattern_type: string;
      pattern_text: string;
      effectiveness_score: string;
      times_referenced: string;
      owner_email: string;
      created_at: string;
      updated_at: string;
    }>(patternSql, patternParams);

    // Total count for pagination
    let countSql = `SELECT COUNT(*) AS total FROM brain.call_patterns WHERE org_id = $1`;
    const countParams: unknown[] = [orgId];
    let countIdx = 2;
    if (typeFilter) {
      countSql += ` AND pattern_type = $${countIdx}`;
      countParams.push(typeFilter);
      countIdx++;
    }
    if (searchQuery) {
      countSql += ` AND pattern_text ILIKE $${countIdx}`;
      countParams.push(`%${searchQuery}%`);
    }
    const totalCount = await query<{ total: string }>(countSql, countParams);

    // Conversations where agent struggled (low qualification + abandoned)
    const struggledConversations = await query<{
      conversation_id: string;
      started_at: string;
      messages_count: string;
      qualification_completeness: string;
      terminal_state: string;
      objections_raised: string[];
    }>(
      `SELECT conversation_id, started_at, messages_count,
              qualification_completeness, terminal_state, objections_raised
       FROM brain.conversation_outcomes
       WHERE org_id = $1
         AND terminal_state IN ('abandoned', 'escalated')
         AND qualification_completeness < 40
       ORDER BY started_at DESC
       LIMIT 15`,
      [orgId]
    );

    return NextResponse.json({
      patternsByType,
      recentPatternsCount: parseInt(recentPatterns[0]?.count || '0'),
      confidenceDistribution,
      topPatterns,
      stalePatterns,
      autoLearnedSummary,
      intelSummary,
      unverifiedIntel,
      leaderboard,
      patterns: {
        items: patterns,
        total: parseInt(totalCount[0]?.total || '0'),
        page,
        limit,
      },
      trainingQueue: {
        struggledConversations,
        unverifiedIntelCount: unverifiedIntel.length,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[analytics/brain-health] error:', error);
    return NextResponse.json({ error: 'Failed to load brain health analytics' }, { status: 500 });
  }
}

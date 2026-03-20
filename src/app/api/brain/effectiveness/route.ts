import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/brain/effectiveness
 *
 * Weekly pattern effectiveness scorer. Designed to be called by a cron job.
 * - Correlates patterns with actual conversation outcomes
 * - Decays confidence on underperforming patterns
 * - Promotes patterns appearing in winning conversations
 * - Flags novel patterns from recently won deals for human review
 *
 * Body: { lookback_days?: number } (default: 7)
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json().catch(() => ({}));
    const lookbackDays = Math.min(Math.max((body as { lookback_days?: number }).lookback_days || 7, 1), 90);

    const results: string[] = [];

    // ─── 1. Promote patterns that appear in winning conversations ───
    // Find patterns used in conversations that led to demo bookings
    const winningPatterns = await query<{ id: string; confidence: number }>(
      `SELECT al.id, al.confidence
       FROM brain.auto_learned al
       WHERE al.source_type = 'chatbot_conversation'
         AND al.org_id = $1
         AND al.is_active = true
         AND al.created_at > NOW() - INTERVAL '1 day' * $2
         AND EXISTS (
           SELECT 1 FROM brain.conversation_outcomes co
           WHERE co.conversation_id = al.source_id
             AND co.terminal_state = 'demo_booked'
             AND co.org_id = $1
         )`,
      [orgId, lookbackDays],
    );

    let promoted = 0;
    for (const p of winningPatterns) {
      const newConfidence = Math.min(1, p.confidence + 0.05);
      await query(
        `UPDATE brain.auto_learned SET confidence = $1, times_successful = times_successful + 1, updated_at = NOW() WHERE id = $2`,
        [newConfidence, p.id],
      );
      promoted++;
    }
    results.push(`Promoted ${promoted} winning patterns`);

    // ─── 2. Decay patterns from abandoned conversations ─────────────
    const losingPatterns = await query<{ id: string; confidence: number }>(
      `SELECT al.id, al.confidence
       FROM brain.auto_learned al
       WHERE al.source_type = 'chatbot_conversation'
         AND al.org_id = $1
         AND al.is_active = true
         AND al.created_at > NOW() - INTERVAL '1 day' * $2
         AND EXISTS (
           SELECT 1 FROM brain.conversation_outcomes co
           WHERE co.conversation_id = al.source_id
             AND co.terminal_state = 'abandoned'
             AND co.org_id = $1
         )`,
      [orgId, lookbackDays],
    );

    let decayed = 0;
    for (const p of losingPatterns) {
      const newConfidence = Math.max(0.1, p.confidence - 0.08);
      await query(
        `UPDATE brain.auto_learned SET confidence = $1, updated_at = NOW() WHERE id = $2`,
        [newConfidence, p.id],
      );
      decayed++;
    }
    results.push(`Decayed ${decayed} underperforming patterns`);

    // ─── 3. Deactivate chronically low-confidence patterns ──────────
    const deactivated = await query<{ count: string }>(
      `WITH deactivated AS (
         UPDATE brain.auto_learned
         SET is_active = false, updated_at = NOW()
         WHERE org_id = $1
           AND is_active = true
           AND confidence < 0.2
           AND created_at < NOW() - INTERVAL '14 days'
           AND times_successful = 0
         RETURNING id
       )
       SELECT count(*)::text FROM deactivated`,
      [orgId],
    );
    results.push(`Deactivated ${deactivated[0]?.count || 0} stale patterns`);

    // ─── 4. Promote high-performing call patterns ────────────────────
    const callPatternPromoted = await query<{ count: string }>(
      `WITH promoted AS (
         UPDATE brain.call_patterns
         SET effectiveness_score = LEAST(1, effectiveness_score + 0.03),
             updated_at = NOW()
         WHERE org_id = $1
           AND effectiveness_score > 0.7
           AND times_referenced > 0
           AND created_at > NOW() - INTERVAL '1 day' * $2
         RETURNING id
       )
       SELECT count(*)::text FROM promoted`,
      [orgId, lookbackDays],
    );
    results.push(`Boosted ${callPatternPromoted[0]?.count || 0} high-performing call patterns`);

    // ─── 5. Decay unused call patterns ──────────────────────────────
    const callPatternDecayed = await query<{ count: string }>(
      `WITH decayed AS (
         UPDATE brain.call_patterns
         SET effectiveness_score = GREATEST(0.1, effectiveness_score - 0.02),
             updated_at = NOW()
         WHERE org_id = $1
           AND times_referenced = 0
           AND created_at < NOW() - INTERVAL '30 days'
         RETURNING id
       )
       SELECT count(*)::text FROM decayed`,
      [orgId],
    );
    results.push(`Decayed ${callPatternDecayed[0]?.count || 0} unused call patterns`);

    // ─── 6. Flag novel patterns for human review ────────────────────
    const novelPatterns = await query<{ id: string; pattern_type: string; content: string }>(
      `SELECT id, pattern_type, content
       FROM brain.auto_learned
       WHERE org_id = $1
         AND source_type = 'chatbot_conversation'
         AND confidence >= 0.75
         AND created_at > NOW() - INTERVAL '1 day' * $2
         AND times_used = 0
       ORDER BY confidence DESC
       LIMIT 10`,
      [orgId, lookbackDays],
    );
    results.push(`Found ${novelPatterns.length} novel high-confidence patterns for review`);

    // ─── 7. Compute aggregate stats ─────────────────────────────────
    const stats = await query<{
      total_active: string;
      avg_confidence: string;
      demo_rate: string;
      total_conversations: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM brain.auto_learned WHERE org_id = $1 AND is_active = true) as total_active,
         (SELECT round(avg(confidence)::numeric, 2)::text FROM brain.auto_learned WHERE org_id = $1 AND is_active = true) as avg_confidence,
         (SELECT round(100.0 * count(CASE WHEN terminal_state = 'demo_booked' THEN 1 END) /
           NULLIF(count(*), 0), 1)::text
           FROM brain.conversation_outcomes
           WHERE org_id = $1 AND created_at > NOW() - INTERVAL '1 day' * $2) as demo_rate,
         (SELECT count(*)::text FROM brain.conversation_outcomes WHERE org_id = $1 AND created_at > NOW() - INTERVAL '1 day' * $2) as total_conversations`,
      [orgId, lookbackDays],
    );

    return NextResponse.json({
      success: true,
      lookback_days: lookbackDays,
      actions: results,
      novel_patterns_for_review: novelPatterns.map(p => ({
        id: p.id,
        type: p.pattern_type,
        preview: p.content.slice(0, 100),
      })),
      stats: stats[0] ? {
        total_active_patterns: parseInt(stats[0].total_active || '0'),
        avg_confidence: parseFloat(stats[0].avg_confidence || '0'),
        demo_booking_rate_pct: parseFloat(stats[0].demo_rate || '0'),
        total_conversations: parseInt(stats[0].total_conversations || '0'),
      } : null,
    });
  } catch (error) {
    console.error('[brain/effectiveness] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Effectiveness scoring failed' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/brain/effectiveness
 *
 * Returns pattern effectiveness stats and trends.
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    // Top patterns by confidence
    const topPatterns = await query<{
      id: string;
      source_type: string;
      pattern_type: string;
      content: string;
      confidence: number;
      times_used: number;
      times_successful: number;
    }>(
      `SELECT id, source_type, pattern_type, content, confidence, times_used, times_successful
       FROM brain.auto_learned
       WHERE org_id = $1 AND is_active = true
       ORDER BY confidence DESC, times_successful DESC
       LIMIT 20`,
      [orgId],
    );

    // Pattern type distribution
    const distribution = await query<{ pattern_type: string; count: string; avg_confidence: string }>(
      `SELECT pattern_type, count(*)::text, round(avg(confidence)::numeric, 2)::text as avg_confidence
       FROM brain.auto_learned
       WHERE org_id = $1 AND is_active = true
       GROUP BY pattern_type
       ORDER BY count(*) DESC`,
      [orgId],
    );

    // Conversation outcome breakdown (last 30 days)
    const outcomes = await query<{ terminal_state: string; count: string; avg_messages: string; avg_qual: string }>(
      `SELECT terminal_state,
              count(*)::text,
              round(avg(messages_count))::text as avg_messages,
              round(avg(qualification_completeness))::text as avg_qual
       FROM brain.conversation_outcomes
       WHERE org_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY terminal_state
       ORDER BY count(*) DESC`,
      [orgId],
    );

    return NextResponse.json({
      top_patterns: topPatterns,
      pattern_distribution: distribution,
      conversation_outcomes: outcomes,
    });
  } catch (error) {
    console.error('[brain/effectiveness] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch effectiveness data' },
      { status: 500 },
    );
  }
}

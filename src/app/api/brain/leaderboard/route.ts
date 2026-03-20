import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/brain/leaderboard
 *
 * Team leaderboard: tracks which rep's call patterns the AI adopts and produces results.
 * Aggregates pattern attribution data to show who's contributing the most effective patterns.
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    // ─── 1. Rep pattern contributions ───────────────────────────────
    // Patterns extracted from each rep's calls, ranked by effectiveness
    const repContributions = await query<{
      owner_email: string;
      total_patterns: string;
      avg_effectiveness: string;
      high_performers: string;
      pattern_types: string;
    }>(
      `SELECT
         owner_email,
         count(*)::text as total_patterns,
         round(avg(effectiveness_score)::numeric, 2)::text as avg_effectiveness,
         count(CASE WHEN effectiveness_score >= 0.75 THEN 1 END)::text as high_performers,
         string_agg(DISTINCT pattern_type, ', ') as pattern_types
       FROM brain.call_patterns
       WHERE org_id = $1 AND owner_email IS NOT NULL
       GROUP BY owner_email
       ORDER BY avg(effectiveness_score) DESC, count(*) DESC`,
      [orgId],
    );

    // ─── 2. AI adoption metrics ─────────────────────────────────────
    // Which rep patterns are being used most by the AI
    const aiAdoption = await query<{
      owner_email: string;
      times_referenced: string;
      adopted_patterns: string;
    }>(
      `SELECT
         owner_email,
         sum(times_referenced)::text as times_referenced,
         count(CASE WHEN times_referenced > 0 THEN 1 END)::text as adopted_patterns
       FROM brain.call_patterns
       WHERE org_id = $1 AND owner_email IS NOT NULL
       GROUP BY owner_email
       ORDER BY sum(times_referenced) DESC`,
      [orgId],
    );

    // ─── 3. Attribution tracking ────────────────────────────────────
    const attributions = await query<{
      owner_email: string;
      adopted_count: string;
      win_count: string;
    }>(
      `SELECT
         owner_email,
         sum(adopted_count)::text as adopted_count,
         sum(win_count)::text as win_count
       FROM brain.pattern_attribution
       WHERE org_id = $1
       GROUP BY owner_email
       ORDER BY sum(win_count) DESC`,
      [orgId],
    );

    // ─── 4. Top patterns per rep ────────────────────────────────────
    const topPatternsByRep = await query<{
      owner_email: string;
      pattern_type: string;
      pattern_text: string;
      effectiveness_score: number;
      times_referenced: number;
    }>(
      `SELECT DISTINCT ON (owner_email)
         owner_email, pattern_type, pattern_text, effectiveness_score, times_referenced
       FROM brain.call_patterns
       WHERE org_id = $1 AND owner_email IS NOT NULL
       ORDER BY owner_email, effectiveness_score DESC`,
      [orgId],
    );

    // ─── 5. Overall brain health metrics ────────────────────────────
    const brainHealth = await query<{
      total_call_patterns: string;
      total_auto_learned: string;
      total_intel: string;
      patterns_this_week: string;
      avg_call_effectiveness: string;
      avg_learned_confidence: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM brain.call_patterns WHERE org_id = $1) as total_call_patterns,
         (SELECT count(*)::text FROM brain.auto_learned WHERE org_id = $1 AND is_active = true) as total_auto_learned,
         (SELECT count(*)::text FROM brain.external_intelligence WHERE org_id = $1) as total_intel,
         (SELECT count(*)::text FROM brain.call_patterns WHERE org_id = $1 AND created_at > NOW() - INTERVAL '7 days') as patterns_this_week,
         (SELECT round(avg(effectiveness_score)::numeric, 2)::text FROM brain.call_patterns WHERE org_id = $1) as avg_call_effectiveness,
         (SELECT round(avg(confidence)::numeric, 2)::text FROM brain.auto_learned WHERE org_id = $1 AND is_active = true) as avg_learned_confidence`,
      [orgId],
    );

    // Build the leaderboard
    const leaderboard = repContributions.map(rep => {
      const adoption = aiAdoption.find(a => a.owner_email === rep.owner_email);
      const attribution = attributions.find(a => a.owner_email === rep.owner_email);
      const topPattern = topPatternsByRep.find(p => p.owner_email === rep.owner_email);

      return {
        rep_email: rep.owner_email,
        total_patterns: parseInt(rep.total_patterns),
        avg_effectiveness: parseFloat(rep.avg_effectiveness),
        high_performer_count: parseInt(rep.high_performers),
        pattern_types: rep.pattern_types,
        ai_times_referenced: parseInt(adoption?.times_referenced || '0'),
        ai_adopted_patterns: parseInt(adoption?.adopted_patterns || '0'),
        wins_attributed: parseInt(attribution?.win_count || '0'),
        top_pattern: topPattern ? {
          type: topPattern.pattern_type,
          text: topPattern.pattern_text.slice(0, 100),
          score: topPattern.effectiveness_score,
        } : null,
      };
    });

    return NextResponse.json({
      leaderboard,
      brain_health: brainHealth[0] ? {
        total_call_patterns: parseInt(brainHealth[0].total_call_patterns || '0'),
        total_auto_learned: parseInt(brainHealth[0].total_auto_learned || '0'),
        total_intel: parseInt(brainHealth[0].total_intel || '0'),
        patterns_this_week: parseInt(brainHealth[0].patterns_this_week || '0'),
        avg_call_effectiveness: parseFloat(brainHealth[0].avg_call_effectiveness || '0'),
        avg_learned_confidence: parseFloat(brainHealth[0].avg_learned_confidence || '0'),
      } : null,
    });
  } catch (error) {
    console.error('[brain/leaderboard] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Leaderboard failed' },
      { status: 500 },
    );
  }
}

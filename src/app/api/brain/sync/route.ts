import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';

/**
 * POST /api/brain/sync
 * Aggregates live sales intelligence from deal analytics tables
 * (deals, phrase_stats, extracted_features) into brain.internal_content
 * so the chatbot, email generation, and all copy stay current.
 *
 * This replaces stale manual entries with real, evolving data.
 * Should be called periodically (daily cron or manual trigger).
 */
export async function POST() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const orgConfig = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
    const companyName = orgConfig.company_name;

    const results: string[] = [];

    // ─── 1. Deal Stats Summary ────────────────────────────────────────────
    const dealStats = await query<{
      total_deals: number;
      won: number;
      lost: number;
      win_rate: number;
      avg_won_mrr: number;
      total_won_mrr: number;
      deals_at_349: number;
      deals_at_159: number;
      deals_at_99: number;
    }>(`
      SELECT
        count(*) as total_deals,
        count(CASE WHEN outcome='won' THEN 1 END) as won,
        count(CASE WHEN outcome='lost' THEN 1 END) as lost,
        round(100.0 * count(CASE WHEN outcome='won' THEN 1 END) / NULLIF(count(CASE WHEN outcome IN ('won','lost') THEN 1 END), 0), 1) as win_rate,
        round(avg(CASE WHEN outcome='won' THEN mrr END), 2) as avg_won_mrr,
        round(sum(CASE WHEN outcome='won' THEN mrr ELSE 0 END), 2) as total_won_mrr,
        count(CASE WHEN outcome='won' AND mrr >= 300 THEN 1 END) as deals_at_349,
        count(CASE WHEN outcome='won' AND mrr >= 140 AND mrr < 300 THEN 1 END) as deals_at_159,
        count(CASE WHEN outcome='won' AND mrr < 140 THEN 1 END) as deals_at_99
      FROM public.deals
      WHERE org_id = $1
    `, [orgId]);

    if (dealStats.length > 0) {
      const d = dealStats[0];
      await upsertBrainContent(
        orgId,
        'deal_intelligence',
        'Live Deal Performance Stats',
        `Current sales performance (auto-synced from live data):
- Total deals tracked: ${d.total_deals}
- Won deals: ${d.won} | Lost deals: ${d.lost}
- Win rate: ${d.win_rate}%
- Average MRR of won deals: $${d.avg_won_mrr}
- Total won MRR: $${d.total_won_mrr}
- Deals closed at $349 Unlimited tier: ${d.deals_at_349}
- Deals closed at $159 AI Lite tier: ${d.deals_at_159}
- Deals closed at $99 Elite tier: ${d.deals_at_99}

Use these stats to build credibility: "We've helped ${d.won}+ businesses optimize their delivery operations" and "Our average customer invests $${d.avg_won_mrr}/month and sees ROI within the first week."`,
        ['Live deal performance data auto-synced', `${d.win_rate}% win rate across ${d.total_deals} demos`, `$${d.avg_won_mrr} average MRR`],
        ['Proven track record with hundreds of restaurants', 'High win rate demonstrates product-market fit'],
        [`Uncertainty about whether ${companyName} works for their type of business`]
      );
      results.push(`Deal stats synced: ${d.won} won, ${d.win_rate}% win rate, $${d.avg_won_mrr} avg MRR`);
    }

    // ─── 2. Pipeline Summary ──────────────────────────────────────────────
    const pipeline = await query<{
      stage: string;
      count: number;
      total_mrr: number;
    }>(`
      SELECT stage, count(*)::int as count, coalesce(sum(mrr), 0)::numeric as total_mrr
      FROM public.deals
      WHERE (outcome IS NULL OR outcome NOT IN ('won', 'lost'))
        AND org_id = $1
      GROUP BY stage
      ORDER BY count DESC
    `, [orgId]);

    if (pipeline.length > 0) {
      const pipelineText = pipeline.map(p => `- ${p.stage}: ${p.count} deals ($${p.total_mrr} MRR)`).join('\n');
      const totalPipeline = pipeline.reduce((sum, p) => sum + Number(p.total_mrr), 0);
      const totalDeals = pipeline.reduce((sum, p) => sum + Number(p.count), 0);

      await upsertBrainContent(
        orgId,
        'pipeline_intelligence',
        'Live Pipeline Status',
        `Active sales pipeline (auto-synced):
${pipelineText}
Total: ${totalDeals} active deals, $${totalPipeline.toFixed(0)} potential MRR

This shows strong demand across restaurant segments. Use when prospects ask about other customers or market adoption.`,
        [`${totalDeals} restaurants currently in pipeline`, `$${totalPipeline.toFixed(0)} in potential monthly revenue`],
        ['Strong market demand and adoption'],
        ['Am I too late to the game?', 'Is this really catching on?']
      );
      results.push(`Pipeline synced: ${totalDeals} active deals, $${totalPipeline.toFixed(0)} MRR`);
    }

    // ─── 3. Top Winning Phrases ───────────────────────────────────────────
    const winningPhrases = await query<{
      phrase: string;
      category: string;
      win_rate_lift: number;
      usage_count_won: number;
      avg_mrr_when_used: number;
    }>(`
      SELECT phrase, category, win_rate_lift, usage_count_won, avg_mrr_when_used
      FROM public.phrase_stats
      WHERE win_rate_lift > 10
        AND org_id = $1
      ORDER BY win_rate_lift DESC
      LIMIT 25
    `, [orgId]);

    if (winningPhrases.length > 0) {
      // Group by category
      const byCategory: Record<string, typeof winningPhrases> = {};
      for (const p of winningPhrases) {
        if (!byCategory[p.category]) byCategory[p.category] = [];
        byCategory[p.category].push(p);
      }

      const phraseText = Object.entries(byCategory)
        .map(([cat, phrases]) => {
          const lines = phrases.map(p =>
            `  - "${p.phrase}" - +${p.win_rate_lift}% conversion lift, avg MRR $${p.avg_mrr_when_used} (used in ${p.usage_count_won} wins)`
          ).join('\n');
          return `**${cat.charAt(0).toUpperCase() + cat.slice(1)}:**\n${lines}`;
        }).join('\n\n');

      await upsertBrainContent(
        orgId,
        'winning_phrases',
        'Top Converting Sales Phrases',
        `These phrases have the highest conversion lift in actual sales calls (auto-synced from call analysis):

${phraseText}

USAGE: Naturally weave these phrases and concepts into your responses. Don't use them verbatim in chat - adapt them conversationally. The discovery questions are especially powerful for opening up prospects.`,
        winningPhrases.slice(0, 5).map(p => `"${p.phrase}" drives +${p.win_rate_lift}% conversion`),
        ['Data-backed sales language that actually converts'],
        ['General conversation effectiveness']
      );
      results.push(`Winning phrases synced: ${winningPhrases.length} high-lift phrases`);
    }

    // ─── 4. Common Pain Points from Calls ─────────────────────────────────
    // JSONB structure: pain_points = [{pain, severity, quote}], objection_types = [{objection, category, handling, resolved}],
    // competitor_mentions = [{competitor, context}]
    const painPoints = await query<{
      pain_points: Array<{ pain: string; severity: string; quote?: string }>;
      objection_types: Array<{ objection: string; category: string; handling?: string; resolved?: boolean }>;
      competitor_mentions: Array<{ competitor: string; context: string }>;
    }>(`
      SELECT pain_points, objection_types, competitor_mentions
      FROM public.extracted_features
      WHERE pain_points IS NOT NULL
        AND org_id = $1
      ORDER BY extracted_at DESC
      LIMIT 100
    `, [orgId]);

    if (painPoints.length > 0) {
      // Aggregate pain points across calls — extract the actual text from JSONB objects
      const painMap: Record<string, { count: number; severity: string }> = {};
      const objectionMap: Record<string, { count: number; category: string }> = {};
      const competitorMap: Record<string, { count: number; contexts: string[] }> = {};

      for (const row of painPoints) {
        // Parse pain_points — each is {pain, severity, quote}
        const pains = Array.isArray(row.pain_points) ? row.pain_points : [];
        for (const p of pains) {
          const painText = typeof p === 'object' && p !== null ? (p.pain || '') : String(p);
          const severity = typeof p === 'object' && p !== null ? (p.severity || 'medium') : 'medium';
          const key = painText.toLowerCase().trim();
          if (key.length > 5) {
            if (!painMap[key]) painMap[key] = { count: 0, severity };
            painMap[key].count++;
            // Keep highest severity
            if (severity === 'high') painMap[key].severity = 'high';
          }
        }

        // Parse objection_types — each is {objection, category, handling, resolved}
        const objections = Array.isArray(row.objection_types) ? row.objection_types : [];
        for (const o of objections) {
          const objText = typeof o === 'object' && o !== null ? (o.objection || '') : String(o);
          const category = typeof o === 'object' && o !== null ? (o.category || 'unknown') : 'unknown';
          const key = objText.toLowerCase().trim();
          if (key.length > 5) {
            if (!objectionMap[key]) objectionMap[key] = { count: 0, category };
            objectionMap[key].count++;
          }
        }

        // Parse competitor_mentions — each is {competitor, context}
        const competitors = Array.isArray(row.competitor_mentions) ? row.competitor_mentions : [];
        for (const c of competitors) {
          const compName = typeof c === 'object' && c !== null ? (c.competitor || '') : String(c);
          const context = typeof c === 'object' && c !== null ? (c.context || '') : '';
          const key = compName.trim();
          if (key.length > 2) {
            if (!competitorMap[key]) competitorMap[key] = { count: 0, contexts: [] };
            competitorMap[key].count++;
            if (context && competitorMap[key].contexts.length < 3) {
              competitorMap[key].contexts.push(context);
            }
          }
        }
      }

      const topPains = Object.entries(painMap).sort((a, b) => b[1].count - a[1].count).slice(0, 20);
      const topObjections = Object.entries(objectionMap).sort((a, b) => b[1].count - a[1].count).slice(0, 15);
      const topCompetitors = Object.entries(competitorMap).sort((a, b) => b[1].count - a[1].count).slice(0, 10);

      const painText = `**Most Common Pain Points (from ${painPoints.length} recent calls):**
${topPains.map(([p, data]) => `- ${p} (mentioned ${data.count}x, severity: ${data.severity})`).join('\n')}

**Most Common Objections:**
${topObjections.map(([o, data]) => `- ${o} [${data.category}] (raised ${data.count}x)`).join('\n')}

**Competitors Most Mentioned:**
${topCompetitors.map(([c, data]) => `- ${c} (${data.count}x) - ${data.contexts[0] || ''}`).join('\n')}

USAGE: When a prospect mentions a pain point from this list, acknowledge it as something you hear frequently - it builds trust and shows you understand their industry. For objections, reference how other customers overcame the same concern. For competitors, use the context to position ${companyName}'s advantages.`;

      await upsertBrainContent(
        orgId,
        'call_intelligence',
        'Real Prospect Pain Points & Objections',
        painText,
        topPains.slice(0, 5).map(([p]) => p),
        ['Understands real restaurant pain points from hundreds of calls'],
        topPains.slice(0, 5).map(([p]) => p)
      );
      results.push(`Pain points synced: ${topPains.length} pains, ${topObjections.length} objections, ${topCompetitors.length} competitors`);
    }

    // ─── 5. Top Performing Value Props from Calls ─────────────────────────
    // JSONB structure: value_prop_frames = [{frame, effectiveness}], closing_moves = [{move, outcome}]
    const valueProps = await query<{
      value_prop_frames: Array<{ frame: string; effectiveness: string }>;
      closing_moves: Array<{ move: string; outcome: string }>;
    }>(`
      SELECT value_prop_frames, closing_moves
      FROM public.extracted_features
      WHERE value_prop_frames IS NOT NULL
        AND org_id = $1
      ORDER BY extracted_at DESC
      LIMIT 100
    `, [orgId]);

    if (valueProps.length > 0) {
      const vpMap: Record<string, { count: number; effectiveness: string }> = {};
      const closeMap: Record<string, { count: number; outcomes: Record<string, number> }> = {};

      for (const row of valueProps) {
        // Parse value_prop_frames — each is {frame, effectiveness}
        const frames = Array.isArray(row.value_prop_frames) ? row.value_prop_frames : [];
        for (const v of frames) {
          const frameText = typeof v === 'object' && v !== null ? (v.frame || '') : String(v);
          const effectiveness = typeof v === 'object' && v !== null ? (v.effectiveness || 'medium') : 'medium';
          const key = frameText.trim();
          if (key.length > 10) {
            if (!vpMap[key]) vpMap[key] = { count: 0, effectiveness };
            vpMap[key].count++;
            if (effectiveness === 'high') vpMap[key].effectiveness = 'high';
          }
        }

        // Parse closing_moves — each is {move, outcome}
        const moves = Array.isArray(row.closing_moves) ? row.closing_moves : [];
        for (const c of moves) {
          const moveText = typeof c === 'object' && c !== null ? (c.move || '') : String(c);
          const outcome = typeof c === 'object' && c !== null ? (c.outcome || 'unknown') : 'unknown';
          const key = moveText.trim();
          if (key.length > 10) {
            if (!closeMap[key]) closeMap[key] = { count: 0, outcomes: {} };
            closeMap[key].count++;
            closeMap[key].outcomes[outcome] = (closeMap[key].outcomes[outcome] || 0) + 1;
          }
        }
      }

      const topVPs = Object.entries(vpMap).sort((a, b) => b[1].count - a[1].count).slice(0, 15);
      const topCloses = Object.entries(closeMap).sort((a, b) => b[1].count - a[1].count).slice(0, 10);

      const vpText = `**Value Propositions That Resonate Most (from real calls):**
${topVPs.map(([v, data]) => `- ${v} (used ${data.count}x, effectiveness: ${data.effectiveness})`).join('\n')}

**Most Effective Closing Approaches:**
${topCloses.map(([c, data]) => {
        const outcomeSummary = Object.entries(data.outcomes).map(([o, n]) => `${n} ${o}`).join(', ');
        return `- ${c} (used ${data.count}x - ${outcomeSummary})`;
      }).join('\n')}

USAGE: Mirror these value prop frames when matching prospect pain to ${companyName} solutions. Use closing moves when the prospect is showing buying signals. High-effectiveness frames should be prioritized. Focus on closing moves with "accepted" outcomes.`;

      await upsertBrainContent(
        orgId,
        'value_prop_intelligence',
        'Battle-Tested Value Props & Closing Moves',
        vpText,
        topVPs.slice(0, 3).map(([v]) => v),
        topVPs.slice(0, 5).map(([v]) => v),
        []
      );
      results.push(`Value props synced: ${topVPs.length} frames, ${topCloses.length} closing moves`);
    }

    // ─── 6. MRR Tier Analysis ─────────────────────────────────────────────
    const mrrAnalysis = await query<{
      mrr_tier: string;
      count: number;
      avg_mrr: number;
      total_mrr: number;
    }>(`
      SELECT
        CASE
          WHEN mrr >= 300 THEN '$349 Unlimited'
          WHEN mrr >= 140 THEN '$159 AI Lite'
          WHEN mrr > 0 THEN '$99 Elite'
          ELSE 'Unknown'
        END as mrr_tier,
        count(*)::int as count,
        round(avg(mrr), 2) as avg_mrr,
        round(sum(mrr), 2) as total_mrr
      FROM public.deals
      WHERE outcome = 'won'
        AND org_id = $1
      GROUP BY 1
      ORDER BY avg_mrr DESC
    `, [orgId]);

    if (mrrAnalysis.length > 0) {
      const tierText = mrrAnalysis.map(t =>
        `- **${t.mrr_tier}**: ${t.count} customers, avg $${t.avg_mrr}/mo, total $${t.total_mrr}/mo MRR`
      ).join('\n');

      await upsertBrainContent(
        orgId,
        'mrr_tier_analysis',
        'Customer MRR Tier Breakdown',
        `Won deal breakdown by plan tier (auto-synced):
${tierText}

STRATEGY: The $349 Unlimited plan customers represent the highest-value segment. When qualifying prospects, look for signals that match the Unlimited profile: multi-location, high delivery volume, lots of phone orders, current 3PD commission pain. Frame the $349 as the standard recommendation - it's where most of our successful customers land.`,
        mrrAnalysis.map(t => `${t.count} customers on ${t.mrr_tier}`),
        ['Most successful customers choose the Unlimited plan'],
        ['Which plan is right for me?']
      );
      results.push(`MRR tier analysis synced: ${mrrAnalysis.length} tiers`);
    }

    return NextResponse.json({
      synced: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('[brain/sync] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Brain sync failed' },
      { status: 500 }
    );
  }
}

/**
 * Upsert a brain.internal_content entry by content_type.
 * If an entry with that content_type already exists for this org, update it.
 * Otherwise, insert a new one.
 */
async function upsertBrainContent(
  orgId: number,
  contentType: string,
  title: string,
  rawText: string,
  keyClaims: string[],
  valueProps: string[],
  painPoints: string[],
) {
  // Check if entry exists for this org
  const existing = await query<{ id: string }>(
    `SELECT id FROM brain.internal_content WHERE content_type = $1 AND title = $2 AND org_id = $3 LIMIT 1`,
    [contentType, title, orgId]
  );

  // Generate a content hash from the raw text for dedup
  const contentHash = `sync_${contentType}_${Buffer.from(rawText.slice(0, 100)).toString('base64').slice(0, 32)}`;

  if (existing.length > 0) {
    await query(
      `UPDATE brain.internal_content
       SET raw_text = $1, key_claims = $2, value_props = $3,
           pain_points_addressed = $4, content_hash = $5, is_active = true, updated_at = NOW()
       WHERE id = $6 AND org_id = $7`,
      [rawText, JSON.stringify(keyClaims), JSON.stringify(valueProps), JSON.stringify(painPoints), contentHash, existing[0].id, orgId]
    );
  } else {
    await query(
      `INSERT INTO brain.internal_content
       (id, content_hash, content_type, title, raw_text, key_claims, value_props, pain_points_addressed, source_type, is_active, org_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'automated', true, $8, NOW(), NOW())`,
      [contentHash, contentType, title, rawText, JSON.stringify(keyClaims), JSON.stringify(valueProps), JSON.stringify(painPoints), orgId]
    );
  }
}

// Also expose GET so we can check sync status
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const content = await query<{
      content_type: string;
      title: string;
      source_type: string;
      updated_at: string;
      text_len: number;
    }>(`
      SELECT content_type, title, source_type, updated_at,
             length(raw_text) as text_len
      FROM brain.internal_content
      WHERE is_active = true AND org_id = $1
      ORDER BY updated_at DESC
    `, [orgId]);

    const automated = content.filter(c => c.source_type === 'automated');
    const manual = content.filter(c => c.source_type !== 'automated');

    return NextResponse.json({
      total_entries: content.length,
      automated_entries: automated.length,
      manual_entries: manual.length,
      entries: content,
    });
  } catch (error) {
    console.error('[brain/sync] GET error:', error);
    return NextResponse.json({ error: 'Failed to check sync status' }, { status: 500 });
  }
}

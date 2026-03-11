import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * POST /api/brain/migrate
 * Creates all new tables for Session 7: Knowledge Brain & AI Intelligence Layer.
 */
export async function POST() {
  const results: string[] = [];

  try {
    // ─── 1. Brain tags for organizing content ──────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS brain.content_tags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT 'blue',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('brain.content_tags created');

    // Tag junction table
    await query(`
      CREATE TABLE IF NOT EXISTS brain.content_tag_map (
        content_id UUID NOT NULL,
        tag_id UUID NOT NULL,
        PRIMARY KEY (content_id, tag_id)
      )
    `);
    results.push('brain.content_tag_map created');

    // ─── 2. Industry snippets for deep personalization ─────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS brain.industry_snippets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        industry TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        variables JSONB DEFAULT '[]',
        usage_count INT DEFAULT 0,
        effectiveness_score NUMERIC(5,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('brain.industry_snippets created');

    // Index for fast lookup by industry
    await query(`
      CREATE INDEX IF NOT EXISTS idx_industry_snippets_industry
      ON brain.industry_snippets(industry, category) WHERE is_active = true
    `);
    results.push('industry_snippets index created');

    // ─── 3. Auto-learned winning patterns ──────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS brain.auto_learned (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_type TEXT NOT NULL,
        source_id TEXT,
        pattern_type TEXT NOT NULL,
        content TEXT NOT NULL,
        context JSONB DEFAULT '{}',
        confidence NUMERIC(5,2) DEFAULT 0.5,
        times_used INT DEFAULT 0,
        times_successful INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('brain.auto_learned created');

    // Index for looking up patterns by type
    await query(`
      CREATE INDEX IF NOT EXISTS idx_auto_learned_type
      ON brain.auto_learned(pattern_type, confidence DESC) WHERE is_active = true
    `);
    results.push('auto_learned index created');

    // ─── 4. Effectiveness tracking ─────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS brain.effectiveness_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content_id UUID,
        content_type TEXT NOT NULL,
        email_send_id TEXT,
        lead_id TEXT,
        event_type TEXT NOT NULL,
        outcome TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('brain.effectiveness_log created');

    // ─── 5. BDR chat history for conversation memory ───────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS bdr.chat_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT,
        message_count INT DEFAULT 0,
        last_message_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('bdr.chat_sessions created');

    await query(`
      CREATE TABLE IF NOT EXISTS bdr.chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES bdr.chat_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        tool_calls JSONB,
        tool_results JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('bdr.chat_messages created');

    await query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON bdr.chat_messages(session_id, created_at)
    `);
    results.push('chat_messages index created');

    // ─── 6. Prompt templates ───────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS bdr.prompt_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category TEXT NOT NULL DEFAULT 'general',
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        icon TEXT DEFAULT 'MessageSquare',
        sort_order INT DEFAULT 0,
        usage_count INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('bdr.prompt_templates created');

    // ─── 7. Morning briefings cache ────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS bdr.briefings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        briefing_date DATE NOT NULL UNIQUE,
        content TEXT NOT NULL,
        data JSONB DEFAULT '{}',
        generated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('bdr.briefings created');

    // ─── 8. Add effectiveness_score to internal_content if missing ─────
    try {
      await query(`
        ALTER TABLE brain.internal_content
        ADD COLUMN IF NOT EXISTS effectiveness_score NUMERIC(5,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS usage_in_emails INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS usage_in_replies INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
        ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'
      `);
      results.push('internal_content columns added');
    } catch (e) {
      // Columns may already exist
      results.push(`internal_content columns: ${e instanceof Error ? e.message : 'skipped'}`);
    }

    // ─── 9. Seed default prompt templates ──────────────────────────────
    const templateCount = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM bdr.prompt_templates`
    );

    if (parseInt(templateCount[0]?.count || '0') === 0) {
      await query(`
        INSERT INTO bdr.prompt_templates (category, title, prompt, icon, sort_order) VALUES
        ('performance', 'Campaign Performance', 'How are my campaigns performing? Show open rates, reply rates, and which angles are working best.', 'BarChart3', 1),
        ('leads', 'Hot Leads Today', 'Which leads should I prioritize today? Look for high engagement signals, recent opens, and positive replies.', 'Flame', 2),
        ('strategy', 'Email Strategy', 'Based on what''s working, what angle and tone should I use for my next batch of cold emails?', 'Lightbulb', 3),
        ('replies', 'Reply Drafting', 'Show me recent replies that need my attention and suggest responses for each.', 'Reply', 4),
        ('pipeline', 'Pipeline Overview', 'Give me a summary of my current pipeline — how many leads at each stage and what actions are needed?', 'Kanban', 5),
        ('brain', 'Brain Health', 'What does our Knowledge Brain know? Are there gaps in our sales intelligence we should fill?', 'Brain', 6),
        ('objections', 'Handle Objection', 'A prospect says they''re happy with DoorDash/UberEats. What''s the best way to handle this objection?', 'Shield', 7),
        ('generate', 'Generate Email', 'Generate a cold email for a pizza restaurant in Austin, TX using the commission_savings angle.', 'Mail', 8)
      `);
      results.push('Default prompt templates seeded');
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('[brain/migrate] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Migration failed', results },
      { status: 500 }
    );
  }
}

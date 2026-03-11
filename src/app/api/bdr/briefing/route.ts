import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

/**
 * GET /api/bdr/briefing
 * Generate or retrieve today's morning briefing.
 */
export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Check if we already have today's briefing
    const existing = await query<{ content: string; data: Record<string, unknown> }>(
      `SELECT content, data FROM bdr.briefings WHERE briefing_date = $1 LIMIT 1`,
      [today]
    ).catch(() => []);

    if (existing.length > 0) {
      return NextResponse.json({
        briefing: existing[0].content,
        data: existing[0].data,
        date: today,
        cached: true,
      });
    }

    // Gather all data for the briefing
    const [
      newReplies,
      hotLeads,
      pendingEmails,
      emailStats24h,
      pipelineChanges,
      upcomingCampaigns,
      topAngles,
    ] = await Promise.all([
      // New replies in last 24h
      query<Record<string, unknown>>(`
        SELECT l.business_name, l.contact_name, l.reply_sentiment, l.reply_summary,
               l.reply_date::text, l.tier, l.contact_email
        FROM bdr.leads l
        WHERE l.has_replied = true
          AND l.reply_date >= NOW() - INTERVAL '24 hours'
        ORDER BY l.reply_date DESC
        LIMIT 10
      `).catch(() => []),

      // Hot leads (multiple opens, recent engagement)
      query<Record<string, unknown>>(`
        SELECT l.business_name, l.contact_name, l.contact_email, l.tier, l.status,
               e.open_count, e.sent_at::text
        FROM bdr.leads l
        JOIN bdr.email_sends e ON e.lead_id = l.id::text
        WHERE e.open_count >= 3
          AND e.sent_at >= NOW() - INTERVAL '48 hours'
          AND NOT l.has_replied
        ORDER BY e.open_count DESC
        LIMIT 10
      `).catch(() => []),

      // Emails pending approval
      query<{ count: string }>(`
        SELECT COUNT(*)::text as count
        FROM bdr.leads
        WHERE status = 'email_ready' AND email_subject IS NOT NULL
      `).catch(() => [{ count: '0' }]),

      // Email performance last 24h
      query<Record<string, string>>(`
        SELECT
          COUNT(*)::text as sent,
          COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opened,
          COUNT(CASE WHEN replied THEN 1 END)::text as replied
        FROM bdr.email_sends
        WHERE sent_at >= NOW() - INTERVAL '24 hours'
      `).catch(() => [{ sent: '0', opened: '0', replied: '0' }]),

      // Pipeline changes (new leads added recently)
      query<Record<string, unknown>>(`
        SELECT status, COUNT(*)::int as count
        FROM bdr.leads
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY status
      `).catch(() => []),

      // Campaigns with emails ready to send
      query<Record<string, unknown>>(`
        SELECT c.name, COUNT(ce.id)::int as email_count
        FROM bdr.campaigns c
        JOIN bdr.campaign_emails ce ON ce.campaign_id = c.id
        WHERE ce.status = 'pending'
        GROUP BY c.name
        ORDER BY email_count DESC
        LIMIT 5
      `).catch(() => []),

      // Top performing angles
      query<Record<string, unknown>>(`
        SELECT angle,
               COUNT(*) as total,
               COUNT(CASE WHEN open_count > 0 THEN 1 END) as opens,
               COUNT(CASE WHEN replied THEN 1 END) as replies,
               ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as reply_rate
        FROM bdr.email_sends
        WHERE angle IS NOT NULL AND sent_at >= NOW() - INTERVAL '7 days'
        GROUP BY angle
        ORDER BY reply_rate DESC
      `).catch(() => []),
    ]);

    const briefingData = {
      newReplies,
      hotLeads,
      pendingEmails: parseInt(pendingEmails[0]?.count || '0'),
      emailStats24h: emailStats24h[0] || {},
      pipelineChanges,
      upcomingCampaigns,
      topAngles,
    };

    // Generate briefing with Claude
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: `You are the morning briefing generator for Shipday Sales Hub. Create a concise, actionable morning briefing for Mike. Use markdown formatting. Include sections:

1. **Priority Actions** — What needs attention RIGHT NOW (replies to respond to, hot leads to call)
2. **Pipeline Pulse** — Quick snapshot of activity (emails sent, opens, replies in last 24h)
3. **Hot Leads** — Leads showing high engagement that should be prioritized
4. **Campaign Status** — Any campaigns ready to send or needing review
5. **What's Working** — Top performing angles/approaches this week

Be concise. Use bullet points. Highlight urgency with specific numbers. If there are replies needing response, put those FIRST.`,
      messages: [{
        role: 'user',
        content: `Generate today's morning briefing from this data:\n\n${JSON.stringify(briefingData, null, 2)}`,
      }],
    });

    const briefingContent = response.content[0].type === 'text' ? response.content[0].text : 'No briefing generated.';

    // Cache the briefing
    await query(
      `INSERT INTO bdr.briefings (briefing_date, content, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (briefing_date) DO UPDATE SET content = $2, data = $3, generated_at = NOW()`,
      [today, briefingContent, JSON.stringify(briefingData)]
    ).catch(() => {}); // Don't fail if caching fails

    return NextResponse.json({
      briefing: briefingContent,
      data: briefingData,
      date: today,
      cached: false,
    });
  } catch (error) {
    console.error('[bdr/briefing] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Briefing failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bdr/briefing
 * Force regenerate today's briefing (clears cache).
 */
export async function POST() {
  try {
    const today = new Date().toISOString().split('T')[0];
    await query(`DELETE FROM bdr.briefings WHERE briefing_date = $1`, [today]).catch(() => {});

    // Delegate to GET handler logic by calling it through fetch
    // Instead, we'll just delete the cache and the next GET will regenerate
    return NextResponse.json({ success: true, message: 'Briefing cache cleared. Refresh to regenerate.' });
  } catch (error) {
    console.error('[bdr/briefing] POST error:', error);
    return NextResponse.json({ error: 'Failed to clear briefing cache' }, { status: 500 });
  }
}

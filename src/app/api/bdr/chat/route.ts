import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

// ─── Tool Definitions ─────────────────────────────────────────────────────

const BDR_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'generate_email',
    description: 'Generate a cold outreach email for a lead. Requires business name and angle.',
    input_schema: {
      type: 'object' as const,
      properties: {
        business_name: { type: 'string', description: 'Name of the restaurant or business' },
        contact_name: { type: 'string', description: 'Contact person name' },
        city: { type: 'string', description: 'City location' },
        state: { type: 'string', description: 'State' },
        cuisine_type: { type: 'string', description: 'Type of cuisine' },
        angle: {
          type: 'string',
          enum: ['missed_calls', 'commission_savings', 'delivery_ops', 'tech_consolidation', 'customer_experience'],
          description: 'Email angle to use',
        },
        tone: { type: 'string', description: 'Tone: casual, professional, urgent' },
        instructions: { type: 'string', description: 'Additional instructions for the email' },
      },
      required: ['business_name', 'angle'],
    },
  },
  {
    name: 'lookup_lead',
    description: 'Look up details about a specific lead by name or email.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Business name or email to search for' },
      },
      required: ['search'],
    },
  },
  {
    name: 'get_pipeline_stats',
    description: 'Get current pipeline statistics including leads by status, email performance, and angle breakdown.',
    input_schema: {
      type: 'object' as const,
      properties: {
        timeframe: { type: 'string', description: 'Timeframe: today, week, month, all' },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_replies',
    description: 'Get recent email replies from prospects.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Number of replies to return' },
        sentiment: { type: 'string', description: 'Filter by sentiment: positive, negative, neutral' },
      },
      required: [],
    },
  },
  {
    name: 'get_hot_leads',
    description: 'Get leads with high engagement signals (multiple opens, clicks).',
    input_schema: {
      type: 'object' as const,
      properties: {
        min_opens: { type: 'number', description: 'Minimum open count to qualify as hot' },
      },
      required: [],
    },
  },
  {
    name: 'search_brain',
    description: 'Search the Knowledge Brain for sales intelligence, winning phrases, objection handling, or product knowledge.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search term' },
        content_type: { type: 'string', description: 'Filter by type: winning_phrases, objections, product_knowledge, competitor_intel, etc.' },
      },
      required: ['search'],
    },
  },
  {
    name: 'get_campaign_performance',
    description: 'Get performance metrics for email campaigns including open rates, reply rates, and angle performance.',
    input_schema: {
      type: 'object' as const,
      properties: {
        angle: { type: 'string', description: 'Filter by specific angle' },
        days: { type: 'number', description: 'Number of days to look back' },
      },
      required: [],
    },
  },
  {
    name: 'draft_reply',
    description: 'Draft a reply to a prospect who responded to our outreach.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prospect_name: { type: 'string', description: 'Prospect name' },
        business_name: { type: 'string', description: 'Business name' },
        their_reply: { type: 'string', description: 'What the prospect said' },
        context: { type: 'string', description: 'Additional context about the lead or situation' },
      },
      required: ['prospect_name', 'their_reply'],
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'generate_email': {
      const { generateEmail, loadEmailBrainContext } = await import('@/lib/ai');
      const brainCtx = await loadEmailBrainContext();
      const result = await generateEmail(
        {
          business_name: input.business_name as string,
          contact_name: (input.contact_name as string) || 'there',
          city: input.city as string,
          state: input.state as string,
          cuisine_type: input.cuisine_type as string,
          angle: input.angle as string,
          tone: input.tone as string,
          instructions: input.instructions as string,
        },
        brainCtx
      );
      return `**Generated Email:**\n\n**Subject:** ${result.subject}\n\n${result.body}`;
    }

    case 'lookup_lead': {
      const search = `%${input.search}%`;
      const leads = await query<Record<string, unknown>>(
        `SELECT id::text, business_name, contact_name, contact_email, status, tier,
                city, state, cuisine_type, has_replied, reply_sentiment,
                google_rating, created_at::text
         FROM bdr.leads
         WHERE business_name ILIKE $1 OR contact_email ILIKE $1 OR contact_name ILIKE $1
         LIMIT 5`,
        [search]
      );
      if (leads.length === 0) return 'No leads found matching that search.';

      const emailHistory = await query<Record<string, unknown>>(
        `SELECT subject, open_count, replied, angle, sent_at::text
         FROM bdr.email_sends
         WHERE lead_id = $1
         ORDER BY sent_at DESC LIMIT 5`,
        [leads[0].id]
      ).catch(() => []);

      return `**Lead Found:**\n${JSON.stringify(leads[0], null, 2)}\n\n**Email History:**\n${JSON.stringify(emailHistory, null, 2)}`;
    }

    case 'get_pipeline_stats': {
      const [pipeline, emailStats, anglePerf] = await Promise.all([
        query<Record<string, unknown>>(
          `SELECT status, COUNT(*)::int as count FROM bdr.leads GROUP BY status ORDER BY count DESC`
        ),
        query<Record<string, string>>(`
          SELECT
            COUNT(*)::text as total_sent,
            COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opened,
            COUNT(CASE WHEN replied THEN 1 END)::text as replied,
            ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as open_rate,
            ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::text as reply_rate
          FROM bdr.email_sends
        `),
        query<Record<string, unknown>>(`
          SELECT angle, COUNT(*) as sent,
            COUNT(CASE WHEN open_count > 0 THEN 1 END) as opens,
            COUNT(CASE WHEN replied THEN 1 END) as replies,
            ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as reply_rate
          FROM bdr.email_sends WHERE angle IS NOT NULL GROUP BY angle ORDER BY reply_rate DESC
        `),
      ]);

      return `**Pipeline:**\n${JSON.stringify(pipeline, null, 2)}\n\n**Email Performance:**\n${JSON.stringify(emailStats[0], null, 2)}\n\n**Angle Performance:**\n${JSON.stringify(anglePerf, null, 2)}`;
    }

    case 'get_recent_replies': {
      const limit = (input.limit as number) || 5;
      const conditions = ['l.has_replied = true'];
      const params: unknown[] = [];

      if (input.sentiment) {
        params.push(input.sentiment);
        conditions.push(`l.reply_sentiment = $${params.length}`);
      }

      const replies = await query<Record<string, unknown>>(
        `SELECT l.business_name, l.contact_name, l.reply_sentiment, l.reply_summary,
                l.reply_date::text, l.contact_email, l.tier
         FROM bdr.leads l
         WHERE ${conditions.join(' AND ')}
         ORDER BY l.reply_date DESC LIMIT $${params.length + 1}`,
        [...params, limit]
      );

      return replies.length > 0
        ? `**Recent Replies (${replies.length}):**\n${JSON.stringify(replies, null, 2)}`
        : 'No recent replies found.';
    }

    case 'get_hot_leads': {
      const minOpens = (input.min_opens as number) || 2;
      const hotLeads = await query<Record<string, unknown>>(
        `SELECT l.business_name, l.contact_name, l.contact_email, l.tier, l.status,
                e.open_count, e.subject, e.angle, e.sent_at::text
         FROM bdr.leads l
         JOIN bdr.email_sends e ON e.lead_id = l.id::text
         WHERE e.open_count >= $1
           AND e.sent_at >= NOW() - INTERVAL '7 days'
           AND NOT l.has_replied
         ORDER BY e.open_count DESC
         LIMIT 10`,
        [minOpens]
      );

      return hotLeads.length > 0
        ? `**Hot Leads (${hotLeads.length}):**\n${JSON.stringify(hotLeads, null, 2)}`
        : 'No hot leads found with that engagement level.';
    }

    case 'search_brain': {
      const searchTerm = `%${input.search}%`;
      const conditions = ['is_active = true', '(title ILIKE $1 OR raw_text ILIKE $1)'];
      const params: unknown[] = [searchTerm];

      if (input.content_type) {
        params.push(input.content_type);
        conditions.push(`content_type = $${params.length}`);
      }

      const content = await query<Record<string, unknown>>(
        `SELECT id::text, content_type, title, LEFT(raw_text, 500) as raw_text,
                key_claims, value_props
         FROM brain.internal_content
         WHERE ${conditions.join(' AND ')}
         ORDER BY updated_at DESC LIMIT 5`,
        params
      );

      const patterns = await query<Record<string, unknown>>(
        `SELECT pattern_type, content, confidence
         FROM brain.auto_learned
         WHERE is_active = true AND content ILIKE $1
         ORDER BY confidence DESC LIMIT 5`,
        [searchTerm]
      ).catch(() => []);

      return `**Brain Content:**\n${JSON.stringify(content, null, 2)}${
        patterns.length > 0 ? `\n\n**Learned Patterns:**\n${JSON.stringify(patterns, null, 2)}` : ''
      }`;
    }

    case 'get_campaign_performance': {
      const days = (input.days as number) || 7;
      const params: unknown[] = [days];
      const conditions = [`sent_at >= NOW() - INTERVAL '1 day' * $1`];

      if (input.angle) {
        params.push(input.angle);
        conditions.push(`angle = $${params.length}`);
      }

      const performance = await query<Record<string, unknown>>(
        `SELECT
           angle,
           COUNT(*) as sent,
           COUNT(CASE WHEN open_count > 0 THEN 1 END) as opens,
           COUNT(CASE WHEN replied THEN 1 END) as replies,
           ROUND(COUNT(CASE WHEN open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as open_rate,
           ROUND(COUNT(CASE WHEN replied THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as reply_rate,
           ROUND(AVG(open_count), 1) as avg_opens_per_email
         FROM bdr.email_sends
         WHERE ${conditions.join(' AND ')}
         GROUP BY angle
         ORDER BY reply_rate DESC`,
        params
      );

      return `**Campaign Performance (last ${days} days):**\n${JSON.stringify(performance, null, 2)}`;
    }

    case 'draft_reply': {
      try {
        const { generateReplyResponse } = await import('@/lib/ai');
        const result = await generateReplyResponse({
          business_name: (input.business_name as string) || '',
          contact_name: (input.prospect_name as string) || '',
          reply_snippet: (input.their_reply as string) || '',
        });
        return `**Draft Reply:**\n\n**Subject:** ${result.subject}\n\n${result.body}\n\n*Sentiment: ${result.sentiment} | Summary: ${result.summary}*`;
      } catch {
        const replyResponse = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 500,
          system: 'You are Mike from Shipday, replying to a prospect. Be warm, helpful, and move toward booking a demo. Keep it under 100 words.',
          messages: [{
            role: 'user',
            content: `Draft a reply to ${input.prospect_name}${input.business_name ? ` from ${input.business_name}` : ''} who said: "${input.their_reply}"${input.context ? `\n\nContext: ${input.context}` : ''}`,
          }],
        });
        const text = replyResponse.content[0].type === 'text' ? replyResponse.content[0].text : '';
        return `**Draft Reply:**\n\n${text}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Chat Endpoint ────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history = [], session_id } = body;

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    // Build quick context summary
    const [pipelineSummary, emailSummary, pendingCount] = await Promise.all([
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text as count FROM bdr.leads GROUP BY status ORDER BY count DESC`
      ).catch(() => []),
      query<Record<string, string>>(`
        SELECT
          COUNT(*)::text as total_sent,
          COUNT(CASE WHEN open_count > 0 THEN 1 END)::text as opened,
          COUNT(CASE WHEN replied THEN 1 END)::text as replied
        FROM bdr.email_sends
      `).catch(() => [{}]),
      query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM bdr.leads WHERE status = 'email_ready' AND email_subject IS NOT NULL`
      ).catch(() => [{ count: '0' }]),
    ]);

    const systemPrompt = `You are the AI BDR Assistant for Shipday Sales Hub. You help Mike manage his AI-powered cold outreach pipeline for Shipday, a delivery management platform for restaurants.

## Your Capabilities
You have access to tools that let you take REAL actions:
- **generate_email** — Generate cold outreach emails
- **lookup_lead** — Search for specific leads and their email history
- **get_pipeline_stats** — Get detailed pipeline and email performance data
- **get_recent_replies** — Find recent prospect replies
- **get_hot_leads** — Identify leads with high engagement
- **search_brain** — Search sales intelligence, winning phrases, objection handling
- **get_campaign_performance** — Analyze angle/campaign effectiveness
- **draft_reply** — Draft responses to prospect replies

## Quick Context
Pipeline: ${JSON.stringify(pipelineSummary)}
Email totals: ${JSON.stringify(emailSummary[0])}
Pending approval: ${pendingCount[0]?.count || 0} emails

## About Shipday
Delivery management platform for restaurants. Key angles: commission_savings, missed_calls, delivery_ops, tech_consolidation, customer_experience. Pricing tiers: $99 Elite, $159 AI Lite, $349 Unlimited.

## Response Style
- Use tools proactively when they can provide data to answer the question
- Be concise and data-driven
- Use markdown formatting
- When generating emails or replies, present them clearly formatted
- For ambiguous requests, pick the most helpful interpretation and act`;

    // Build message history for Claude
    const claudeMessages: Anthropic.Messages.MessageParam[] = [
      ...history.slice(-8).map((m: ChatMessage) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // Run tool-calling loop
    let response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: BDR_TOOLS,
      messages: claudeMessages,
    });

    const toolCallResults: Array<{ tool: string; input: Record<string, unknown>; result: string }> = [];

    // Process tool calls (up to 5 iterations)
    let iterations = 0;
    while (response.stop_reason === 'tool_use' && iterations < 5) {
      iterations++;
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
      );

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        try {
          const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });
          toolCallResults.push({
            tool: toolUse.name,
            input: toolUse.input as Record<string, unknown>,
            result,
          });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error: ${err instanceof Error ? err.message : 'Tool execution failed'}`,
            is_error: true,
          });
        }
      }

      // Continue conversation with tool results
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: BDR_TOOLS,
        messages: [
          ...claudeMessages,
          { role: 'assistant' as const, content: response.content },
          { role: 'user' as const, content: toolResults },
        ],
      });
    }

    // Extract final text response
    const textBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
    );
    const reply = textBlocks.map(b => b.text).join('\n') || 'No response generated.';

    // Save to chat history if session exists
    if (session_id) {
      try {
        await query(
          `INSERT INTO bdr.chat_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
          [session_id, message]
        );
        await query(
          `INSERT INTO bdr.chat_messages (session_id, role, content, tool_calls) VALUES ($1, 'assistant', $2, $3)`,
          [session_id, reply, JSON.stringify(toolCallResults.length > 0 ? toolCallResults : null)]
        );
        await query(
          `UPDATE bdr.chat_sessions SET message_count = message_count + 2, last_message_at = NOW() WHERE id = $1`,
          [session_id]
        );
      } catch (e) {
        console.error('[bdr/chat] history save error:', e);
      }
    }

    return NextResponse.json({
      reply,
      tool_calls: toolCallResults.length > 0 ? toolCallResults : undefined,
    });
  } catch (error) {
    console.error('[bdr-chat] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    );
  }
}

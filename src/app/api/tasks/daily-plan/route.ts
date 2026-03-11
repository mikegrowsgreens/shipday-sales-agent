import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/tasks/daily-plan
 * AI generates a prioritized daily action plan
 */
export async function POST() {
  try {
    // Gather all inputs for the daily plan
    const [
      pendingTasks,
      hotLeads,
      recentReplies,
      overdueFollowups,
      todayCallbacks,
      activeSequenceSteps,
      benchmarks,
    ] = await Promise.all([
      // Pending tasks
      query<{
        task_id: number; task_type: string; title: string; priority: number;
        contact_name: string; business_name: string | null; due_at: string | null;
        instructions: string | null;
      }>(`
        SELECT t.task_id, t.task_type, t.title, t.priority, t.due_at, t.instructions,
          COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
          c.business_name
        FROM crm.task_queue t
        JOIN crm.contacts c ON c.contact_id = t.contact_id
        WHERE t.status = 'pending'
          AND (t.snoozed_until IS NULL OR t.snoozed_until <= NOW())
        ORDER BY t.priority ASC, t.due_at ASC NULLS LAST
        LIMIT 30
      `),

      // Hot leads - high engagement score or recent multi-opens
      query<{
        contact_id: number; contact_name: string; business_name: string | null;
        engagement_score: number; lifecycle_stage: string; recent_activity: string;
      }>(`
        SELECT
          c.contact_id,
          COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
          c.business_name,
          c.engagement_score,
          c.lifecycle_stage,
          (SELECT event_type || ' via ' || channel
           FROM crm.touchpoints
           WHERE contact_id = c.contact_id
           ORDER BY occurred_at DESC LIMIT 1) as recent_activity
        FROM crm.contacts c
        WHERE c.engagement_score >= 50
          AND c.lifecycle_stage NOT IN ('won', 'lost')
        ORDER BY c.engagement_score DESC
        LIMIT 10
      `),

      // Recent replies needing response (last 48h)
      query<{
        contact_id: number; contact_name: string; business_name: string | null;
        channel: string; occurred_at: string; body_preview: string | null;
      }>(`
        SELECT
          t.contact_id,
          COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
          c.business_name,
          t.channel,
          t.occurred_at,
          t.body_preview
        FROM crm.touchpoints t
        JOIN crm.contacts c ON c.contact_id = t.contact_id
        WHERE t.event_type IN ('replied', 'reply_received')
          AND t.direction = 'inbound'
          AND t.occurred_at >= NOW() - INTERVAL '48 hours'
        ORDER BY t.occurred_at DESC
        LIMIT 10
      `),

      // Overdue follow-ups
      query<{
        task_id: number; contact_name: string; business_name: string | null;
        title: string; due_at: string;
      }>(`
        SELECT t.task_id, t.title, t.due_at,
          COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
          c.business_name
        FROM crm.task_queue t
        JOIN crm.contacts c ON c.contact_id = t.contact_id
        WHERE t.status = 'pending' AND t.due_at < NOW()
        ORDER BY t.due_at ASC
        LIMIT 10
      `),

      // Scheduled callbacks for today
      query<{
        contact_name: string; business_name: string | null;
        scheduled_at: string; event_name: string | null;
      }>(`
        SELECT
          COALESCE(c.first_name || ' ' || c.last_name, c.first_name, ce.invitee_name, ce.invitee_email) as contact_name,
          c.business_name,
          ce.scheduled_at,
          ce.event_name
        FROM crm.calendly_events ce
        LEFT JOIN crm.contacts c ON c.contact_id = ce.contact_id
        WHERE ce.scheduled_at::date = CURRENT_DATE
          AND ce.cancelled = false
        ORDER BY ce.scheduled_at ASC
      `),

      // Active sequence manual steps due today
      query<{ count: string }>(`
        SELECT COUNT(*)::text as count
        FROM crm.sequence_step_executions sse
        JOIN crm.sequence_steps ss ON ss.step_id = sse.step_id
        WHERE sse.status = 'pending'
          AND ss.step_type IN ('phone', 'linkedin', 'sms', 'manual')
      `),

      // Today's progress against benchmarks
      query<{ metric: string; target: number }>(`
        SELECT metric, target FROM crm.performance_goals WHERE is_active = true
      `),
    ]);

    // Get today's actual counts
    const todayProgress = await query<{ channel: string; cnt: string }>(`
      SELECT channel, COUNT(*)::text as cnt
      FROM crm.touchpoints
      WHERE occurred_at >= CURRENT_DATE
        AND direction = 'outbound'
      GROUP BY channel
    `);

    const todayTasks = await query<{ cnt: string }>(`
      SELECT COUNT(*)::text as cnt FROM crm.task_queue
      WHERE status = 'completed' AND completed_at >= CURRENT_DATE
    `);

    const planContext = {
      pending_tasks: pendingTasks,
      hot_leads: hotLeads,
      recent_replies: recentReplies,
      overdue: overdueFollowups,
      today_callbacks: todayCallbacks,
      manual_steps_pending: parseInt(activeSequenceSteps[0]?.count || '0'),
      benchmarks: benchmarks,
      today_progress: todayProgress,
      tasks_completed_today: parseInt(todayTasks[0]?.cnt || '0'),
    };

    const message = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are Mike's AI sales assistant at Shipday. Generate a prioritized daily action plan based on this data. Be specific and actionable.

Today's Data:
${JSON.stringify(planContext, null, 2)}

Return JSON:
{
  "greeting": "Good morning! Here's your plan...",
  "priority_actions": [
    {
      "priority": 1,
      "type": "reply|call|followup|hot_lead|callback|sequence",
      "title": "Action title",
      "detail": "Why this matters and what to do",
      "contact_name": "Name if applicable",
      "business_name": "Business if applicable",
      "estimated_minutes": 5
    }
  ],
  "daily_targets": [
    { "metric": "Calls", "current": 0, "target": 15, "status": "behind|on_track|ahead" }
  ],
  "time_estimate": "About 3 hours of focused work"
}

Prioritize: 1) Overdue items, 2) Reply to inbound messages, 3) Hot leads, 4) Scheduled callbacks, 5) Sequence tasks, 6) Remaining queue items.
Return 5-10 priority actions max.`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const plan = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Failed to parse plan' };

    return NextResponse.json({ plan, rawData: planContext });
  } catch (error) {
    console.error('[daily-plan] error:', error);
    return NextResponse.json({ error: 'Failed to generate daily plan' }, { status: 500 });
  }
}

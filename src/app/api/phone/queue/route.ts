import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/phone/queue - Prioritized call queue for today
 * Sources: pending call tasks, hot leads (high engagement), sequence-driven calls
 */
export async function GET() {
  try {
    // 1. Pending call tasks (from sequences and manual)
    const taskCalls = await query<{
      source: string;
      task_id: number;
      contact_id: number;
      first_name: string | null;
      last_name: string | null;
      business_name: string | null;
      phone: string | null;
      email: string | null;
      lifecycle_stage: string;
      lead_score: number;
      engagement_score: number;
      title: string;
      instructions: string | null;
      priority: number;
      due_at: string | null;
    }>(`
      SELECT
        'task' as source,
        t.task_id,
        c.contact_id,
        c.first_name, c.last_name, c.business_name,
        c.phone, c.email, c.lifecycle_stage,
        c.lead_score, c.engagement_score,
        t.title, t.instructions, t.priority, t.due_at
      FROM crm.task_queue t
      JOIN crm.contacts c ON c.contact_id = t.contact_id
      WHERE t.task_type = 'call'
        AND t.status IN ('pending', 'in_progress')
        AND c.phone IS NOT NULL
      ORDER BY t.priority ASC, t.due_at ASC NULLS LAST
      LIMIT 30
    `);

    // 2. Hot leads - high engagement contacts without recent calls
    const hotLeads = await query<{
      source: string;
      contact_id: number;
      first_name: string | null;
      last_name: string | null;
      business_name: string | null;
      phone: string | null;
      email: string | null;
      lifecycle_stage: string;
      lead_score: number;
      engagement_score: number;
      reason: string;
    }>(`
      SELECT
        'hot_lead' as source,
        c.contact_id,
        c.first_name, c.last_name, c.business_name,
        c.phone, c.email, c.lifecycle_stage,
        c.lead_score, c.engagement_score,
        CASE
          WHEN c.engagement_score >= 70 THEN 'High engagement score (' || c.engagement_score || ')'
          WHEN c.lead_score >= 80 THEN 'High lead score (' || c.lead_score || ')'
          ELSE 'Engaged prospect'
        END as reason
      FROM crm.contacts c
      WHERE c.phone IS NOT NULL
        AND c.lifecycle_stage IN ('engaged', 'outreach', 'enriched')
        AND (c.engagement_score >= 70 OR c.lead_score >= 80)
        AND c.contact_id NOT IN (
          SELECT contact_id FROM crm.phone_calls
          WHERE created_at >= NOW() - interval '3 days'
        )
        AND c.contact_id NOT IN (
          SELECT contact_id FROM crm.task_queue
          WHERE task_type = 'call' AND status IN ('pending', 'in_progress')
        )
      ORDER BY c.engagement_score DESC, c.lead_score DESC
      LIMIT 10
    `);

    // 3. Recently opened emails without follow-up call
    const emailOpeners = await query<{
      source: string;
      contact_id: number;
      first_name: string | null;
      last_name: string | null;
      business_name: string | null;
      phone: string | null;
      email: string | null;
      lifecycle_stage: string;
      lead_score: number;
      engagement_score: number;
      reason: string;
    }>(`
      SELECT DISTINCT ON (c.contact_id)
        'email_opener' as source,
        c.contact_id,
        c.first_name, c.last_name, c.business_name,
        c.phone, c.email, c.lifecycle_stage,
        c.lead_score, c.engagement_score,
        'Opened email ' || TO_CHAR(tp.occurred_at, 'Mon DD') as reason
      FROM crm.touchpoints tp
      JOIN crm.contacts c ON c.contact_id = tp.contact_id
      WHERE tp.channel = 'email'
        AND tp.event_type IN ('opened', 'clicked')
        AND tp.occurred_at >= NOW() - interval '2 days'
        AND c.phone IS NOT NULL
        AND c.lifecycle_stage IN ('outreach', 'engaged', 'enriched')
        AND c.contact_id NOT IN (
          SELECT contact_id FROM crm.phone_calls
          WHERE created_at >= NOW() - interval '3 days'
        )
        AND c.contact_id NOT IN (
          SELECT contact_id FROM crm.task_queue
          WHERE task_type = 'call' AND status IN ('pending', 'in_progress')
        )
      ORDER BY c.contact_id, tp.occurred_at DESC
      LIMIT 10
    `);

    // Combine and deduplicate by contact_id
    const seen = new Set<number>();
    const queue = [];

    // Tasks first (highest priority)
    for (const item of taskCalls) {
      if (!seen.has(item.contact_id)) {
        seen.add(item.contact_id);
        queue.push(item);
      }
    }

    // Hot leads next
    for (const item of hotLeads) {
      if (!seen.has(item.contact_id)) {
        seen.add(item.contact_id);
        queue.push(item);
      }
    }

    // Email openers last
    for (const item of emailOpeners) {
      if (!seen.has(item.contact_id)) {
        seen.add(item.contact_id);
        queue.push(item);
      }
    }

    return NextResponse.json({
      queue,
      counts: {
        tasks: taskCalls.length,
        hot_leads: hotLeads.length,
        email_openers: emailOpeners.length,
        total: queue.length,
      },
    });
  } catch (error) {
    console.error('[phone/queue] error:', error);
    return NextResponse.json({ error: 'Failed to load call queue' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// GET /api/tasks - List pending tasks with contact info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const taskType = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');

    let whereClause = `t.status = $1`;
    const params: unknown[] = [status];
    let idx = 2;

    if (taskType) {
      whereClause += ` AND t.task_type = $${idx++}`;
      params.push(taskType);
    }

    // Respect snooze
    whereClause += ` AND (t.snoozed_until IS NULL OR t.snoozed_until <= NOW())`;

    params.push(limit);

    const tasks = await query(`
      SELECT
        t.*,
        c.email as contact_email,
        c.phone as contact_phone,
        COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
        c.business_name,
        c.linkedin_url,
        c.lifecycle_stage
      FROM crm.task_queue t
      JOIN crm.contacts c ON c.contact_id = t.contact_id
      WHERE ${whereClause}
      ORDER BY t.priority ASC, t.due_at ASC NULLS LAST
      LIMIT $${idx}
    `, params);

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('[tasks] GET error:', error);
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });
  }
}

// PATCH /api/tasks - Complete/skip a task
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { task_id, status, outcome, notes } = body;

    if (!task_id || !status) {
      return NextResponse.json({ error: 'task_id and status required' }, { status: 400 });
    }

    const task = await queryOne<{
      task_id: number;
      contact_id: number;
      enrollment_id: number | null;
      step_id: number | null;
      task_type: string;
    }>(
      `UPDATE crm.task_queue
       SET status = $1, outcome = $2, completed_at = CASE WHEN $1 IN ('completed','skipped') THEN NOW() ELSE NULL END
       WHERE task_id = $3
       RETURNING *`,
      [status, outcome || notes || null, task_id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Log as touchpoint
    if (status === 'completed') {
      const channel = task.task_type === 'call' ? 'phone' :
                      task.task_type.startsWith('linkedin') ? 'linkedin' :
                      task.task_type === 'sms' ? 'sms' : 'manual';

      await query(
        `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, body_preview, metadata, occurred_at)
         VALUES ($1, $2, $3, 'outbound', 'saleshub', $4, $5, NOW())`,
        [
          task.contact_id,
          channel,
          task.task_type === 'call' ? 'call_completed' : `${task.task_type}_completed`,
          outcome || notes || null,
          JSON.stringify({ task_id: task.task_id, task_type: task.task_type }),
        ]
      );

      // If linked to sequence step, update execution status
      if (task.enrollment_id && task.step_id) {
        await query(
          `UPDATE crm.sequence_step_executions
           SET status = 'completed', executed_at = NOW()
           WHERE enrollment_id = $1 AND step_id = $2 AND status = 'pending'`,
          [task.enrollment_id, task.step_id]
        );
      }
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('[tasks] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

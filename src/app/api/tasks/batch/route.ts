import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/tasks/batch
 * Batch complete or skip multiple tasks
 */
export async function POST(request: NextRequest) {
  const tenant = await requireTenantSession();
  const orgId = tenant.org_id;
  const { task_ids, action, outcome } = await request.json();

  if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
    return NextResponse.json({ error: 'task_ids array required' }, { status: 400 });
  }

  if (!['complete', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'action must be complete or skip' }, { status: 400 });
  }

  const status = action === 'complete' ? 'completed' : 'skipped';

  // Update all tasks
  const placeholders = task_ids.map((_: unknown, i: number) => `$${i + 3}`).join(',');
  const updated = await query(
    `UPDATE crm.task_queue
     SET status = $1, outcome = $2, completed_at = NOW()
     WHERE task_id IN (${placeholders})
     RETURNING task_id, contact_id, task_type, enrollment_id, step_id`,
    [status, outcome || action, ...task_ids]
  );

  // Create touchpoints for completed tasks
  if (action === 'complete') {
    for (const task of updated as Array<{
      task_id: number; contact_id: number; task_type: string;
      enrollment_id: number | null; step_id: number | null;
    }>) {
      const channel = task.task_type === 'call' ? 'phone' :
                      task.task_type.startsWith('linkedin') ? 'linkedin' :
                      task.task_type === 'sms' ? 'sms' : 'manual';

      await query(
        `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, metadata, occurred_at)
         VALUES ($1, $2, $3, 'outbound', 'saleshub', $4, NOW())`,
        [
          task.contact_id,
          channel,
          `${task.task_type}_completed`,
          JSON.stringify({ task_id: task.task_id, batch: true }),
        ]
      );

      // Update sequence step executions if linked
      if (task.enrollment_id && task.step_id) {
        await query(
          `UPDATE crm.sequence_step_executions
           SET status = 'completed', executed_at = NOW()
           WHERE enrollment_id = $1 AND step_id = $2 AND status = 'pending'`,
          [task.enrollment_id, task.step_id]
        );
      }
    }
  }

  return NextResponse.json({
    updated: updated.length,
    action,
  });
}

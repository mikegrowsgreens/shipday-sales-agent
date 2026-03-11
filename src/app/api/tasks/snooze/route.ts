import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * PATCH /api/tasks/snooze
 * Snooze a task for a specified duration
 */
export async function PATCH(request: NextRequest) {
  const { task_id, hours } = await request.json();

  if (!task_id || !hours) {
    return NextResponse.json({ error: 'task_id and hours required' }, { status: 400 });
  }

  const result = await query(
    `UPDATE crm.task_queue
     SET snoozed_until = NOW() + INTERVAL '1 hour' * $1
     WHERE task_id = $2
     RETURNING *`,
    [hours, task_id]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ task: result[0] });
}

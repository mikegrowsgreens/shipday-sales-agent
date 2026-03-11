import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// GET /api/sequences/[id] - Get sequence with steps + enrollment stats + metrics
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sequenceId = parseInt(id);

  const sequence = await queryOne(
    `SELECT * FROM crm.sequences WHERE sequence_id = $1`,
    [sequenceId]
  );

  if (!sequence) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  }

  const steps = await query(
    `SELECT * FROM crm.sequence_steps WHERE sequence_id = $1 ORDER BY step_order`,
    [sequenceId]
  );

  const enrollments = await query(
    `SELECT e.*,
      c.email as contact_email,
      c.first_name, c.last_name,
      c.business_name,
      COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') as contact_name
     FROM crm.sequence_enrollments e
     JOIN crm.contacts c ON c.contact_id = e.contact_id
     WHERE e.sequence_id = $1
     ORDER BY e.created_at DESC
     LIMIT 200`,
    [sequenceId]
  );

  // Try to get step metrics (materialized view may not exist yet)
  let stepMetrics: unknown[] = [];
  try {
    stepMetrics = await query(
      `SELECT * FROM crm.sequence_step_metrics WHERE sequence_id = $1 ORDER BY step_order`,
      [sequenceId]
    );
  } catch {
    // Fallback: compute metrics inline
    stepMetrics = await query(
      `SELECT
        ss.step_id,
        ss.sequence_id,
        ss.step_order,
        ss.step_type,
        ss.branch_condition,
        COUNT(DISTINCT sse.execution_id) as total_executions,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed'))::int as sent_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied'))::int as opened_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'clicked')::int as clicked_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'replied')::int as replied_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'bounced')::int as bounced_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'failed')::int as failed_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'skipped')::int as skipped_count,
        ROUND(
          CASE WHEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed')) > 0
          THEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied'))::NUMERIC /
               COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed'))::NUMERIC * 100
          ELSE 0 END, 1
        )::float as open_rate,
        ROUND(
          CASE WHEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed')) > 0
          THEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'replied')::NUMERIC /
               COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed'))::NUMERIC * 100
          ELSE 0 END, 1
        )::float as reply_rate,
        ROUND(
          CASE WHEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied')) > 0
          THEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'clicked')::NUMERIC /
               COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied'))::NUMERIC * 100
          ELSE 0 END, 1
        )::float as click_rate
      FROM crm.sequence_steps ss
      LEFT JOIN crm.sequence_step_executions sse ON sse.step_id = ss.step_id
      WHERE ss.sequence_id = $1
      GROUP BY ss.step_id, ss.sequence_id, ss.step_order, ss.step_type, ss.branch_condition
      ORDER BY ss.step_order`,
      [sequenceId]
    );
  }

  // Compute analytics summary
  const enrollmentStats = await queryOne<{
    total_enrolled: string;
    active_enrolled: string;
    completed: string;
    replied: string;
    booked: string;
  }>(
    `SELECT
      COUNT(*)::text as total_enrolled,
      COUNT(*) FILTER (WHERE status = 'active')::text as active_enrolled,
      COUNT(*) FILTER (WHERE status = 'completed')::text as completed,
      COUNT(*) FILTER (WHERE status = 'replied')::text as replied,
      COUNT(*) FILTER (WHERE status = 'booked')::text as booked
     FROM crm.sequence_enrollments
     WHERE sequence_id = $1`,
    [sequenceId]
  );

  const analytics = {
    sequence_id: sequenceId,
    total_enrolled: parseInt(enrollmentStats?.total_enrolled || '0'),
    active_enrolled: parseInt(enrollmentStats?.active_enrolled || '0'),
    completed: parseInt(enrollmentStats?.completed || '0'),
    replied: parseInt(enrollmentStats?.replied || '0'),
    booked: parseInt(enrollmentStats?.booked || '0'),
    avg_completion_rate: 0,
    step_metrics: stepMetrics,
  };

  return NextResponse.json({ sequence, steps, enrollments, analytics });
}

// PATCH /api/sequences/[id] - Update sequence fields or steps
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sequenceId = parseInt(id);
  const body = await request.json();

  // Update sequence metadata
  const metaKeys = ['name', 'description', 'is_active', 'pause_on_reply', 'pause_on_booking', 'is_template', 'template_category', 'tags'];
  const metaUpdates = metaKeys.filter(k => body[k] !== undefined);
  if (metaUpdates.length > 0) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const key of metaUpdates) {
      if (key === 'tags') {
        sets.push(`${key} = $${idx++}`);
        vals.push(body[key]);
      } else {
        sets.push(`${key} = $${idx++}`);
        vals.push(body[key]);
      }
    }
    vals.push(sequenceId);
    await query(`UPDATE crm.sequences SET ${sets.join(', ')} WHERE sequence_id = $${idx}`, vals);
  }

  // Replace steps if provided
  if (body.steps && Array.isArray(body.steps)) {
    await query(`DELETE FROM crm.sequence_steps WHERE sequence_id = $1`, [sequenceId]);

    const stepIdMap: Record<number, number> = {};

    for (let i = 0; i < body.steps.length; i++) {
      const step = body.steps[i];
      const result = await queryOne<{ step_id: number }>(
        `INSERT INTO crm.sequence_steps (
          sequence_id, step_order, step_type, delay_days,
          send_window_start, send_window_end,
          subject_template, body_template, task_instructions, variant_label,
          branch_condition, branch_wait_days,
          is_exit_step, exit_action, exit_action_config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING step_id`,
        [
          sequenceId,
          step.step_order || i + 1,
          step.step_type || 'email',
          step.delay_days ?? 0,
          step.send_window_start || '09:00',
          step.send_window_end || '17:00',
          step.subject_template || null,
          step.body_template || null,
          step.task_instructions || null,
          step.variant_label || null,
          step.branch_condition || null,
          step.branch_wait_days ?? 2,
          step.is_exit_step ?? false,
          step.exit_action || null,
          JSON.stringify(step.exit_action_config || {}),
        ]
      );

      if (result) {
        stepIdMap[step.step_order || i + 1] = result.step_id;
      }
    }

    // Update parent_step_id references
    for (let i = 0; i < body.steps.length; i++) {
      const step = body.steps[i];
      if (step.parent_step_order) {
        const parentStepId = stepIdMap[step.parent_step_order];
        const currentStepId = stepIdMap[step.step_order || i + 1];
        if (parentStepId && currentStepId) {
          await query(
            `UPDATE crm.sequence_steps SET parent_step_id = $1 WHERE step_id = $2`,
            [parentStepId, currentStepId]
          );
        }
      }
    }
  }

  const sequence = await queryOne(`SELECT * FROM crm.sequences WHERE sequence_id = $1`, [sequenceId]);
  const steps = await query(`SELECT * FROM crm.sequence_steps WHERE sequence_id = $1 ORDER BY step_order`, [sequenceId]);
  return NextResponse.json({ sequence, steps });
}

// DELETE /api/sequences/[id] - Delete sequence
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sequenceId = parseInt(id);
  await query(`DELETE FROM crm.sequence_step_executions WHERE enrollment_id IN (SELECT enrollment_id FROM crm.sequence_enrollments WHERE sequence_id = $1)`, [sequenceId]);
  await query(`DELETE FROM crm.sequence_enrollments WHERE sequence_id = $1`, [sequenceId]);
  await query(`DELETE FROM crm.sequence_steps WHERE sequence_id = $1`, [sequenceId]);
  await query(`DELETE FROM crm.sequences WHERE sequence_id = $1`, [sequenceId]);
  return NextResponse.json({ deleted: true });
}

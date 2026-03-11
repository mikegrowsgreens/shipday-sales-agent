import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// POST /api/sequences/[id]/clone - Clone a sequence
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sourceId = parseInt(id);
  const body = await request.json().catch(() => ({}));
  const newName = body.name;

  // Get source sequence
  const source = await queryOne<{
    sequence_id: number;
    name: string;
    description: string | null;
    pause_on_reply: boolean;
    pause_on_booking: boolean;
    tags: string[];
  }>(`SELECT * FROM crm.sequences WHERE sequence_id = $1`, [sourceId]);

  if (!source) {
    return NextResponse.json({ error: 'Source sequence not found' }, { status: 404 });
  }

  // Create new sequence
  const cloned = await queryOne<{ sequence_id: number }>(
    `INSERT INTO crm.sequences (name, description, pause_on_reply, pause_on_booking, tags, cloned_from)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      newName || `${source.name} (copy)`,
      source.description,
      source.pause_on_reply,
      source.pause_on_booking,
      source.tags,
      sourceId,
    ]
  );

  if (!cloned) {
    return NextResponse.json({ error: 'Failed to clone' }, { status: 500 });
  }

  // Get source steps
  const sourceSteps = await query<{
    step_id: number;
    step_order: number;
    step_type: string;
    delay_days: number;
    send_window_start: string;
    send_window_end: string;
    subject_template: string | null;
    body_template: string | null;
    task_instructions: string | null;
    variant_label: string | null;
    parent_step_id: number | null;
    branch_condition: string | null;
    branch_wait_days: number;
    is_exit_step: boolean;
    exit_action: string | null;
    exit_action_config: unknown;
  }>(`SELECT * FROM crm.sequence_steps WHERE sequence_id = $1 ORDER BY step_order`, [sourceId]);

  // Clone steps - map old step_ids to new ones
  const stepIdMap: Record<number, number> = {};

  for (const step of sourceSteps) {
    const newStep = await queryOne<{ step_id: number }>(
      `INSERT INTO crm.sequence_steps (
        sequence_id, step_order, step_type, delay_days,
        send_window_start, send_window_end,
        subject_template, body_template, task_instructions, variant_label,
        branch_condition, branch_wait_days,
        is_exit_step, exit_action, exit_action_config
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING step_id`,
      [
        cloned.sequence_id, step.step_order, step.step_type, step.delay_days,
        step.send_window_start, step.send_window_end,
        step.subject_template, step.body_template, step.task_instructions, step.variant_label,
        step.branch_condition, step.branch_wait_days,
        step.is_exit_step, step.exit_action, JSON.stringify(step.exit_action_config || {}),
      ]
    );
    if (newStep) {
      stepIdMap[step.step_id] = newStep.step_id;
    }
  }

  // Update parent_step_id references in cloned steps
  for (const step of sourceSteps) {
    if (step.parent_step_id && stepIdMap[step.parent_step_id] && stepIdMap[step.step_id]) {
      await query(
        `UPDATE crm.sequence_steps SET parent_step_id = $1 WHERE step_id = $2`,
        [stepIdMap[step.parent_step_id], stepIdMap[step.step_id]]
      );
    }
  }

  const result = await queryOne(`SELECT * FROM crm.sequences WHERE sequence_id = $1`, [cloned.sequence_id]);
  const steps = await query(`SELECT * FROM crm.sequence_steps WHERE sequence_id = $1 ORDER BY step_order`, [cloned.sequence_id]);

  return NextResponse.json({ sequence: result, steps }, { status: 201 });
}

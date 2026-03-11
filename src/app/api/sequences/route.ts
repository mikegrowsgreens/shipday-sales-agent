import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// GET /api/sequences - List all sequences with stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isTemplate = searchParams.get('templates') === 'true';
    const category = searchParams.get('category');

    let whereClause = isTemplate ? 'WHERE s.is_template = true' : 'WHERE s.is_template = false';
    const params: unknown[] = [];

    if (category) {
      params.push(category);
      whereClause += ` AND s.template_category = $${params.length}`;
    }

    const sequences = await query(`
      SELECT
        s.*,
        COUNT(DISTINCT se.enrollment_id) FILTER (WHERE se.status = 'active')::text as active_enrollments,
        COUNT(DISTINCT se.enrollment_id)::text as total_enrollments,
        COUNT(DISTINCT ss.step_id)::text as step_count
      FROM crm.sequences s
      LEFT JOIN crm.sequence_enrollments se ON se.sequence_id = s.sequence_id
      LEFT JOIN crm.sequence_steps ss ON ss.sequence_id = s.sequence_id
      ${whereClause}
      GROUP BY s.sequence_id
      ORDER BY s.created_at DESC
    `, params);

    return NextResponse.json({ sequences });
  } catch (error) {
    console.error('[sequences] GET error:', error);
    return NextResponse.json({ error: 'Failed to load sequences' }, { status: 500 });
  }
}

// POST /api/sequences - Create a new sequence with steps
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      steps,
      pause_on_reply = true,
      pause_on_booking = true,
      is_template = false,
      template_category = null,
      tags = [],
      cloned_from = null,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Sequence name is required' }, { status: 400 });
    }

    // Create sequence
    const sequence = await queryOne<{ sequence_id: number }>(
      `INSERT INTO crm.sequences (name, description, pause_on_reply, pause_on_booking, is_template, template_category, tags, cloned_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, description || null, pause_on_reply, pause_on_booking, is_template, template_category, tags, cloned_from]
    );

    if (!sequence) {
      return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
    }

    // Create steps if provided
    if (steps && Array.isArray(steps)) {
      // First pass: insert all steps to get step_ids
      const stepIdMap: Record<number, number> = {}; // step_order -> step_id

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
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
            sequence.sequence_id,
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

      // Second pass: update parent_step_id references
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
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

    // Fetch complete sequence with steps
    const result = await queryOne(
      `SELECT * FROM crm.sequences WHERE sequence_id = $1`,
      [sequence.sequence_id]
    );
    const resultSteps = await query(
      `SELECT * FROM crm.sequence_steps WHERE sequence_id = $1 ORDER BY step_order`,
      [sequence.sequence_id]
    );

    return NextResponse.json({ sequence: result, steps: resultSteps }, { status: 201 });
  } catch (error) {
    console.error('[sequences] POST error:', error);
    return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
  }
}

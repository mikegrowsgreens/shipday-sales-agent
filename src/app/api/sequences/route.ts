import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { withAuth } from '@/lib/route-auth';
import { getOrgPlan, requireResourceLimit } from '@/lib/feature-gate';
import { logAuditEvent } from '@/lib/audit';
import { createSequenceSchema } from '@/lib/validators/sequences';

// GET /api/sequences - List all sequences with stats
export const GET = withAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = new URL(request.url);
    const isTemplate = searchParams.get('templates') === 'true';
    const category = searchParams.get('category');

    let whereClause = isTemplate
      ? 'WHERE s.is_template = true AND s.org_id = $1'
      : 'WHERE s.is_template = false AND s.org_id = $1';
    const params: unknown[] = [orgId];

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
});

// POST /api/sequences - Create a new sequence with steps
export const POST = withAuth(async (request, { tenant, orgId }) => {
  try {
    const plan = await getOrgPlan(orgId);
    await requireResourceLimit(orgId, plan, 'maxSequences', 'crm.sequences');

    const body = await request.json();
    const parsed = createSequenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const {
      name, description, steps, pause_on_reply, pause_on_booking,
      is_template, template_category, tags, cloned_from,
    } = parsed.data;

    const sequence = await queryOne<{ sequence_id: number }>(
      `INSERT INTO crm.sequences (org_id, name, description, pause_on_reply, pause_on_booking, is_template, template_category, tags, cloned_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [orgId, name, description || null, pause_on_reply, pause_on_booking, is_template, template_category, tags, cloned_from]
    );

    if (!sequence) {
      return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
    }

    if (steps && Array.isArray(steps)) {
      const stepIdMap: Record<number, number> = {};

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
            sequence.sequence_id, step.step_order || i + 1, step.step_type || 'email',
            step.delay_days ?? 0, step.send_window_start || '09:00', step.send_window_end || '17:00',
            step.subject_template || null, step.body_template || null,
            step.task_instructions || null, step.variant_label || null,
            step.branch_condition || null, step.branch_wait_days ?? 2,
            step.is_exit_step ?? false, step.exit_action || null,
            JSON.stringify(step.exit_action_config || {}),
          ]
        );

        if (result) {
          stepIdMap[step.step_order || i + 1] = result.step_id;
        }
      }

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

    const result = await queryOne(
      `SELECT * FROM crm.sequences WHERE sequence_id = $1 AND org_id = $2`,
      [sequence.sequence_id, orgId]
    );
    const resultSteps = await query(
      `SELECT * FROM crm.sequence_steps WHERE sequence_id = $1 ORDER BY step_order`,
      [sequence.sequence_id]
    );

    logAuditEvent({
      orgId: tenant.org_id,
      userId: tenant.user_id,
      action: 'sequence.create',
      resourceType: 'sequence',
      resourceId: String(sequence.sequence_id),
      details: { name, is_template, step_count: steps?.length || 0 },
      request,
    });

    return NextResponse.json({ sequence: result, steps: resultSteps }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[sequences] POST error:', error);
    return NextResponse.json({ error: 'Failed to create sequence' }, { status: 500 });
  }
});

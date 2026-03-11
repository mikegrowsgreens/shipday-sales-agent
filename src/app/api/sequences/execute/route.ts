import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { N8N_WEBHOOK_KEY } from '@/lib/config';

/**
 * POST /api/sequences/execute
 *
 * Called by n8n every 15 minutes. Finds all due sequence steps and returns
 * them as actions for n8n to execute (send email, create call task, trigger
 * LinkedIn action, send SMS).
 *
 * Flow:
 * 1. Find enrollments where next_step_at <= NOW() and status = 'active'
 * 2. For each, get the current step details
 * 3. Create execution records and task queue entries
 * 4. Return the actions for n8n to process
 *
 * Auth: webhook key via x-webhook-key header
 */
export async function POST(request: NextRequest) {
  // Validate webhook key
  const webhookKey = request.headers.get('x-webhook-key');
  if (webhookKey !== N8N_WEBHOOK_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find all due enrollments
    const dueEnrollments = await query<{
      enrollment_id: number;
      contact_id: number;
      sequence_id: number;
      current_step: number;
      contact_email: string;
      contact_phone: string | null;
      contact_name: string;
      business_name: string | null;
      linkedin_url: string | null;
    }>(`
      SELECT
        e.enrollment_id, e.contact_id, e.sequence_id, e.current_step,
        c.email as contact_email,
        c.phone as contact_phone,
        COALESCE(c.first_name || ' ' || c.last_name, c.first_name, c.email) as contact_name,
        c.business_name,
        c.linkedin_url
      FROM crm.sequence_enrollments e
      JOIN crm.contacts c ON c.contact_id = e.contact_id
      WHERE e.status = 'active'
        AND e.next_step_at <= NOW()
      ORDER BY e.next_step_at ASC
      LIMIT 50
    `);

    if (dueEnrollments.length === 0) {
      return NextResponse.json({ actions: [], message: 'No due steps' });
    }

    const actions: Array<{
      action_type: string;
      enrollment_id: number;
      execution_id: number;
      contact_id: number;
      contact_email: string;
      contact_phone: string | null;
      contact_name: string;
      business_name: string | null;
      linkedin_url: string | null;
      step: Record<string, unknown>;
    }> = [];

    for (const enrollment of dueEnrollments) {
      // Get current step
      const step = await queryOne<{
        step_id: number;
        step_type: string;
        delay_days: number;
        subject_template: string | null;
        body_template: string | null;
        task_instructions: string | null;
        send_window_start: string | null;
        send_window_end: string | null;
      }>(`
        SELECT * FROM crm.sequence_steps
        WHERE sequence_id = $1 AND step_order = $2
      `, [enrollment.sequence_id, enrollment.current_step]);

      if (!step) {
        // No more steps — mark enrollment as completed
        await query(
          `UPDATE crm.sequence_enrollments SET status = 'completed', completed_at = NOW() WHERE enrollment_id = $1`,
          [enrollment.enrollment_id]
        );
        continue;
      }

      // Check send window (convert to PST hour)
      const now = new Date();
      const pstHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getHours();
      const startHour = step.send_window_start ? parseInt(step.send_window_start.split(':')[0]) : 9;
      const endHour = step.send_window_end ? parseInt(step.send_window_end.split(':')[0]) : 17;

      if (pstHour < startHour || pstHour >= endHour) {
        // Outside send window — skip this run, n8n will retry in 15 min
        continue;
      }

      // Create execution record
      const execution = await queryOne<{ execution_id: number }>(
        `INSERT INTO crm.sequence_step_executions (enrollment_id, step_id, status)
         VALUES ($1, $2, 'pending')
         RETURNING execution_id`,
        [enrollment.enrollment_id, step.step_id]
      );

      if (!execution) continue;

      // Determine action type
      const actionType = step.step_type; // email, phone, linkedin, sms, manual

      // For phone/linkedin/manual steps, also create a task queue entry
      if (['phone', 'linkedin', 'sms', 'manual'].includes(actionType)) {
        const taskType = actionType === 'phone' ? 'call' :
                         actionType === 'linkedin' ? 'linkedin_message' :
                         actionType === 'sms' ? 'sms' : 'manual';

        await query(
          `INSERT INTO crm.task_queue (contact_id, enrollment_id, step_id, task_type, title, instructions, priority, due_at)
           VALUES ($1, $2, $3, $4, $5, $6, 1, NOW())`,
          [
            enrollment.contact_id,
            enrollment.enrollment_id,
            step.step_id,
            taskType,
            `${actionType.toUpperCase()}: ${enrollment.contact_name} @ ${enrollment.business_name || 'Unknown'}`,
            step.task_instructions || step.body_template || null,
          ]
        );
      }

      // Advance enrollment to next step
      const nextStep = await queryOne<{ step_id: number; delay_days: number }>(
        `SELECT step_id, delay_days FROM crm.sequence_steps
         WHERE sequence_id = $1 AND step_order = $2`,
        [enrollment.sequence_id, enrollment.current_step + 1]
      );

      if (nextStep) {
        await query(
          `UPDATE crm.sequence_enrollments
           SET current_step = current_step + 1, next_step_at = NOW() + INTERVAL '1 day' * $2
           WHERE enrollment_id = $1`,
          [enrollment.enrollment_id, nextStep.delay_days]
        );
      } else {
        // Last step — will complete after execution
        await query(
          `UPDATE crm.sequence_enrollments SET next_step_at = NULL WHERE enrollment_id = $1`,
          [enrollment.enrollment_id]
        );
      }

      actions.push({
        action_type: actionType,
        enrollment_id: enrollment.enrollment_id,
        execution_id: execution.execution_id,
        contact_id: enrollment.contact_id,
        contact_email: enrollment.contact_email,
        contact_phone: enrollment.contact_phone,
        contact_name: enrollment.contact_name,
        business_name: enrollment.business_name,
        linkedin_url: enrollment.linkedin_url,
        step: {
          step_id: step.step_id,
          subject_template: step.subject_template,
          body_template: step.body_template,
          task_instructions: step.task_instructions,
        },
      });
    }

    return NextResponse.json({
      actions,
      processed: actions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sequence-executor] error:', error);
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 });
  }
}

import { query, queryOne } from '@/lib/db';
import { notFound } from 'next/navigation';
import SequenceDetailClient from './SequenceDetailClient';

export default async function SequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sequenceId = parseInt(id);

  const sequence = await queryOne<{
    sequence_id: number;
    name: string;
    description: string | null;
    is_active: boolean;
    pause_on_reply: boolean;
    pause_on_booking: boolean;
    is_template: boolean;
    template_category: string | null;
    tags: string[];
    cloned_from: number | null;
  }>(
    `SELECT * FROM crm.sequences WHERE sequence_id = $1`,
    [sequenceId]
  );

  if (!sequence) notFound();

  const steps = await query<{
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
    exit_action_config: Record<string, unknown>;
  }>(
    `SELECT * FROM crm.sequence_steps WHERE sequence_id = $1 ORDER BY step_order`,
    [sequenceId]
  );

  const enrollments = await query<{
    enrollment_id: number;
    contact_id: number;
    sequence_id: number;
    status: string;
    current_step: number;
    next_step_at: string | null;
    paused_reason: string | null;
    started_at: string;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    email: string | null;
    contact_email: string | null;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
    contact_name: string | null;
  }>(
    `SELECT e.*,
      c.email,
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

  // Step metrics
  let stepMetrics: {
    step_id: number;
    step_order: number;
    step_type: string;
    branch_condition: string | null;
    total_executions: number;
    sent_count: number;
    opened_count: number;
    clicked_count: number;
    replied_count: number;
    bounced_count: number;
    failed_count: number;
    skipped_count: number;
    open_rate: number;
    reply_rate: number;
    click_rate: number;
  }[] = [];

  try {
    stepMetrics = await query(
      `SELECT
        ss.step_id, ss.step_order, ss.step_type, ss.branch_condition,
        COUNT(DISTINCT sse.execution_id)::int as total_executions,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed'))::int as sent_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied'))::int as opened_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'clicked')::int as clicked_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'replied')::int as replied_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'bounced')::int as bounced_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'failed')::int as failed_count,
        COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'skipped')::int as skipped_count,
        COALESCE(ROUND(
          CASE WHEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed')) > 0
          THEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied'))::NUMERIC /
               COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed'))::NUMERIC * 100
          ELSE 0 END, 1
        ), 0)::float as open_rate,
        COALESCE(ROUND(
          CASE WHEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed')) > 0
          THEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'replied')::NUMERIC /
               COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed'))::NUMERIC * 100
          ELSE 0 END, 1
        ), 0)::float as reply_rate,
        COALESCE(ROUND(
          CASE WHEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied')) > 0
          THEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'clicked')::NUMERIC /
               COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied'))::NUMERIC * 100
          ELSE 0 END, 1
        ), 0)::float as click_rate
      FROM crm.sequence_steps ss
      LEFT JOIN crm.sequence_step_executions sse ON sse.step_id = ss.step_id
      WHERE ss.sequence_id = $1
      GROUP BY ss.step_id, ss.step_order, ss.step_type, ss.branch_condition
      ORDER BY ss.step_order`,
      [sequenceId]
    );
  } catch {
    // Metrics computation might fail if table structure differs
  }

  // Enrollment summary
  const enrollmentSummary = {
    total_enrolled: enrollments.length,
    active_enrolled: enrollments.filter(e => e.status === 'active').length,
    completed: enrollments.filter(e => e.status === 'completed').length,
    replied: enrollments.filter(e => e.status === 'replied').length,
    booked: enrollments.filter(e => e.status === 'booked').length,
  };

  return (
    <SequenceDetailClient
      sequence={sequence}
      steps={steps}
      enrollments={enrollments}
      stepMetrics={stepMetrics}
      enrollmentSummary={enrollmentSummary}
    />
  );
}

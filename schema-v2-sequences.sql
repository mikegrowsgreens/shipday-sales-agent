-- ═══════════════════════════════════════════════════════════════════════════════
-- SalesHub Session 6B: Multi-Channel Sequences V2
-- Adds: branching, templates, sequence cloning, analytics support
-- Run against wincall_brain database
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Sequences: add template & clone support ─────────────────────────────────

ALTER TABLE crm.sequences ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm.sequences ADD COLUMN IF NOT EXISTS template_category TEXT;
ALTER TABLE crm.sequences ADD COLUMN IF NOT EXISTS cloned_from INTEGER REFERENCES crm.sequences(sequence_id) ON DELETE SET NULL;
ALTER TABLE crm.sequences ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_sequences_template ON crm.sequences(is_template) WHERE is_template = true;

-- ─── Sequence Steps: add branching support ───────────────────────────────────

-- parent_step_id: which step precedes this one in the flow graph
-- null = root step (first step in sequence)
ALTER TABLE crm.sequence_steps ADD COLUMN IF NOT EXISTS parent_step_id INTEGER REFERENCES crm.sequence_steps(step_id) ON DELETE SET NULL;

-- branch_condition: what engagement signal routes to this step
-- null = default/linear path (no condition)
-- 'opened', 'not_opened', 'replied', 'replied_positive', 'replied_negative',
-- 'bounced', 'clicked', 'no_engagement'
ALTER TABLE crm.sequence_steps ADD COLUMN IF NOT EXISTS branch_condition TEXT;

-- How long to wait for the branch condition before falling through to default
ALTER TABLE crm.sequence_steps ADD COLUMN IF NOT EXISTS branch_wait_days INTEGER NOT NULL DEFAULT 2;

-- Exit step config
ALTER TABLE crm.sequence_steps ADD COLUMN IF NOT EXISTS is_exit_step BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crm.sequence_steps ADD COLUMN IF NOT EXISTS exit_action TEXT; -- 'complete', 'create_task', 'move_to_sequence'
ALTER TABLE crm.sequence_steps ADD COLUMN IF NOT EXISTS exit_action_config JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_steps_parent ON crm.sequence_steps(parent_step_id) WHERE parent_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_steps_branch ON crm.sequence_steps(sequence_id, branch_condition);

-- ─── Sequence Step Executions: add tracking fields ───────────────────────────

ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
ALTER TABLE crm.sequence_step_executions ADD COLUMN IF NOT EXISTS reply_sentiment TEXT; -- 'positive', 'negative', 'neutral'

-- ─── Enrollments: add current_step_id for branching support ─────────────────

ALTER TABLE crm.sequence_enrollments ADD COLUMN IF NOT EXISTS current_step_id INTEGER REFERENCES crm.sequence_steps(step_id) ON DELETE SET NULL;

-- ─── Sequence Analytics Materialized View ───────────────────────────────────
-- Pre-aggregated per-step metrics for fast analytics queries

CREATE MATERIALIZED VIEW IF NOT EXISTS crm.sequence_step_metrics AS
SELECT
  ss.step_id,
  ss.sequence_id,
  ss.step_order,
  ss.step_type,
  ss.branch_condition,
  COUNT(DISTINCT sse.execution_id) as total_executions,
  COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent', 'delivered', 'opened', 'clicked', 'replied', 'completed')) as sent_count,
  COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened', 'clicked', 'replied')) as opened_count,
  COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'clicked') as clicked_count,
  COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'replied') as replied_count,
  COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'bounced') as bounced_count,
  COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'failed') as failed_count,
  COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'skipped') as skipped_count,
  ROUND(
    CASE WHEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed')) > 0
    THEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied'))::NUMERIC /
         COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed'))::NUMERIC * 100
    ELSE 0 END, 1
  ) as open_rate,
  ROUND(
    CASE WHEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed')) > 0
    THEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'replied')::NUMERIC /
         COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('sent','delivered','opened','clicked','replied','completed'))::NUMERIC * 100
    ELSE 0 END, 1
  ) as reply_rate,
  ROUND(
    CASE WHEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied')) > 0
    THEN COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status = 'clicked')::NUMERIC /
         COUNT(DISTINCT sse.execution_id) FILTER (WHERE sse.status IN ('opened','clicked','replied'))::NUMERIC * 100
    ELSE 0 END, 1
  ) as click_rate
FROM crm.sequence_steps ss
LEFT JOIN crm.sequence_step_executions sse ON sse.step_id = ss.step_id
GROUP BY ss.step_id, ss.sequence_id, ss.step_order, ss.step_type, ss.branch_condition;

CREATE UNIQUE INDEX IF NOT EXISTS idx_step_metrics_pk ON crm.sequence_step_metrics(step_id);

-- Function to refresh metrics (call from n8n or cron)
CREATE OR REPLACE FUNCTION crm.refresh_sequence_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY crm.sequence_step_metrics;
END;
$$ LANGUAGE plpgsql;

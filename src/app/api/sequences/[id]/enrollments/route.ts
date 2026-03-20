import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

// PATCH /api/sequences/[id]/enrollments - Bulk enrollment actions (pause/resume/remove)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireTenantSession();
  const orgId = tenant.org_id;

  const { id } = await params;
  const sequenceId = parseInt(id);
  const body = await request.json();
  const { enrollment_ids, action } = body;

  if (!enrollment_ids?.length || !action) {
    return NextResponse.json({ error: 'enrollment_ids and action required' }, { status: 400 });
  }

  const placeholders = enrollment_ids.map((_: number, i: number) => `$${i + 2}`).join(',');
  const orgParamIdx = enrollment_ids.length + 2;

  switch (action) {
    case 'pause':
      await query(
        `UPDATE crm.sequence_enrollments
         SET status = 'paused', paused_reason = 'Manually paused'
         WHERE sequence_id = $1 AND enrollment_id IN (${placeholders}) AND status = 'active' AND org_id = $${orgParamIdx}`,
        [sequenceId, ...enrollment_ids, orgId]
      );
      break;

    case 'resume':
      await query(
        `UPDATE crm.sequence_enrollments
         SET status = 'active', paused_reason = NULL,
             next_step_at = NOW() + INTERVAL '1 hour'
         WHERE sequence_id = $1 AND enrollment_id IN (${placeholders}) AND status = 'paused' AND org_id = $${orgParamIdx}`,
        [sequenceId, ...enrollment_ids, orgId]
      );
      break;

    case 'remove': {
      // Delete executions first — scope by org_id
      const execOrgParamIdx = enrollment_ids.length + 1;
      const execPlaceholders = enrollment_ids.map((_: number, i: number) => `$${i + 1}`).join(',');
      await query(
        `DELETE FROM crm.sequence_step_executions
         WHERE enrollment_id IN (${execPlaceholders}) AND org_id = $${execOrgParamIdx}`,
        [...enrollment_ids, orgId]
      );
      await query(
        `DELETE FROM crm.sequence_enrollments
         WHERE sequence_id = $1 AND enrollment_id IN (${placeholders}) AND org_id = $${orgParamIdx}`,
        [sequenceId, ...enrollment_ids, orgId]
      );
      break;
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  return NextResponse.json({ success: true, action, count: enrollment_ids.length });
}

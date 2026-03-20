import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

// POST /api/contacts/bulk - Bulk actions on contacts
export async function POST(request: NextRequest) {
  const tenant = await requireTenantSession();
  const orgId = tenant.org_id;

  const body = await request.json();
  const { contact_ids, action, value } = body;

  if (!contact_ids?.length || !action) {
    return NextResponse.json({ error: 'Missing contact_ids or action' }, { status: 400 });
  }

  const placeholders = contact_ids.map((_: number, i: number) => `$${i + 1}`).join(',');
  const orgParam = contact_ids.length + 1;

  switch (action) {
    case 'change_stage': {
      if (!value) return NextResponse.json({ error: 'Missing stage value' }, { status: 400 });
      await query(
        `UPDATE crm.contacts SET lifecycle_stage = $${contact_ids.length + 2}
         WHERE contact_id IN (${placeholders}) AND org_id = $${orgParam}`,
        [...contact_ids, orgId, value]
      );
      // Log touchpoint for stage change
      for (const cid of contact_ids) {
        await query(
          `INSERT INTO crm.touchpoints (org_id, contact_id, channel, event_type, direction, source_system, subject, occurred_at)
           VALUES ($1, $2, 'manual', 'stage_change', 'outbound', 'saleshub', $3, NOW())`,
          [orgId, cid, `Stage changed to ${value}`]
        );
      }
      break;
    }
    case 'add_tag': {
      if (!value) return NextResponse.json({ error: 'Missing tag value' }, { status: 400 });
      await query(
        `UPDATE crm.contacts SET tags = array_append(
           CASE WHEN $${contact_ids.length + 2} = ANY(tags) THEN tags ELSE tags END,
           $${contact_ids.length + 2}
         )
         WHERE contact_id IN (${placeholders}) AND NOT ($${contact_ids.length + 2} = ANY(tags)) AND org_id = $${orgParam}`,
        [...contact_ids, orgId, value]
      );
      break;
    }
    case 'remove_tag': {
      if (!value) return NextResponse.json({ error: 'Missing tag value' }, { status: 400 });
      await query(
        `UPDATE crm.contacts SET tags = array_remove(tags, $${contact_ids.length + 2})
         WHERE contact_id IN (${placeholders}) AND org_id = $${orgParam}`,
        [...contact_ids, orgId, value]
      );
      break;
    }
    case 'delete': {
      // Soft concern: only delete contacts with no active enrollments
      await query(
        `DELETE FROM crm.contacts
         WHERE contact_id IN (${placeholders}) AND org_id = $${orgParam}
         AND contact_id NOT IN (
           SELECT contact_id FROM crm.sequence_enrollments WHERE status = 'active' AND org_id = $${orgParam}
         )`,
        [...contact_ids, orgId]
      );
      break;
    }
    case 'enroll_sequence': {
      if (!value) return NextResponse.json({ error: 'Missing sequence_id' }, { status: 400 });
      for (const cid of contact_ids) {
        await query(
          `INSERT INTO crm.sequence_enrollments (org_id, contact_id, sequence_id, status, current_step, started_at)
           VALUES ($1, $2, $3, 'active', 1, NOW())
           ON CONFLICT (contact_id, sequence_id) DO NOTHING`,
          [orgId, cid, value]
        );
      }
      break;
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ success: true, affected: contact_ids.length, action });
}

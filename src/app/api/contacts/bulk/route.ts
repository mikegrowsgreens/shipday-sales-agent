import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// POST /api/contacts/bulk - Bulk actions on contacts
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { contact_ids, action, value } = body;

  if (!contact_ids?.length || !action) {
    return NextResponse.json({ error: 'Missing contact_ids or action' }, { status: 400 });
  }

  const placeholders = contact_ids.map((_: number, i: number) => `$${i + 1}`).join(',');

  switch (action) {
    case 'change_stage': {
      if (!value) return NextResponse.json({ error: 'Missing stage value' }, { status: 400 });
      await query(
        `UPDATE crm.contacts SET lifecycle_stage = $${contact_ids.length + 1}
         WHERE contact_id IN (${placeholders})`,
        [...contact_ids, value]
      );
      // Log touchpoint for stage change
      for (const cid of contact_ids) {
        await query(
          `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, occurred_at)
           VALUES ($1, 'manual', 'stage_change', 'outbound', 'saleshub', $2, NOW())`,
          [cid, `Stage changed to ${value}`]
        );
      }
      break;
    }
    case 'add_tag': {
      if (!value) return NextResponse.json({ error: 'Missing tag value' }, { status: 400 });
      await query(
        `UPDATE crm.contacts SET tags = array_append(
           CASE WHEN $${contact_ids.length + 1} = ANY(tags) THEN tags ELSE tags END,
           $${contact_ids.length + 1}
         )
         WHERE contact_id IN (${placeholders}) AND NOT ($${contact_ids.length + 1} = ANY(tags))`,
        [...contact_ids, value]
      );
      break;
    }
    case 'remove_tag': {
      if (!value) return NextResponse.json({ error: 'Missing tag value' }, { status: 400 });
      await query(
        `UPDATE crm.contacts SET tags = array_remove(tags, $${contact_ids.length + 1})
         WHERE contact_id IN (${placeholders})`,
        [...contact_ids, value]
      );
      break;
    }
    case 'delete': {
      // Soft concern: only delete contacts with no active enrollments
      await query(
        `DELETE FROM crm.contacts
         WHERE contact_id IN (${placeholders})
         AND contact_id NOT IN (
           SELECT contact_id FROM crm.sequence_enrollments WHERE status = 'active'
         )`,
        contact_ids
      );
      break;
    }
    case 'enroll_sequence': {
      if (!value) return NextResponse.json({ error: 'Missing sequence_id' }, { status: 400 });
      for (const cid of contact_ids) {
        await query(
          `INSERT INTO crm.sequence_enrollments (contact_id, sequence_id, status, current_step, started_at)
           VALUES ($1, $2, 'active', 1, NOW())
           ON CONFLICT (contact_id, sequence_id) DO NOTHING`,
          [cid, value]
        );
      }
      break;
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ success: true, affected: contact_ids.length, action });
}

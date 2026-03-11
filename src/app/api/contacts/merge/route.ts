import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Contact } from '@/lib/types';

// POST /api/contacts/merge - Merge two contacts
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { winner_id, loser_id, fields_from_loser } = body;

  if (!winner_id || !loser_id) {
    return NextResponse.json({ error: 'Missing winner_id or loser_id' }, { status: 400 });
  }

  const winner = await queryOne<Contact>(
    `SELECT * FROM crm.contacts WHERE contact_id = $1`, [winner_id]
  );
  const loser = await queryOne<Contact>(
    `SELECT * FROM crm.contacts WHERE contact_id = $1`, [loser_id]
  );

  if (!winner || !loser) {
    return NextResponse.json({ error: 'One or both contacts not found' }, { status: 404 });
  }

  // Save loser snapshot for undo
  await query(
    `INSERT INTO crm.contact_merges (winner_id, loser_id, loser_snapshot, merged_fields)
     VALUES ($1, $2, $3, $4)`,
    [winner_id, loser_id, JSON.stringify(loser), fields_from_loser || []]
  );

  // Apply selected fields from loser to winner
  const mergeableFields = [
    'email', 'phone', 'first_name', 'last_name', 'business_name',
    'title', 'linkedin_url', 'website',
  ];

  if (fields_from_loser?.length) {
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of fields_from_loser) {
      if (mergeableFields.includes(field) && (loser as unknown as Record<string, unknown>)[field]) {
        sets.push(`${field} = $${idx++}`);
        values.push((loser as unknown as Record<string, unknown>)[field]);
      }
    }

    if (sets.length > 0) {
      values.push(winner_id);
      await query(
        `UPDATE crm.contacts SET ${sets.join(', ')} WHERE contact_id = $${idx}`,
        values
      );
    }
  }

  // Merge tags (union)
  const allTags = [...new Set([...(winner.tags || []), ...(loser.tags || [])])];
  await query(
    `UPDATE crm.contacts SET tags = $1 WHERE contact_id = $2`,
    [allTags, winner_id]
  );

  // Use higher scores
  await query(
    `UPDATE crm.contacts SET
       lead_score = GREATEST(lead_score, $1),
       engagement_score = GREATEST(engagement_score, $2)
     WHERE contact_id = $3`,
    [loser.lead_score, loser.engagement_score, winner_id]
  );

  // Transfer all touchpoints to winner
  await query(
    `UPDATE crm.touchpoints SET contact_id = $1 WHERE contact_id = $2`,
    [winner_id, loser_id]
  );

  // Transfer enrollments (skip conflicts)
  await query(
    `UPDATE crm.sequence_enrollments SET contact_id = $1
     WHERE contact_id = $2
     AND sequence_id NOT IN (SELECT sequence_id FROM crm.sequence_enrollments WHERE contact_id = $1)`,
    [winner_id, loser_id]
  );

  // Transfer tasks
  await query(
    `UPDATE crm.task_queue SET contact_id = $1 WHERE contact_id = $2`,
    [winner_id, loser_id]
  );

  // Transfer calendly events
  await query(
    `UPDATE crm.calendly_events SET contact_id = $1 WHERE contact_id = $2`,
    [winner_id, loser_id]
  );

  // Transfer source system links
  if (loser.bdr_lead_id && !winner.bdr_lead_id) {
    await query(`UPDATE crm.contacts SET bdr_lead_id = $1 WHERE contact_id = $2`, [loser.bdr_lead_id, winner_id]);
  }
  if (loser.shipday_deal_id && !winner.shipday_deal_id) {
    await query(`UPDATE crm.contacts SET shipday_deal_id = $1 WHERE contact_id = $2`, [loser.shipday_deal_id, winner_id]);
  }
  if (loser.wincall_deal_id && !winner.wincall_deal_id) {
    await query(`UPDATE crm.contacts SET wincall_deal_id = $1 WHERE contact_id = $2`, [loser.wincall_deal_id, winner_id]);
  }
  if (loser.li_prospect_id && !winner.li_prospect_id) {
    await query(`UPDATE crm.contacts SET li_prospect_id = $1 WHERE contact_id = $2`, [loser.li_prospect_id, winner_id]);
  }

  // Delete loser
  await query(`DELETE FROM crm.contacts WHERE contact_id = $1`, [loser_id]);

  // Log merge touchpoint
  await query(
    `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, occurred_at)
     VALUES ($1, 'manual', 'contact_merged', 'outbound', 'saleshub', $2, NOW())`,
    [winner_id, `Merged with contact #${loser_id}`]
  );

  // Return updated winner
  const merged = await queryOne<Contact>(
    `SELECT * FROM crm.contacts WHERE contact_id = $1`, [winner_id]
  );

  return NextResponse.json(merged);
}

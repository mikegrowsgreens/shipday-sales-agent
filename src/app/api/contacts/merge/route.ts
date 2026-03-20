import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Contact } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';

// POST /api/contacts/merge - Merge two contacts
export const POST = withAuth(async (request: NextRequest, { orgId }) => {
  const body = await request.json();
  const { winner_id, loser_id, fields_from_loser } = body;

  if (!winner_id || !loser_id) {
    return NextResponse.json({ error: 'Missing winner_id or loser_id' }, { status: 400 });
  }

  const winner = await queryOne<Contact>(
    `SELECT * FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`, [winner_id, orgId]
  );
  const loser = await queryOne<Contact>(
    `SELECT * FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`, [loser_id, orgId]
  );

  if (!winner || !loser) {
    return NextResponse.json({ error: 'One or both contacts not found' }, { status: 404 });
  }

  // Save loser snapshot for undo
  await query(
    `INSERT INTO crm.contact_merges (winner_id, loser_id, loser_snapshot, merged_fields, org_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [winner_id, loser_id, JSON.stringify(loser), fields_from_loser || [], orgId]
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
      values.push(winner_id, orgId);
      await query(
        `UPDATE crm.contacts SET ${sets.join(', ')} WHERE contact_id = $${idx} AND org_id = $${idx + 1}`,
        values
      );
    }
  }

  // Merge tags (union)
  const allTags = [...new Set([...(winner.tags || []), ...(loser.tags || [])])];
  await query(
    `UPDATE crm.contacts SET tags = $1 WHERE contact_id = $2 AND org_id = $3`,
    [allTags, winner_id, orgId]
  );

  // Use higher scores
  await query(
    `UPDATE crm.contacts SET
       lead_score = GREATEST(lead_score, $1),
       engagement_score = GREATEST(engagement_score, $2)
     WHERE contact_id = $3 AND org_id = $4`,
    [loser.lead_score, loser.engagement_score, winner_id, orgId]
  );

  // Transfer all touchpoints to winner
  await query(
    `UPDATE crm.touchpoints SET contact_id = $1 WHERE contact_id = $2 AND org_id = $3`,
    [winner_id, loser_id, orgId]
  );

  // Transfer enrollments (skip conflicts)
  await query(
    `UPDATE crm.sequence_enrollments SET contact_id = $1
     WHERE contact_id = $2 AND org_id = $3
     AND sequence_id NOT IN (SELECT sequence_id FROM crm.sequence_enrollments WHERE contact_id = $1 AND org_id = $3)`,
    [winner_id, loser_id, orgId]
  );

  // Transfer tasks
  await query(
    `UPDATE crm.task_queue SET contact_id = $1 WHERE contact_id = $2 AND org_id = $3`,
    [winner_id, loser_id, orgId]
  );

  // Transfer calendly events
  await query(
    `UPDATE crm.calendly_events SET contact_id = $1 WHERE contact_id = $2 AND org_id = $3`,
    [winner_id, loser_id, orgId]
  );

  // Transfer source system links
  if (loser.bdr_lead_id && !winner.bdr_lead_id) {
    await query(`UPDATE crm.contacts SET bdr_lead_id = $1 WHERE contact_id = $2 AND org_id = $3`, [loser.bdr_lead_id, winner_id, orgId]);
  }
  if (loser.deal_id && !winner.deal_id) {
    await query(`UPDATE crm.contacts SET deal_id = $1 WHERE contact_id = $2 AND org_id = $3`, [loser.deal_id, winner_id, orgId]);
  }
  if (loser.external_deal_id && !winner.external_deal_id) {
    await query(`UPDATE crm.contacts SET external_deal_id = $1 WHERE contact_id = $2 AND org_id = $3`, [loser.external_deal_id, winner_id, orgId]);
  }
  if (loser.li_prospect_id && !winner.li_prospect_id) {
    await query(`UPDATE crm.contacts SET li_prospect_id = $1 WHERE contact_id = $2 AND org_id = $3`, [loser.li_prospect_id, winner_id, orgId]);
  }

  // Delete loser
  await query(`DELETE FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`, [loser_id, orgId]);

  // Log merge touchpoint
  await query(
    `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, occurred_at, org_id)
     VALUES ($1, 'manual', 'contact_merged', 'outbound', 'saleshub', $2, NOW(), $3)`,
    [winner_id, `Merged with contact #${loser_id}`, orgId]
  );

  // Return updated winner
  const merged = await queryOne<Contact>(
    `SELECT * FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`, [winner_id, orgId]
  );

  return NextResponse.json(merged);
});

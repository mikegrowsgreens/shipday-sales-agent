import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Contact, Touchpoint, SequenceEnrollment, Task, CalendlyEvent, LifecycleRule } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';
import { logAuditEvent } from '@/lib/audit';

// GET /api/contacts/[id] - Full contact detail with timeline
export const GET = withAuth(async (request, { tenant, orgId, params }) => {
  try {
    const contactId = parseInt(params?.id || '');
    if (isNaN(contactId)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    const contact = await queryOne<Contact>(
      `SELECT * FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`,
      [contactId, orgId]
    );

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const touchpoints = await query<Touchpoint>(
      `SELECT * FROM crm.touchpoints
       WHERE contact_id = $1 AND org_id = $2
       ORDER BY occurred_at DESC
       LIMIT 100`,
      [contactId, orgId]
    );

    const enrollments = await query<SequenceEnrollment & { sequence_name: string }>(
      `SELECT e.*, s.name as sequence_name
       FROM crm.sequence_enrollments e
       JOIN crm.sequences s ON e.sequence_id = s.sequence_id
       WHERE e.contact_id = $1 AND e.org_id = $2
       ORDER BY e.created_at DESC`,
      [contactId, orgId]
    );

    const tasks = await query<Task>(
      `SELECT * FROM crm.task_queue
       WHERE contact_id = $1 AND org_id = $2 AND status IN ('pending','in_progress')
       ORDER BY priority ASC, due_at ASC`,
      [contactId, orgId]
    );

    const calendlyEvents = await query<CalendlyEvent>(
      `SELECT * FROM crm.calendly_events
       WHERE contact_id = $1
       ORDER BY scheduled_at DESC
       LIMIT 10`,
      [contactId]
    );

    return NextResponse.json({
      contact,
      touchpoints,
      enrollments,
      tasks,
      calendlyEvents,
    });
  } catch (error) {
    console.error('[contacts/id] GET error:', error);
    return NextResponse.json({ error: 'Failed to load contact' }, { status: 500 });
  }
});

// PATCH /api/contacts/[id] - Update contact fields
export const PATCH = withAuth(async (request, { tenant, orgId, params }) => {
  try {
    const contactId = parseInt(params?.id || '');
    if (isNaN(contactId)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    const body = await request.json();
    const allowedFields = [
      'email', 'phone', 'first_name', 'last_name', 'business_name',
      'title', 'linkedin_url', 'website', 'lifecycle_stage',
      'lead_score', 'engagement_score', 'tags', 'metadata',
    ];

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        values.push(body[field]);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const oldContact = await queryOne<Contact>(
      `SELECT * FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`, [contactId, orgId]
    );

    if (!oldContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    values.push(contactId, orgId);
    const contact = await queryOne<Contact>(
      `UPDATE crm.contacts SET ${sets.join(', ')} WHERE contact_id = $${idx} AND org_id = $${idx + 1} RETURNING *`,
      values
    );

    if (body.lifecycle_stage && oldContact.lifecycle_stage !== body.lifecycle_stage) {
      await triggerLifecycleRules(contactId, orgId, oldContact.lifecycle_stage, body.lifecycle_stage);

      await query(
        `INSERT INTO crm.touchpoints (contact_id, org_id, channel, event_type, direction, source_system, subject, occurred_at)
         VALUES ($1, $2, 'manual', 'stage_change', 'outbound', 'saleshub', $3, NOW())`,
        [contactId, orgId, `Stage: ${oldContact.lifecycle_stage} → ${body.lifecycle_stage}`]
      );
    }

    logAuditEvent({
      orgId: tenant.org_id,
      userId: tenant.user_id,
      action: 'contact.update',
      resourceType: 'contact',
      resourceId: String(contactId),
      details: body,
      request,
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error('[contacts/id] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
});

async function triggerLifecycleRules(contactId: number, orgId: number, fromStage: string, toStage: string) {
  try {
    const rules = await query<LifecycleRule>(
      `SELECT * FROM crm.lifecycle_rules
       WHERE from_stage = $1 AND to_stage = $2 AND is_active = TRUE AND org_id = $3`,
      [fromStage, toStage, orgId]
    );

    for (const rule of rules) {
      const config = rule.action_config as Record<string, unknown>;

      switch (rule.action_type) {
        case 'enroll_sequence': {
          const seqId = config.sequence_id;
          if (seqId) {
            await query(
              `INSERT INTO crm.sequence_enrollments (contact_id, sequence_id, org_id, status, current_step, started_at)
               VALUES ($1, $2, $3, 'active', 1, NOW())
               ON CONFLICT (contact_id, sequence_id) DO NOTHING`,
              [contactId, seqId, orgId]
            );
          }
          break;
        }
        case 'create_task': {
          await query(
            `INSERT INTO crm.task_queue (contact_id, org_id, task_type, title, instructions, priority, status, due_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW() + INTERVAL '1 day')`,
            [contactId, orgId, config.task_type || 'manual', config.task_title || `Follow up: ${toStage}`, config.instructions || null, config.priority || 5]
          );
          break;
        }
        case 'add_tag': {
          const tag = config.tag as string;
          if (tag) {
            await query(
              `UPDATE crm.contacts SET tags = array_append(tags, $1)
               WHERE contact_id = $2 AND org_id = $3 AND NOT ($1 = ANY(tags))`,
              [tag, contactId, orgId]
            );
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error('[lifecycle-rules] trigger error:', err);
  }
}

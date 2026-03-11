import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Contact, Touchpoint, SequenceEnrollment, Task, CalendlyEvent, LifecycleRule } from '@/lib/types';

// GET /api/contacts/[id] - Full contact detail with timeline
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contactId = parseInt(id);
    if (isNaN(contactId)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
    }

    const contact = await queryOne<Contact>(
      `SELECT * FROM crm.contacts WHERE contact_id = $1`,
      [contactId]
    );

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Get touchpoint timeline
    const touchpoints = await query<Touchpoint>(
      `SELECT * FROM crm.touchpoints
       WHERE contact_id = $1
       ORDER BY occurred_at DESC
       LIMIT 100`,
      [contactId]
    );

    // Get active sequence enrollments
    const enrollments = await query<SequenceEnrollment & { sequence_name: string }>(
      `SELECT e.*, s.name as sequence_name
       FROM crm.sequence_enrollments e
       JOIN crm.sequences s ON e.sequence_id = s.sequence_id
       WHERE e.contact_id = $1
       ORDER BY e.created_at DESC`,
      [contactId]
    );

    // Get pending/active tasks
    const tasks = await query<Task>(
      `SELECT * FROM crm.task_queue
       WHERE contact_id = $1 AND status IN ('pending','in_progress')
       ORDER BY priority ASC, due_at ASC`,
      [contactId]
    );

    // Get Calendly events
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
}

// PATCH /api/contacts/[id] - Update contact fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contactId = parseInt(id);
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

    // Get current contact for lifecycle change detection
    const oldContact = await queryOne<Contact>(
      `SELECT * FROM crm.contacts WHERE contact_id = $1`, [contactId]
    );

    values.push(contactId);
    const contact = await queryOne<Contact>(
      `UPDATE crm.contacts SET ${sets.join(', ')} WHERE contact_id = $${idx} RETURNING *`,
      values
    );

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Lifecycle automation: trigger rules on stage change
    if (body.lifecycle_stage && oldContact && oldContact.lifecycle_stage !== body.lifecycle_stage) {
      await triggerLifecycleRules(contactId, oldContact.lifecycle_stage, body.lifecycle_stage);

      // Log stage change touchpoint
      await query(
        `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, occurred_at)
         VALUES ($1, 'manual', 'stage_change', 'outbound', 'saleshub', $2, NOW())`,
        [contactId, `Stage: ${oldContact.lifecycle_stage} → ${body.lifecycle_stage}`]
      );
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error('[contacts/id] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
}

// Execute lifecycle automation rules
async function triggerLifecycleRules(contactId: number, fromStage: string, toStage: string) {
  try {
    const rules = await query<LifecycleRule>(
      `SELECT * FROM crm.lifecycle_rules
       WHERE from_stage = $1 AND to_stage = $2 AND is_active = TRUE`,
      [fromStage, toStage]
    );

    for (const rule of rules) {
      const config = rule.action_config as Record<string, unknown>;

      switch (rule.action_type) {
        case 'enroll_sequence': {
          const seqId = config.sequence_id;
          if (seqId) {
            await query(
              `INSERT INTO crm.sequence_enrollments (contact_id, sequence_id, status, current_step, started_at)
               VALUES ($1, $2, 'active', 1, NOW())
               ON CONFLICT (contact_id, sequence_id) DO NOTHING`,
              [contactId, seqId]
            );
          }
          break;
        }
        case 'create_task': {
          await query(
            `INSERT INTO crm.task_queue (contact_id, task_type, title, instructions, priority, status, due_at)
             VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + INTERVAL '1 day')`,
            [
              contactId,
              config.task_type || 'manual',
              config.task_title || `Follow up: ${toStage}`,
              config.instructions || null,
              config.priority || 5,
            ]
          );
          break;
        }
        case 'add_tag': {
          const tag = config.tag as string;
          if (tag) {
            await query(
              `UPDATE crm.contacts SET tags = array_append(tags, $1)
               WHERE contact_id = $2 AND NOT ($1 = ANY(tags))`,
              [tag, contactId]
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

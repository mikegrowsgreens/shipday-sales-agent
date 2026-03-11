import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * POST /api/phone/outcome - Log call outcome and trigger post-call auto-actions
 *
 * Body: { call_id, disposition, notes, duration_seconds? }
 * Dispositions: connected, voicemail, no-answer, busy, wrong-number, meeting-booked
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { call_id, disposition, notes, duration_seconds } = body;

    if (!call_id || !disposition) {
      return NextResponse.json({ error: 'call_id and disposition required' }, { status: 400 });
    }

    const validDispositions = ['connected', 'voicemail', 'no-answer', 'busy', 'wrong-number', 'meeting-booked'];
    if (!validDispositions.includes(disposition)) {
      return NextResponse.json({ error: `Invalid disposition. Must be one of: ${validDispositions.join(', ')}` }, { status: 400 });
    }

    // Update phone call record
    await query(
      `UPDATE crm.phone_calls
       SET disposition = $2,
           notes = COALESCE($3, notes),
           duration_seconds = COALESCE($4, duration_seconds),
           status = 'completed',
           ended_at = COALESCE(ended_at, NOW()),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('disposition_logged_at', NOW()::text)
       WHERE call_id = $1`,
      [call_id, disposition, notes || null, duration_seconds || null]
    );

    // Get contact_id from call
    const callRow = await query<{ contact_id: number; metadata: Record<string, unknown> }>(
      `SELECT contact_id, metadata FROM crm.phone_calls WHERE call_id = $1`,
      [call_id]
    );

    if (callRow.length === 0) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const contactId = callRow[0].contact_id;
    const taskId = (callRow[0].metadata as Record<string, unknown>)?.task_id;

    // Update touchpoint (most recent phone touchpoint for this contact)
    await query(
      `UPDATE crm.touchpoints
       SET event_type = $1,
           body_preview = $2,
           metadata = metadata || jsonb_build_object('disposition', $1, 'notes', $2)
       WHERE touchpoint_id = (
         SELECT touchpoint_id FROM crm.touchpoints
         WHERE contact_id = $3 AND channel = 'phone'
           AND metadata->>'twilio_sid' IS NOT NULL
         ORDER BY occurred_at DESC
         LIMIT 1
       )`,
      [disposition === 'connected' ? 'call_completed' : `call_${disposition}`, notes || '', contactId]
    );

    // If there was a task, complete it
    if (taskId) {
      await query(
        `UPDATE crm.task_queue
         SET status = 'completed',
             outcome = $1,
             completed_at = NOW()
         WHERE task_id = $2`,
        [`${disposition}${notes ? ': ' + notes : ''}`, taskId]
      );
    }

    // ── POST-CALL AUTO-ACTIONS ──
    const autoActions: string[] = [];

    if (disposition === 'voicemail') {
      // Auto-schedule email follow-up in 1 day
      await query(
        `INSERT INTO crm.task_queue (contact_id, task_type, title, instructions, priority, status, due_at)
         VALUES ($1, 'email_review', 'Follow-up email after voicemail', $2, 2, 'pending', NOW() + interval '1 day')`,
        [contactId, `Left voicemail for this contact. Send a follow-up email referencing the voicemail.${notes ? ' Call notes: ' + notes : ''}`]
      );
      autoActions.push('Scheduled email follow-up for tomorrow');
    }

    if (disposition === 'connected' && notes?.toLowerCase().includes('interest')) {
      // Create demo task
      await query(
        `INSERT INTO crm.task_queue (contact_id, task_type, title, instructions, priority, status, due_at)
         VALUES ($1, 'manual', 'Schedule demo - interested on call', $2, 1, 'pending', NOW() + interval '1 day')`,
        [contactId, `Contact showed interest during call. Schedule a demo ASAP.${notes ? ' Call notes: ' + notes : ''}`]
      );
      autoActions.push('Created high-priority demo task');

      // Update lifecycle stage if not already advanced
      await query(
        `UPDATE crm.contacts SET lifecycle_stage = 'engaged', updated_at = NOW()
         WHERE contact_id = $1 AND lifecycle_stage IN ('raw', 'enriched', 'outreach')`,
        [contactId]
      );
    }

    if (disposition === 'meeting-booked') {
      // Update lifecycle stage
      await query(
        `UPDATE crm.contacts SET lifecycle_stage = 'demo_completed', updated_at = NOW()
         WHERE contact_id = $1 AND lifecycle_stage NOT IN ('negotiation', 'won')`,
        [contactId]
      );
      autoActions.push('Updated contact stage to demo_completed');
    }

    if (disposition === 'no-answer') {
      // Schedule retry in 2 days
      await query(
        `INSERT INTO crm.task_queue (contact_id, task_type, title, instructions, priority, status, due_at)
         VALUES ($1, 'call', 'Retry call - no answer', 'Previous call attempt went unanswered. Try again.', 3, 'pending', NOW() + interval '2 days')`,
        [contactId]
      );
      autoActions.push('Scheduled call retry in 2 days');
    }

    if (disposition === 'busy') {
      // Schedule retry in 4 hours
      await query(
        `INSERT INTO crm.task_queue (contact_id, task_type, title, instructions, priority, status, due_at)
         VALUES ($1, 'call', 'Retry call - was busy', 'Contact was busy on previous attempt. Try again.', 3, 'pending', NOW() + interval '4 hours')`,
        [contactId]
      );
      autoActions.push('Scheduled call retry in 4 hours');
    }

    // Bump engagement score
    const scoreBoost = disposition === 'connected' ? 10 : disposition === 'meeting-booked' ? 20 : 3;
    await query(
      `UPDATE crm.contacts SET engagement_score = LEAST(engagement_score + $1, 100), updated_at = NOW()
       WHERE contact_id = $2`,
      [scoreBoost, contactId]
    );

    return NextResponse.json({
      success: true,
      disposition,
      auto_actions: autoActions,
    });
  } catch (error) {
    console.error('[phone/outcome] error:', error);
    return NextResponse.json({ error: 'Failed to log outcome' }, { status: 500 });
  }
}

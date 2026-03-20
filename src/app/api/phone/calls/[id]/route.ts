import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/phone/calls/[id] - Get single call with linked Fathom data
 * PATCH /api/phone/calls/[id] - Update call notes/disposition
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantSession();
    const { id } = await params;
    const callId = parseInt(id);
    if (isNaN(callId)) {
      return NextResponse.json({ error: 'Invalid call ID' }, { status: 400 });
    }

    // Get the phone call with contact info
    const call = await queryOne<Record<string, unknown>>(
      `SELECT
        pc.call_id, pc.contact_id, pc.direction, pc.from_number, pc.to_number,
        pc.twilio_call_sid AS twilio_sid, pc.status, pc.disposition,
        pc.duration_secs AS duration_seconds, pc.recording_url, pc.notes,
        pc.started_at, pc.ended_at, pc.created_at, pc.metadata,
        c.first_name, c.last_name, c.business_name, c.email, c.phone,
        c.lifecycle_stage, c.lead_score, c.engagement_score
      FROM crm.phone_calls pc
      LEFT JOIN crm.contacts c ON c.contact_id = pc.contact_id
      WHERE pc.call_id = $1 AND pc.org_id = $2`,
      [callId, tenant.org_id]
    );

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Try to find linked Fathom call by matching contact + date window
    let fathom = null;
    if (call.contact_id && call.created_at) {
      const fathomResults = await query<Record<string, unknown>>(
        `SELECT
          fc.call_id AS fathom_call_id, fc.title, fc.call_date,
          fc.duration_seconds AS fathom_duration, fc.fathom_url,
          fc.fathom_summary, fc.meeting_summary,
          fc.talk_listen_ratio, fc.question_count, fc.filler_word_count,
          fc.longest_monologue_seconds, fc.call_type, fc.meeting_type,
          fc.action_items, fc.topics_discussed
        FROM public.calls fc
        JOIN crm.contacts c ON c.contact_id = $1
        WHERE fc.org_id = $2
          AND fc.call_date BETWEEN ($3::timestamp - INTERVAL '2 hours') AND ($3::timestamp + INTERVAL '2 hours')
        ORDER BY ABS(EXTRACT(EPOCH FROM (fc.call_date - $3::timestamp)))
        LIMIT 1`,
        [call.contact_id, tenant.org_id, call.created_at]
      );
      if (fathomResults.length > 0) {
        fathom = fathomResults[0];
      }
    }

    return NextResponse.json({ call, fathom });
  } catch (error) {
    console.error('[phone/calls/id] GET error:', error);
    return NextResponse.json({ error: 'Failed to load call detail' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantSession();
    const { id } = await params;
    const callId = parseInt(id);
    if (isNaN(callId)) {
      return NextResponse.json({ error: 'Invalid call ID' }, { status: 400 });
    }

    const body = await request.json();
    const updates: string[] = [];
    const values: unknown[] = [];
    let pi = 1;

    if (body.notes !== undefined) {
      updates.push(`notes = $${pi}`);
      values.push(body.notes);
      pi++;
    }

    if (body.disposition !== undefined) {
      updates.push(`disposition = $${pi}`);
      values.push(body.disposition);
      pi++;
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(callId, tenant.org_id);

    const result = await query(
      `UPDATE crm.phone_calls
       SET ${updates.join(', ')}
       WHERE call_id = $${pi} AND org_id = $${pi + 1}
       RETURNING call_id`,
      values
    );

    if (result.length === 0) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[phone/calls/id] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update call' }, { status: 500 });
  }
}

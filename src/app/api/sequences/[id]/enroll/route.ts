import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// POST /api/sequences/[id]/enroll - Enroll contacts into a sequence
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sequenceId = parseInt(id);
  const body = await request.json();

  // Accept single contact_id or array of contact_ids
  const contactIds: number[] = body.contact_ids
    ? body.contact_ids
    : body.contact_id
    ? [body.contact_id]
    : [];

  if (contactIds.length === 0) {
    return NextResponse.json({ error: 'contact_id or contact_ids required' }, { status: 400 });
  }

  // Verify sequence exists and is active
  const sequence = await queryOne<{ sequence_id: number; is_active: boolean }>(
    `SELECT sequence_id, is_active FROM crm.sequences WHERE sequence_id = $1`,
    [sequenceId]
  );
  if (!sequence) {
    return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
  }

  // Get first step to calculate next_step_at
  const firstStep = await queryOne<{ step_id: number; delay_days: number }>(
    `SELECT step_id, delay_days FROM crm.sequence_steps
     WHERE sequence_id = $1 ORDER BY step_order LIMIT 1`,
    [sequenceId]
  );

  const enrolled: number[] = [];
  const skipped: number[] = [];

  for (const contactId of contactIds) {
    // Check if already enrolled in this sequence (active)
    const existing = await queryOne(
      `SELECT enrollment_id FROM crm.sequence_enrollments
       WHERE contact_id = $1 AND sequence_id = $2 AND status = 'active'`,
      [contactId, sequenceId]
    );
    if (existing) {
      skipped.push(contactId);
      continue;
    }

    // Create enrollment
    await query(
      `INSERT INTO crm.sequence_enrollments (contact_id, sequence_id, status, current_step, next_step_at)
       VALUES ($1, $2, 'active', 1, NOW() + INTERVAL '1 day' * $3)`,
      [contactId, sequenceId, firstStep ? firstStep.delay_days : 0]
    );
    enrolled.push(contactId);
  }

  return NextResponse.json({
    enrolled: enrolled.length,
    skipped: skipped.length,
    enrolled_ids: enrolled,
    skipped_ids: skipped,
  }, { status: 201 });
}

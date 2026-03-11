import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { SavedSegment, SegmentFilters, Contact } from '@/lib/types';

// GET /api/segments - List saved segments
export async function GET() {
  const segments = await query<SavedSegment>(
    `SELECT * FROM crm.saved_segments ORDER BY is_default DESC, name ASC`
  );

  // Update counts
  for (const seg of segments) {
    const where = buildSegmentWhere(seg.filters);
    const result = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM crm.contacts ${where.clause}`,
      where.params
    );
    seg.contact_count = parseInt(result?.count || '0');
  }

  return NextResponse.json(segments);
}

// POST /api/segments - Create a saved segment
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description, filters } = body;

  if (!name || !filters) {
    return NextResponse.json({ error: 'Missing name or filters' }, { status: 400 });
  }

  // Count contacts matching this segment
  const where = buildSegmentWhere(filters);
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM crm.contacts ${where.clause}`,
    where.params
  );

  const segment = await queryOne<SavedSegment>(
    `INSERT INTO crm.saved_segments (name, description, filters, contact_count)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, description || null, JSON.stringify(filters), parseInt(countResult?.count || '0')]
  );

  return NextResponse.json(segment, { status: 201 });
}

// DELETE /api/segments?id=X - Delete a saved segment
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing segment id' }, { status: 400 });

  await query(`DELETE FROM crm.saved_segments WHERE segment_id = $1`, [parseInt(id)]);
  return NextResponse.json({ success: true });
}

// Helper: Build WHERE clause from segment filters
function buildSegmentWhere(filters: SegmentFilters): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.stages?.length) {
    const placeholders = filters.stages.map((_, i) => `$${idx + i}`).join(',');
    conditions.push(`lifecycle_stage IN (${placeholders})`);
    params.push(...filters.stages);
    idx += filters.stages.length;
  }

  if (filters.tags?.length) {
    conditions.push(`tags && $${idx++}`);
    params.push(filters.tags);
  }

  if (filters.search) {
    conditions.push(`(business_name ILIKE $${idx} OR email ILIKE $${idx} OR first_name ILIKE $${idx} OR last_name ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  if (filters.score_min !== undefined) {
    conditions.push(`lead_score >= $${idx++}`);
    params.push(filters.score_min);
  }

  if (filters.score_max !== undefined) {
    conditions.push(`lead_score <= $${idx++}`);
    params.push(filters.score_max);
  }

  if (filters.has_email) {
    conditions.push(`email IS NOT NULL AND email != ''`);
  }

  if (filters.has_phone) {
    conditions.push(`phone IS NOT NULL AND phone != ''`);
  }

  if (filters.created_after) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(filters.created_after);
  }

  if (filters.created_before) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(filters.created_before);
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, params };
}

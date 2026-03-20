import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/brain/learned
 * List auto-learned patterns.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { searchParams } = new URL(request.url);
    const patternType = searchParams.get('pattern_type');

    const conditions = ['is_active = true'];
    const params: unknown[] = [orgId];
    conditions.push(`org_id = $${params.length}`);

    if (patternType) {
      params.push(patternType);
      conditions.push(`pattern_type = $${params.length}`);
    }

    const patterns = await query<{
      id: string;
      source_type: string;
      source_id: string | null;
      pattern_type: string;
      content: string;
      context: Record<string, unknown>;
      confidence: number;
      times_used: number;
      times_successful: number;
      is_active: boolean;
      created_at: string;
    }>(
      `SELECT id::text, source_type, source_id, pattern_type, content,
              context, confidence, times_used, times_successful,
              is_active, created_at::text
       FROM brain.auto_learned
       WHERE ${conditions.join(' AND ')}
       ORDER BY confidence DESC, times_successful DESC
       LIMIT 100`,
      params
    );

    return NextResponse.json({ patterns });
  } catch (error) {
    console.error('[brain/learned] GET error:', error);
    return NextResponse.json({ patterns: [] });
  }
}

/**
 * POST /api/brain/learned
 * Manually add a learned pattern.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();
    const { source_type, source_id, pattern_type, content, context, confidence } = body;

    if (!pattern_type || !content) {
      return NextResponse.json(
        { error: 'pattern_type and content are required' },
        { status: 400 }
      );
    }

    const rows = await query<{ id: string }>(
      `INSERT INTO brain.auto_learned (source_type, source_id, pattern_type, content, context, confidence, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id::text`,
      [
        source_type || 'manual',
        source_id || null,
        pattern_type,
        content,
        JSON.stringify(context || {}),
        confidence || 0.5,
        orgId,
      ]
    );

    return NextResponse.json({ id: rows[0].id, success: true });
  } catch (error) {
    console.error('[brain/learned] POST error:', error);
    return NextResponse.json({ error: 'Failed to create pattern' }, { status: 500 });
  }
}

/**
 * DELETE /api/brain/learned
 * Delete a learned pattern.
 */
export async function DELETE(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await query(`UPDATE brain.auto_learned SET is_active = false WHERE id = $1 AND org_id = $2`, [id, orgId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[brain/learned] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete pattern' }, { status: 500 });
  }
}

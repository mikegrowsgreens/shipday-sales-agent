import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { apiLimiter, checkRateLimit } from '@/lib/rate-limit';
import { createBrainContentSchema, updateBrainContentSchema, deleteBrainContentSchema } from '@/lib/validators/brain';
import crypto from 'crypto';

/**
 * GET /api/brain?section=content|insights|intelligence|all
 * Returns brain data sections.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section') || 'content';

    const result: Record<string, unknown> = {};

    if (section === 'content' || section === 'all') {
      const content = await query<{
        id: string;
        content_type: string;
        title: string;
        raw_text: string | null;
        key_claims: unknown;
        value_props: unknown;
        pain_points_addressed: unknown;
        source_type: string;
        effective_date: string | null;
        stale_after: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id::text, content_type, title, raw_text, key_claims, value_props,
                pain_points_addressed, source_type, effective_date::text, stale_after::text,
                is_active, created_at::text, updated_at::text
         FROM brain.internal_content
         WHERE org_id = $1
         ORDER BY updated_at DESC`,
        [orgId]
      );
      result.content = content;
    }

    if (section === 'insights' || section === 'all') {
      try {
        const insights = await query<Record<string, unknown>>(
          `SELECT id::text, insight_type, title, summary, data::text, created_at::text
           FROM brain.performance_insights
           WHERE org_id = $1
           ORDER BY created_at DESC LIMIT 10`,
          [orgId]
        );
        result.insights = insights;
      } catch { result.insights = []; }
    }

    if (section === 'intelligence' || section === 'all') {
      try {
        const intel = await query<Record<string, unknown>>(
          `SELECT id::text, intel_type, title, summary, source, relevance_score, created_at::text
           FROM brain.external_intelligence
           WHERE org_id = $1
           ORDER BY relevance_score DESC, created_at DESC LIMIT 20`,
          [orgId]
        );
        result.intelligence = intel;
      } catch { result.intelligence = []; }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[brain] error:', error);
    return NextResponse.json({ error: 'Failed to load brain data' }, { status: 500 });
  }
}

/**
 * POST /api/brain
 * Create a new brain content entry.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimitResponse = await checkRateLimit(apiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();

    const parsed = createBrainContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { content_type, title, raw_text, key_claims, value_props, pain_points_addressed, source_type } = parsed.data;

    const contentHash = crypto.createHash('md5').update(`${title}:${raw_text || ''}:${Date.now()}`).digest('hex');

    const rows = await query<{ id: string }>(
      `INSERT INTO brain.internal_content (content_hash, source_type, content_type, title, raw_text, key_claims, value_props, pain_points_addressed, org_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id::text`,
      [
        contentHash,
        source_type || 'manual',
        content_type,
        title,
        raw_text || null,
        JSON.stringify(key_claims || []),
        JSON.stringify(value_props || []),
        JSON.stringify(pain_points_addressed || []),
        orgId,
      ]
    );

    return NextResponse.json({ id: rows[0].id, success: true });
  } catch (error) {
    console.error('[brain POST] error:', error);
    return NextResponse.json({ error: 'Failed to create content' }, { status: 500 });
  }
}

/**
 * PATCH /api/brain
 * Update an existing brain content entry.
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();

    const parsed = updateBrainContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { id, ...updates } = parsed.data;

    const fields: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (updates.title !== undefined) { fields.push(`title = $${pi++}`); params.push(updates.title); }
    if (updates.raw_text !== undefined) { fields.push(`raw_text = $${pi++}`); params.push(updates.raw_text); }
    if (updates.content_type !== undefined) { fields.push(`content_type = $${pi++}`); params.push(updates.content_type); }
    if (updates.key_claims !== undefined) { fields.push(`key_claims = $${pi++}`); params.push(JSON.stringify(updates.key_claims)); }
    if (updates.value_props !== undefined) { fields.push(`value_props = $${pi++}`); params.push(JSON.stringify(updates.value_props)); }
    if (updates.pain_points_addressed !== undefined) { fields.push(`pain_points_addressed = $${pi++}`); params.push(JSON.stringify(updates.pain_points_addressed)); }
    if (updates.is_active !== undefined) { fields.push(`is_active = $${pi++}`); params.push(updates.is_active); }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    params.push(id);
    params.push(orgId);
    await query(
      `UPDATE brain.internal_content SET ${fields.join(', ')} WHERE id = $${pi++} AND org_id = $${pi}`,
      params
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[brain PATCH] error:', error);
    return NextResponse.json({ error: 'Failed to update content' }, { status: 500 });
  }
}

/**
 * DELETE /api/brain
 * Delete a brain content entry.
 */
export async function DELETE(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();

    const parsed = deleteBrainContentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { id } = parsed.data;

    await query(`DELETE FROM brain.internal_content WHERE id = $1 AND org_id = $2`, [id, orgId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[brain DELETE] error:', error);
    return NextResponse.json({ error: 'Failed to delete content' }, { status: 500 });
  }
}

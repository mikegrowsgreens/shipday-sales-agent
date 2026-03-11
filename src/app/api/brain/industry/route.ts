import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/brain/industry?industry=...
 * List industry snippets, optionally filtered by industry.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const industry = searchParams.get('industry');

    const conditions = ['is_active = true'];
    const params: unknown[] = [];

    if (industry) {
      params.push(industry);
      conditions.push(`industry = $${params.length}`);
    }

    const snippets = await query<{
      id: string;
      industry: string;
      category: string;
      title: string;
      content: string;
      usage_count: number;
      effectiveness_score: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id::text, industry, category, title, content,
              usage_count, effectiveness_score, is_active,
              created_at::text, updated_at::text
       FROM brain.industry_snippets
       WHERE ${conditions.join(' AND ')}
       ORDER BY industry, category, sort_order_implicit`,
      params
    ).catch(() =>
      // Fallback if sort_order_implicit doesn't exist
      query(
        `SELECT id::text, industry, category, title, content,
                usage_count, effectiveness_score, is_active,
                created_at::text, updated_at::text
         FROM brain.industry_snippets
         WHERE ${conditions.join(' AND ')}
         ORDER BY industry, category, title`,
        params
      )
    );

    return NextResponse.json({ snippets });
  } catch (error) {
    console.error('[brain/industry] GET error:', error);
    return NextResponse.json({ error: 'Failed to load snippets' }, { status: 500 });
  }
}

/**
 * POST /api/brain/industry
 * Create a new industry snippet.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { industry, category, title, content, variables } = body;

    if (!industry || !title || !content) {
      return NextResponse.json(
        { error: 'industry, title, and content are required' },
        { status: 400 }
      );
    }

    const rows = await query<{ id: string }>(
      `INSERT INTO brain.industry_snippets (industry, category, title, content, variables)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::text`,
      [industry, category || 'general', title, content, JSON.stringify(variables || [])]
    );

    return NextResponse.json({ id: rows[0].id, success: true });
  } catch (error) {
    console.error('[brain/industry] POST error:', error);
    return NextResponse.json({ error: 'Failed to create snippet' }, { status: 500 });
  }
}

/**
 * PATCH /api/brain/industry
 * Update an industry snippet.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (updates.industry !== undefined) { fields.push(`industry = $${pi++}`); params.push(updates.industry); }
    if (updates.category !== undefined) { fields.push(`category = $${pi++}`); params.push(updates.category); }
    if (updates.title !== undefined) { fields.push(`title = $${pi++}`); params.push(updates.title); }
    if (updates.content !== undefined) { fields.push(`content = $${pi++}`); params.push(updates.content); }
    if (updates.is_active !== undefined) { fields.push(`is_active = $${pi++}`); params.push(updates.is_active); }

    fields.push('updated_at = NOW()');

    if (fields.length <= 1) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    params.push(id);
    await query(
      `UPDATE brain.industry_snippets SET ${fields.join(', ')} WHERE id = $${pi}`,
      params
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[brain/industry] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update snippet' }, { status: 500 });
  }
}

/**
 * DELETE /api/brain/industry
 * Delete an industry snippet.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await query(`DELETE FROM brain.industry_snippets WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[brain/industry] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete snippet' }, { status: 500 });
  }
}

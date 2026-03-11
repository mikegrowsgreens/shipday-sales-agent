import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/bdr/templates
 * List prompt templates.
 */
export async function GET() {
  try {
    const templates = await query<{
      id: string;
      category: string;
      title: string;
      prompt: string;
      icon: string;
      sort_order: number;
      usage_count: number;
    }>(
      `SELECT id::text, category, title, prompt, icon, sort_order, usage_count
       FROM bdr.prompt_templates
       WHERE is_active = true
       ORDER BY sort_order, title`
    );

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('[bdr/templates] error:', error);
    return NextResponse.json({ templates: [] });
  }
}

/**
 * POST /api/bdr/templates
 * Create a new prompt template.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, title, prompt, icon, sort_order } = body;

    if (!title || !prompt) {
      return NextResponse.json({ error: 'title and prompt are required' }, { status: 400 });
    }

    const rows = await query<{ id: string }>(
      `INSERT INTO bdr.prompt_templates (category, title, prompt, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id::text`,
      [category || 'general', title, prompt, icon || 'MessageSquare', sort_order || 0]
    );

    return NextResponse.json({ id: rows[0].id, success: true });
  } catch (error) {
    console.error('[bdr/templates] POST error:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}

/**
 * PATCH /api/bdr/templates
 * Track usage of a template.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await query(
      `UPDATE bdr.prompt_templates SET usage_count = usage_count + 1 WHERE id = $1`,
      [id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[bdr/templates] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to track usage' }, { status: 500 });
  }
}

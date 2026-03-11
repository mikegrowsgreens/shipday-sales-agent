import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/brain/tags — List all tags
 */
export async function GET() {
  try {
    const tags = await query<{
      id: string;
      name: string;
      color: string;
      content_count: number;
    }>(
      `SELECT t.id::text, t.name, t.color,
              count(m.content_id)::int as content_count
       FROM brain.content_tags t
       LEFT JOIN brain.content_tag_map m ON m.tag_id = t.id
       GROUP BY t.id, t.name, t.color
       ORDER BY t.name`
    );
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('[brain/tags] GET error:', error);
    return NextResponse.json({ tags: [] });
  }
}

/**
 * POST /api/brain/tags — Create a tag
 */
export async function POST(request: NextRequest) {
  try {
    const { name, color } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const rows = await query<{ id: string }>(
      `INSERT INTO brain.content_tags (name, color)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET color = $2
       RETURNING id::text`,
      [name.trim(), color || 'gray']
    );

    return NextResponse.json({ id: rows[0]?.id, success: true });
  } catch (error) {
    console.error('[brain/tags] POST error:', error);
    return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 });
  }
}

/**
 * PATCH /api/brain/tags — Assign/remove tags from content
 * Body: { content_id, tag_ids: string[], action: 'set' | 'add' | 'remove' }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { content_id, tag_ids, action } = await request.json();
    if (!content_id || !tag_ids) {
      return NextResponse.json({ error: 'content_id and tag_ids are required' }, { status: 400 });
    }

    if (action === 'remove') {
      for (const tagId of tag_ids) {
        await query(
          `DELETE FROM brain.content_tag_map WHERE content_id = $1 AND tag_id = $2`,
          [content_id, tagId]
        );
      }
    } else if (action === 'set') {
      // Replace all tags
      await query(`DELETE FROM brain.content_tag_map WHERE content_id = $1`, [content_id]);
      for (const tagId of tag_ids) {
        await query(
          `INSERT INTO brain.content_tag_map (content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [content_id, tagId]
        );
      }
    } else {
      // Default: add
      for (const tagId of tag_ids) {
        await query(
          `INSERT INTO brain.content_tag_map (content_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [content_id, tagId]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[brain/tags] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update tags' }, { status: 500 });
  }
}

/**
 * DELETE /api/brain/tags — Delete a tag
 */
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    await query(`DELETE FROM brain.content_tag_map WHERE tag_id = $1`, [id]);
    await query(`DELETE FROM brain.content_tags WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[brain/tags] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
  }
}

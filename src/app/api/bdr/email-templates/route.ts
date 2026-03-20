import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * Email Template Library API
 * CRUD for reusable email templates with performance tracking.
 */

// Ensure the table exists
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS bdr.email_templates (
      id SERIAL PRIMARY KEY,
      org_id UUID NOT NULL,
      name VARCHAR(255) NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      angle VARCHAR(100) DEFAULT 'missed_calls',
      tone VARCHAR(50) DEFAULT 'professional',
      tier VARCHAR(50),
      is_starred BOOLEAN DEFAULT false,
      usage_count INTEGER DEFAULT 0,
      avg_open_rate NUMERIC(5,2),
      avg_reply_rate NUMERIC(5,2),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

/**
 * GET /api/bdr/email-templates
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    await ensureTable();

    const templates = await query<{
      id: number;
      name: string;
      subject: string;
      body: string;
      angle: string;
      tone: string;
      tier: string | null;
      is_starred: boolean;
      usage_count: number;
      avg_open_rate: number | null;
      avg_reply_rate: number | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT * FROM bdr.email_templates WHERE org_id = $1 ORDER BY is_starred DESC, updated_at DESC`,
      [orgId]
    );

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('[email-templates GET] error:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

/**
 * POST /api/bdr/email-templates
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    await ensureTable();

    const { name, subject, body, angle, tone, tier } = await request.json();

    if (!name || !subject || !body) {
      return NextResponse.json({ error: 'name, subject, and body required' }, { status: 400 });
    }

    const result = await query<{ id: number }>(
      `INSERT INTO bdr.email_templates (org_id, name, subject, body, angle, tone, tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [orgId, name, subject, body, angle || 'missed_calls', tone || 'professional', tier || null]
    );

    return NextResponse.json({ id: result[0].id, created: true });
  } catch (error) {
    console.error('[email-templates POST] error:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}

/**
 * PUT /api/bdr/email-templates
 */
export async function PUT(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const allowedFields = ['name', 'subject', 'body', 'angle', 'tone', 'tier', 'is_starred'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIdx}`);
        params.push(updates[field]);
        paramIdx++;
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);
    paramIdx++;
    params.push(orgId);

    await query(
      `UPDATE bdr.email_templates SET ${setClauses.join(', ')} WHERE id = $${paramIdx - 1} AND org_id = $${paramIdx}`,
      params
    );

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error('[email-templates PUT] error:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

/**
 * DELETE /api/bdr/email-templates?id=123
 */
export async function DELETE(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }

    await query('DELETE FROM bdr.email_templates WHERE id = $1 AND org_id = $2', [id, orgId]);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('[email-templates DELETE] error:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}

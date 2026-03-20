import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

export async function GET() {
  try {
    const tenant = await requireTenantSession();

    const orgId = tenant.org_id;

    const org = await queryOne<{
      org_id: number;
      name: string;
      slug: string;
      logo_url: string | null;
      domain: string | null;
      settings: Record<string, unknown>;
      plan: string;
      created_at: string;
    }>(
      `SELECT org_id, name, slug, logo_url, domain, settings, plan, created_at::text
       FROM crm.organizations WHERE org_id = $1`,
      [orgId]
    );

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    return NextResponse.json(org);
  } catch (error) {
    console.error('[admin/org] GET error:', error);
    return NextResponse.json({ error: 'Failed to load org' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();

    if (tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const orgId = tenant.org_id;
    const body = await request.json();
    const { name, slug, logo_url, domain, settings } = body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (slug !== undefined) {
      const cleanSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!cleanSlug) {
        return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
      }
      const existing = await queryOne<{ org_id: number }>(
        `SELECT org_id FROM crm.organizations WHERE slug = $1 AND org_id != $2`,
        [cleanSlug, orgId]
      );
      if (existing) {
        return NextResponse.json({ error: 'Slug already in use by another organization' }, { status: 409 });
      }
      updates.push(`slug = $${idx++}`); values.push(cleanSlug);
    }
    if (logo_url !== undefined) { updates.push(`logo_url = $${idx++}`); values.push(logo_url); }
    if (domain !== undefined) { updates.push(`domain = $${idx++}`); values.push(domain); }
    if (settings !== undefined) { updates.push(`settings = settings || $${idx++}::jsonb`); values.push(JSON.stringify(settings)); }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(orgId);

    await query(
      `UPDATE crm.organizations SET ${updates.join(', ')} WHERE org_id = $${idx}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin/org] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update org' }, { status: 500 });
  }
}

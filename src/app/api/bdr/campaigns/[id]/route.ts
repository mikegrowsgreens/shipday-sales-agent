import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * PATCH /api/bdr/campaigns/[id]
 * Archive or restore a campaign template.
 * Body: { action: 'archive' | 'restore' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { id } = await params;
    const templateId = parseInt(id);

    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
    }

    const { action } = await request.json();

    if (!['archive', 'restore'].includes(action)) {
      return NextResponse.json({ error: 'action must be "archive" or "restore"' }, { status: 400 });
    }

    const isActive = action === 'restore';

    const result = await query(
      `UPDATE bdr.campaign_templates
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2 AND org_id = $3
       RETURNING id, name, is_active`,
      [isActive, templateId, orgId]
    );

    if (result.length === 0) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({
      template: result[0],
      message: `Template ${action === 'archive' ? 'archived' : 'restored'} successfully`,
    });
  } catch (error) {
    console.error('[campaigns/id] PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update template' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bdr/campaigns/[id]
 * Clone a campaign template.
 * Body: { action: 'clone', name?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { id } = await params;
    const templateId = parseInt(id);

    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { action, name: customName } = body;

    if (action !== 'clone') {
      return NextResponse.json({ error: 'action must be "clone"' }, { status: 400 });
    }

    // Fetch original template
    const originals = await query<{
      id: number;
      tier: string;
      name: string;
      description: string | null;
      steps: string;
      auto_approve_score_threshold: number | null;
      is_library_template: boolean;
      variant: string | null;
    }>(
      `SELECT id, tier, name, description, steps, auto_approve_score_threshold, is_library_template, variant
       FROM bdr.campaign_templates
       WHERE id = $1 AND org_id = $2`,
      [templateId, orgId]
    );

    if (originals.length === 0) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const original = originals[0];
    const cloneName = customName || `${original.name} (Copy)`;

    // Insert clone - not a library template, not auto-assignable
    const cloned = await query<{ id: number; name: string }>(
      `INSERT INTO bdr.campaign_templates
        (org_id, tier, name, description, steps, auto_approve_score_threshold, is_library_template, variant, auto_assignable)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7, false)
       RETURNING id, name`,
      [
        orgId,
        original.tier,
        cloneName,
        original.description,
        typeof original.steps === 'string' ? original.steps : JSON.stringify(original.steps),
        original.auto_approve_score_threshold,
        original.variant,
      ]
    );

    return NextResponse.json({
      template: cloned[0],
      message: 'Template cloned successfully',
    });
  } catch (error) {
    console.error('[campaigns/id] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clone template' },
      { status: 500 }
    );
  }
}

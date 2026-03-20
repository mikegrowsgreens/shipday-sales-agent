import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgPlan, requireFeature } from '@/lib/feature-gate';

/**
 * POST /api/bdr/campaigns/edit
 * Save manually-edited email subject/body for a BDR lead.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();

    const plan = await getOrgPlan(tenant.org_id);
    requireFeature(plan, 'campaigns');

    const { leadId, subject, body } = await request.json();

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }
    if (!subject && !body) {
      return NextResponse.json({ error: 'subject or body required' }, { status: 400 });
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (subject !== undefined) {
      fields.push(`email_subject = $${pi++}`);
      params.push(subject);
    }
    if (body !== undefined) {
      fields.push(`email_body = $${pi++}`);
      params.push(body);
    }
    fields.push('updated_at = NOW()');

    params.push(leadId);
    params.push(tenant.org_id);

    await query(
      `UPDATE bdr.leads SET ${fields.join(', ')} WHERE lead_id = $${pi} AND org_id = $${pi + 1}`,
      params
    );

    return NextResponse.json({ success: true, leadId });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[bdr/campaigns/edit] error:', error);
    return NextResponse.json({ error: 'Failed to save edit' }, { status: 500 });
  }
}

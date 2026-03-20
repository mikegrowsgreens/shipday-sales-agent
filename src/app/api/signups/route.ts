import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { updateSignupSchema } from '@/lib/validators/settings';

/**
 * GET /api/signups
 * List signups with territory filtering, funnel stage, attribution, and search.
 * Supports: ?territory=mine|&search=...&stage=...&channel=...&limit=50
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { searchParams } = new URL(request.url);
    const territory = searchParams.get('territory') || '';
    const search = searchParams.get('search') || '';
    const stage = searchParams.get('stage') || '';
    const channel = searchParams.get('channel') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

    let sql = `SELECT s.*, c.lifecycle_stage as contact_lifecycle
               FROM crm.inbound_leads s
               LEFT JOIN crm.contacts c ON c.contact_id = s.contact_id
               WHERE s.org_id = $1`;
    const params: unknown[] = [orgId];
    let pi = 2;

    if (territory === 'mine') {
      sql += ` AND s.territory_match::boolean = true`;
    }

    if (stage) {
      sql += ` AND s.funnel_stage = $${pi}`;
      params.push(stage);
      pi++;
    }

    if (channel) {
      sql += ` AND s.attribution_channel = $${pi}`;
      params.push(channel);
      pi++;
    }

    if (search) {
      sql += ` AND (s.business_name ILIKE $${pi} OR s.contact_name ILIKE $${pi} OR s.contact_email ILIKE $${pi})`;
      params.push(`%${search}%`);
      pi++;
    }

    sql += ` ORDER BY s.signup_date DESC NULLS LAST, s.created_at DESC LIMIT $${pi}`;
    params.push(limit);

    const signups = await query(sql, params);

    // Territory counts
    const territoryCounts = await query<{ territory_match: boolean; count: string }>(
      `SELECT territory_match, COUNT(*) as count FROM crm.inbound_leads WHERE org_id = $1 GROUP BY territory_match`,
      [orgId]
    );

    // Funnel stage counts
    const funnelCounts = await query<{ funnel_stage: string; count: string }>(
      `SELECT COALESCE(funnel_stage, 'signup') as funnel_stage, COUNT(*)::text as count
       FROM crm.inbound_leads WHERE org_id = $1 GROUP BY funnel_stage`,
      [orgId]
    );
    const funnel: Record<string, number> = {};
    for (const row of funnelCounts) {
      funnel[row.funnel_stage] = parseInt(row.count);
    }

    // Attribution channel counts
    const attrCounts = await query<{ attribution_channel: string; count: string }>(
      `SELECT COALESCE(attribution_channel, 'organic') as attribution_channel, COUNT(*)::text as count
       FROM crm.inbound_leads WHERE org_id = $1 GROUP BY attribution_channel`,
      [orgId]
    );
    const attribution: Record<string, number> = {};
    for (const row of attrCounts) {
      attribution[row.attribution_channel] = parseInt(row.count);
    }

    // Stalled signups (signed up > 7 days ago, still at signup stage, not converted)
    const stalledRow = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM crm.inbound_leads
       WHERE org_id = $1
       AND funnel_stage = 'signup'
       AND converted_to_lead::boolean = false
       AND signup_date < NOW() - INTERVAL '7 days'`,
      [orgId]
    );

    return NextResponse.json({
      signups,
      total: signups.length,
      territory_total: territoryCounts.find(t => t.territory_match)?.count || '0',
      other_total: territoryCounts.find(t => !t.territory_match)?.count || '0',
      funnel,
      attribution,
      stalled_count: parseInt(stalledRow[0]?.count || '0'),
    });
  } catch (error) {
    console.error('[signups] error:', error);
    return NextResponse.json({ error: 'Failed to load signups' }, { status: 500 });
  }
}

/**
 * PATCH /api/signups - Update signup funnel stage or attribution
 * Body: { signup_id, funnel_stage?, attribution_channel?, attribution_source? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();
    const parsed = updateSignupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { signup_id, funnel_stage, attribution_channel, attribution_source } = parsed.data;

    const updates: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (funnel_stage) {
      // Get current stage for event log
      const current = await query<{ funnel_stage: string }>(
        `SELECT funnel_stage FROM crm.inbound_leads WHERE signup_id = $1 AND org_id = $2`, [signup_id, orgId]
      );
      const fromStage = current[0]?.funnel_stage || 'signup';

      updates.push(`funnel_stage = $${pi}`);
      params.push(funnel_stage);
      pi++;

      // Set timestamp for the stage
      if (funnel_stage === 'activation') {
        updates.push(`activated_at = COALESCE(activated_at, NOW())`);
      } else if (funnel_stage === 'first_delivery') {
        updates.push(`first_delivery_at = COALESCE(first_delivery_at, NOW())`);
      } else if (funnel_stage === 'retained') {
        updates.push(`retained_at = COALESCE(retained_at, NOW())`);
      } else if (funnel_stage === 'churned') {
        updates.push(`churned_at = COALESCE(churned_at, NOW())`);
      }

      // Log funnel event
      await query(
        `INSERT INTO crm.signup_funnel_events (signup_id, from_stage, to_stage, source, org_id)
         VALUES ($1, $2, $3, 'manual', $4)`,
        [signup_id, fromStage, funnel_stage, orgId]
      );
    }

    if (attribution_channel) {
      updates.push(`attribution_channel = $${pi}`);
      params.push(attribution_channel);
      pi++;
    }

    if (attribution_source) {
      updates.push(`attribution_source = $${pi}`);
      params.push(attribution_source);
      pi++;
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    params.push(signup_id);
    pi++;
    params.push(orgId);
    await query(
      `UPDATE crm.inbound_leads SET ${updates.join(', ')} WHERE signup_id = $${pi - 1} AND org_id = $${pi}`,
      params
    );

    return NextResponse.json({ success: true, signup_id });
  } catch (error) {
    console.error('[signups] patch error:', error);
    return NextResponse.json({ error: 'Failed to update signup' }, { status: 500 });
  }
}

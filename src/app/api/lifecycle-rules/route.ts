import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { LifecycleRule } from '@/lib/types';
import { withAuth, withAuthGet } from '@/lib/route-auth';

// GET /api/lifecycle-rules - List all lifecycle automation rules
export const GET = withAuthGet(async ({ orgId }) => {
  const rules = await query<LifecycleRule>(
    `SELECT * FROM crm.lifecycle_rules WHERE org_id = $1 ORDER BY from_stage, to_stage`,
    [orgId]
  );
  return NextResponse.json(rules);
});

// POST /api/lifecycle-rules - Create a lifecycle rule
export const POST = withAuth(async (request, { orgId }) => {
  const body = await request.json();
  const { name, from_stage, to_stage, action_type, action_config } = body;

  if (!name || !from_stage || !to_stage || !action_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const rule = await queryOne<LifecycleRule>(
    `INSERT INTO crm.lifecycle_rules (org_id, name, from_stage, to_stage, action_type, action_config)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [orgId, name, from_stage, to_stage, action_type, JSON.stringify(action_config || {})]
  );

  return NextResponse.json(rule, { status: 201 });
});

// DELETE /api/lifecycle-rules?id=X
export const DELETE = withAuth(async (request, { orgId }) => {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing rule id' }, { status: 400 });

  await query(`DELETE FROM crm.lifecycle_rules WHERE rule_id = $1 AND org_id = $2`, [parseInt(id), orgId]);
  return NextResponse.json({ success: true });
});

// PATCH /api/lifecycle-rules - Toggle rule active/inactive
export const PATCH = withAuth(async (request, { orgId }) => {
  const body = await request.json();
  const { rule_id, is_active } = body;

  if (!rule_id) return NextResponse.json({ error: 'Missing rule_id' }, { status: 400 });

  const rule = await queryOne<LifecycleRule>(
    `UPDATE crm.lifecycle_rules SET is_active = $1 WHERE rule_id = $2 AND org_id = $3 RETURNING *`,
    [is_active, rule_id, orgId]
  );

  return NextResponse.json(rule);
});

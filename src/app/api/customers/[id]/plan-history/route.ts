import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { CustomerPlanChange, Customer } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';

// GET /api/customers/[id]/plan-history - Get plan change history
export const GET = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing customer id' }, { status: 400 });

    const changes = await query<CustomerPlanChange>(
      `SELECT * FROM crm.customer_plan_changes
       WHERE customer_id = $1 AND org_id = $2
       ORDER BY change_date DESC NULLS LAST, created_at DESC`,
      [id, orgId]
    );

    return NextResponse.json({ changes });
  } catch (error) {
    console.error('[customers/plan-history] GET error:', error);
    return NextResponse.json({ error: 'Failed to load plan history' }, { status: 500 });
  }
});

// POST /api/customers/[id]/plan-history - Log a plan change
export const POST = withAuth(async (request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing customer id' }, { status: 400 });

    const body = await request.json();
    const { new_plan, change_type, change_date, commission, notes } = body;

    if (!new_plan) {
      return NextResponse.json({ error: 'new_plan is required' }, { status: 400 });
    }

    // Get current plan as previous_plan
    const customer = await queryOne<Customer>(
      `SELECT account_plan FROM crm.customers WHERE id = $1 AND org_id = $2`,
      [id, orgId]
    );

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const change = await queryOne<CustomerPlanChange>(
      `INSERT INTO crm.customer_plan_changes (
        org_id, customer_id, previous_plan, new_plan, change_type, change_date, commission, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        orgId, id, customer.account_plan, new_plan,
        change_type || 'upgrade', change_date || new Date().toISOString().split('T')[0],
        commission || null, notes || null,
      ]
    );

    // Update the customer's current plan
    await queryOne(
      `UPDATE crm.customers SET account_plan = $1, updated_at = NOW()
       WHERE id = $2 AND org_id = $3`,
      [new_plan, id, orgId]
    );

    return NextResponse.json(change, { status: 201 });
  } catch (error) {
    console.error('[customers/plan-history] POST error:', error);
    return NextResponse.json({ error: 'Failed to log plan change' }, { status: 500 });
  }
});

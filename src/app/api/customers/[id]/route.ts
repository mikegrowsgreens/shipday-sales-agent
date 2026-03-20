import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Customer, CustomerPlanChange, CustomerEmail } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';

// GET /api/customers/[id] - Get customer detail
export const GET = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing customer id' }, { status: 400 });

    const customer = await queryOne<Customer>(
      `SELECT * FROM crm.customers WHERE id = $1 AND org_id = $2`,
      [id, orgId]
    );

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Fetch plan history
    const planHistory = await query<CustomerPlanChange>(
      `SELECT * FROM crm.customer_plan_changes
       WHERE customer_id = $1 AND org_id = $2
       ORDER BY change_date DESC NULLS LAST, created_at DESC`,
      [id, orgId]
    );

    // Fetch recent emails
    const recentEmails = await query<CustomerEmail>(
      `SELECT * FROM crm.customer_emails
       WHERE customer_id = $1 AND org_id = $2
       ORDER BY date DESC NULLS LAST
       LIMIT 5`,
      [id, orgId]
    );

    const emailCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM crm.customer_emails
       WHERE customer_id = $1 AND org_id = $2`,
      [id, orgId]
    );

    return NextResponse.json({
      ...customer,
      plan_history: planHistory,
      recent_emails: recentEmails,
      email_count: parseInt(emailCount?.count || '0'),
    });
  } catch (error) {
    console.error('[customers] GET [id] error:', error);
    return NextResponse.json({ error: 'Failed to load customer' }, { status: 500 });
  }
});

// PUT /api/customers/[id] - Update customer
export const PUT = withAuth(async (request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing customer id' }, { status: 400 });

    const body = await request.json();

    // Build dynamic SET clause from provided fields
    const allowedFields = [
      'business_name', 'contact_name', 'email', 'phone', 'address', 'city', 'state',
      'shipday_company_id', 'shipday_account_id', 'account_plan', 'plan_display_name',
      'account_status', 'signup_date', 'last_active', 'num_locations', 'num_drivers',
      'avg_completed_orders', 'avg_order_value', 'avg_cost_per_order', 'discount_pct',
      'health_score', 'notes', 'tags', 'custom_fields',
    ];

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
      if (field in body) {
        setClauses.push(`${field} = $${paramIdx++}`);
        values.push(body[field]);
      }
    }

    if (values.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id, orgId);

    const customer = await queryOne<Customer>(
      `UPDATE crm.customers SET ${setClauses.join(', ')}
       WHERE id = $${paramIdx++} AND org_id = $${paramIdx++}
       RETURNING *`,
      values
    );

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error('[customers] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
});

// DELETE /api/customers/[id] - Soft delete customer
export const DELETE = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing customer id' }, { status: 400 });

    const customer = await queryOne<Customer>(
      `UPDATE crm.customers SET account_status = 'deleted', updated_at = NOW()
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [id, orgId]
    );

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[customers] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete customer' }, { status: 500 });
  }
});

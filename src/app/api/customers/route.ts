import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Customer } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';

// GET /api/customers - List customers with filters
export const GET = withAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search');
    const plan = searchParams.get('plan');
    const status = searchParams.get('status');
    const state = searchParams.get('state');
    const healthMin = searchParams.get('health_min');
    const healthMax = searchParams.get('health_max');
    const sort = searchParams.get('sort') || 'business_name';
    const order = searchParams.get('order') || 'ASC';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = ['org_id = $1'];
    const params: unknown[] = [orgId];
    let paramIdx = 2;

    // Exclude soft-deleted
    conditions.push(`account_status != 'deleted'`);

    if (search) {
      conditions.push(`(
        business_name ILIKE $${paramIdx} OR
        contact_name ILIKE $${paramIdx} OR
        email ILIKE $${paramIdx} OR
        phone ILIKE $${paramIdx}
      )`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (plan && plan !== 'all') {
      conditions.push(`account_plan = $${paramIdx++}`);
      params.push(plan);
    }

    if (status && status !== 'all') {
      conditions.push(`account_status = $${paramIdx++}`);
      params.push(status);
    }

    if (state && state !== 'all') {
      conditions.push(`state = $${paramIdx++}`);
      params.push(state);
    }

    if (healthMin) {
      conditions.push(`health_score >= $${paramIdx++}`);
      params.push(parseInt(healthMin));
    }

    if (healthMax) {
      conditions.push(`health_score <= $${paramIdx++}`);
      params.push(parseInt(healthMax));
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const allowedSorts = [
      'business_name', 'contact_name', 'account_plan', 'account_status',
      'signup_date', 'last_active', 'health_score', 'avg_completed_orders',
      'avg_order_value', 'created_at', 'updated_at',
    ];
    const sortCol = allowedSorts.includes(sort) ? sort : 'business_name';
    const sortOrder = order === 'DESC' ? 'DESC' : 'ASC';

    const customers = await query<Customer>(
      `SELECT * FROM crm.customers ${where}
       ORDER BY ${sortCol} ${sortOrder} NULLS LAST
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM crm.customers ${where}`,
      params
    );

    // Get distinct states and plans for filter dropdowns
    const plans = await query<{ account_plan: string }>(
      `SELECT DISTINCT account_plan FROM crm.customers WHERE org_id = $1 AND account_plan IS NOT NULL ORDER BY account_plan`,
      [orgId]
    );
    const states = await query<{ state: string }>(
      `SELECT DISTINCT state FROM crm.customers WHERE org_id = $1 AND state IS NOT NULL ORDER BY state`,
      [orgId]
    );

    return NextResponse.json({
      customers,
      total: parseInt(countResult?.count || '0'),
      limit,
      offset,
      filters: {
        plans: plans.map(p => p.account_plan),
        states: states.map(s => s.state),
      },
    });
  } catch (error) {
    console.error('[customers] GET error:', error);
    return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 });
  }
});

// POST /api/customers - Create a customer
export const POST = withAuth(async (request, { orgId }) => {
  try {
    const body = await request.json();
    const {
      business_name, contact_name, email, phone, address, city, state,
      shipday_company_id, shipday_account_id, account_plan, plan_display_name,
      account_status, signup_date, last_active, num_locations, num_drivers,
      avg_completed_orders, avg_order_value, avg_cost_per_order, discount_pct,
      health_score, notes, tags, custom_fields, imported_from,
    } = body;

    if (!business_name) {
      return NextResponse.json({ error: 'business_name is required' }, { status: 400 });
    }

    const customer = await queryOne<Customer>(
      `INSERT INTO crm.customers (
        org_id, business_name, contact_name, email, phone, address, city, state,
        shipday_company_id, shipday_account_id, account_plan, plan_display_name,
        account_status, signup_date, last_active, num_locations, num_drivers,
        avg_completed_orders, avg_order_value, avg_cost_per_order, discount_pct,
        health_score, notes, tags, custom_fields, imported_from
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      )
      ON CONFLICT (org_id, email) WHERE email IS NOT NULL DO UPDATE SET
        business_name = COALESCE(EXCLUDED.business_name, crm.customers.business_name),
        contact_name = COALESCE(EXCLUDED.contact_name, crm.customers.contact_name),
        phone = COALESCE(EXCLUDED.phone, crm.customers.phone),
        address = COALESCE(EXCLUDED.address, crm.customers.address),
        city = COALESCE(EXCLUDED.city, crm.customers.city),
        state = COALESCE(EXCLUDED.state, crm.customers.state),
        shipday_company_id = COALESCE(EXCLUDED.shipday_company_id, crm.customers.shipday_company_id),
        shipday_account_id = COALESCE(EXCLUDED.shipday_account_id, crm.customers.shipday_account_id),
        account_plan = COALESCE(EXCLUDED.account_plan, crm.customers.account_plan),
        plan_display_name = COALESCE(EXCLUDED.plan_display_name, crm.customers.plan_display_name),
        account_status = COALESCE(EXCLUDED.account_status, crm.customers.account_status),
        signup_date = COALESCE(EXCLUDED.signup_date, crm.customers.signup_date),
        last_active = COALESCE(EXCLUDED.last_active, crm.customers.last_active),
        num_locations = COALESCE(EXCLUDED.num_locations, crm.customers.num_locations),
        num_drivers = COALESCE(EXCLUDED.num_drivers, crm.customers.num_drivers),
        avg_completed_orders = COALESCE(EXCLUDED.avg_completed_orders, crm.customers.avg_completed_orders),
        avg_order_value = COALESCE(EXCLUDED.avg_order_value, crm.customers.avg_order_value),
        avg_cost_per_order = COALESCE(EXCLUDED.avg_cost_per_order, crm.customers.avg_cost_per_order),
        discount_pct = COALESCE(EXCLUDED.discount_pct, crm.customers.discount_pct),
        notes = COALESCE(EXCLUDED.notes, crm.customers.notes),
        updated_at = NOW()
      RETURNING *`,
      [
        orgId, business_name, contact_name || null, email || null, phone || null,
        address || null, city || null, state || null,
        shipday_company_id || null, shipday_account_id || null,
        account_plan || null, plan_display_name || null,
        account_status || 'active', signup_date || null, last_active || null,
        num_locations || null, num_drivers || null,
        avg_completed_orders || null, avg_order_value || null,
        avg_cost_per_order || null, discount_pct || null,
        health_score || 50, notes || null, tags || [], custom_fields || {},
        imported_from || 'manual',
      ]
    );

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error('[customers] POST error:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
});

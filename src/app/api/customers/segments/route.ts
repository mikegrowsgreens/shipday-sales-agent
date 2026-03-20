import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Customer } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';

interface SegmentFilter {
  plans?: string[];
  statuses?: string[];
  states?: string[];
  health_min?: number;
  health_max?: number;
  avg_orders_min?: number;
  avg_orders_max?: number;
  avg_order_value_min?: number;
  avg_order_value_max?: number;
  signup_before?: string;
  signup_after?: string;
  last_active_before?: string;
  last_active_after?: string;
  has_email_history?: boolean;
  tags_include?: string[];
  tags_exclude?: string[];
}

// POST /api/customers/segments — Preview a segment (returns matching customers)
export const POST = withAuth(async (request, { orgId }) => {
  try {
    const body = await request.json() as SegmentFilter;
    const conditions: string[] = ['org_id = $1', "account_status != 'deleted'", "email IS NOT NULL AND email != ''"];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (body.plans?.length) {
      conditions.push(`account_plan = ANY($${idx})`);
      params.push(body.plans);
      idx++;
    }
    if (body.statuses?.length) {
      conditions.push(`account_status = ANY($${idx})`);
      params.push(body.statuses);
      idx++;
    }
    if (body.states?.length) {
      conditions.push(`state = ANY($${idx})`);
      params.push(body.states);
      idx++;
    }
    if (body.health_min != null) {
      conditions.push(`health_score >= $${idx}`);
      params.push(body.health_min);
      idx++;
    }
    if (body.health_max != null) {
      conditions.push(`health_score <= $${idx}`);
      params.push(body.health_max);
      idx++;
    }
    if (body.avg_orders_min != null) {
      conditions.push(`avg_completed_orders >= $${idx}`);
      params.push(body.avg_orders_min);
      idx++;
    }
    if (body.avg_orders_max != null) {
      conditions.push(`avg_completed_orders <= $${idx}`);
      params.push(body.avg_orders_max);
      idx++;
    }
    if (body.avg_order_value_min != null) {
      conditions.push(`avg_order_value >= $${idx}`);
      params.push(body.avg_order_value_min);
      idx++;
    }
    if (body.avg_order_value_max != null) {
      conditions.push(`avg_order_value <= $${idx}`);
      params.push(body.avg_order_value_max);
      idx++;
    }
    if (body.signup_before) {
      conditions.push(`signup_date < $${idx}`);
      params.push(body.signup_before);
      idx++;
    }
    if (body.signup_after) {
      conditions.push(`signup_date >= $${idx}`);
      params.push(body.signup_after);
      idx++;
    }
    if (body.last_active_before) {
      conditions.push(`last_active < $${idx}`);
      params.push(body.last_active_before);
      idx++;
    }
    if (body.last_active_after) {
      conditions.push(`last_active >= $${idx}`);
      params.push(body.last_active_after);
      idx++;
    }
    if (body.has_email_history === true) {
      conditions.push('total_emails > 0');
    } else if (body.has_email_history === false) {
      conditions.push('(total_emails = 0 OR total_emails IS NULL)');
    }
    if (body.tags_include?.length) {
      conditions.push(`tags @> $${idx}`);
      params.push(body.tags_include);
      idx++;
    }
    if (body.tags_exclude?.length) {
      conditions.push(`NOT (tags && $${idx})`);
      params.push(body.tags_exclude);
      idx++;
    }

    const where = conditions.join(' AND ');
    const customers = await query<Customer>(
      `SELECT * FROM crm.customers WHERE ${where} ORDER BY business_name LIMIT 500`,
      params
    );

    return NextResponse.json({
      count: customers.length,
      customers: customers,
      preview: customers.slice(0, 5),
    });
  } catch (error) {
    console.error('[customers/segments] POST error:', error);
    return NextResponse.json({ error: 'Failed to preview segment' }, { status: 500 });
  }
});

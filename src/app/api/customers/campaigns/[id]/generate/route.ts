import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { CustomerCampaign, Customer, CustomerEmail } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';
import { generateCustomerCampaignEmail } from '@/lib/ai';
import { getOrgConfig } from '@/lib/org-config';

// POST /api/customers/campaigns/[id]/generate — AI-generate emails for all recipients
export const POST = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

    const campaign = await queryOne<CustomerCampaign>(
      `SELECT * FROM crm.customer_campaigns WHERE id = $1 AND org_id = $2`,
      [id, orgId]
    );

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Build segment query from target_segment
    const segment = campaign.target_segment as Record<string, unknown>;
    const conditions: string[] = ['org_id = $1', "account_status != 'deleted'", "email IS NOT NULL AND email != ''"];
    const qParams: unknown[] = [orgId];
    let idx = 2;

    if (Array.isArray(segment.plans) && segment.plans.length) {
      conditions.push(`account_plan = ANY($${idx})`); qParams.push(segment.plans); idx++;
    }
    if (Array.isArray(segment.statuses) && segment.statuses.length) {
      conditions.push(`account_status = ANY($${idx})`); qParams.push(segment.statuses); idx++;
    }
    if (Array.isArray(segment.states) && segment.states.length) {
      conditions.push(`state = ANY($${idx})`); qParams.push(segment.states); idx++;
    }
    if (segment.health_min != null) {
      conditions.push(`health_score >= $${idx}`); qParams.push(segment.health_min); idx++;
    }
    if (segment.health_max != null) {
      conditions.push(`health_score <= $${idx}`); qParams.push(segment.health_max); idx++;
    }
    if (segment.avg_orders_min != null) {
      conditions.push(`avg_completed_orders >= $${idx}`); qParams.push(segment.avg_orders_min); idx++;
    }
    if (segment.avg_orders_max != null) {
      conditions.push(`avg_completed_orders <= $${idx}`); qParams.push(segment.avg_orders_max); idx++;
    }
    if (segment.avg_order_value_min != null) {
      conditions.push(`avg_order_value >= $${idx}`); qParams.push(segment.avg_order_value_min); idx++;
    }
    if (segment.avg_order_value_max != null) {
      conditions.push(`avg_order_value <= $${idx}`); qParams.push(segment.avg_order_value_max); idx++;
    }
    if (segment.signup_before) {
      conditions.push(`signup_date < $${idx}`); qParams.push(segment.signup_before); idx++;
    }
    if (segment.signup_after) {
      conditions.push(`signup_date >= $${idx}`); qParams.push(segment.signup_after); idx++;
    }
    if (segment.last_active_before) {
      conditions.push(`last_active < $${idx}`); qParams.push(segment.last_active_before); idx++;
    }
    if (segment.last_active_after) {
      conditions.push(`last_active >= $${idx}`); qParams.push(segment.last_active_after); idx++;
    }
    if (segment.has_email_history === true) {
      conditions.push('total_emails > 0');
    } else if (segment.has_email_history === false) {
      conditions.push('(total_emails = 0 OR total_emails IS NULL)');
    }
    if (Array.isArray(segment.tags_include) && segment.tags_include.length) {
      conditions.push(`tags @> $${idx}`); qParams.push(segment.tags_include); idx++;
    }
    if (Array.isArray(segment.tags_exclude) && segment.tags_exclude.length) {
      conditions.push(`NOT (tags && $${idx})`); qParams.push(segment.tags_exclude); idx++;
    }

    const customers = await query<Customer>(
      `SELECT * FROM crm.customers WHERE ${conditions.join(' AND ')} ORDER BY business_name LIMIT 500`,
      qParams
    );

    if (!customers.length) {
      return NextResponse.json({ error: 'No customers match the segment' }, { status: 400 });
    }

    // Delete existing draft sends for this campaign (regeneration)
    await query(
      `DELETE FROM crm.customer_campaign_sends WHERE campaign_id = $1 AND org_id = $2 AND status = 'draft'`,
      [id, orgId]
    );

    const orgConfig = await getOrgConfig(orgId);
    let generated = 0;
    const errors: string[] = [];

    for (const customer of customers) {
      try {
        // Load recent emails for context
        const recentEmails = await query<CustomerEmail>(
          `SELECT subject, snippet, date FROM crm.customer_emails
           WHERE customer_id = $1 AND org_id = $2
           ORDER BY date DESC NULLS LAST LIMIT 3`,
          [customer.id, orgId]
        );

        const email = await generateCustomerCampaignEmail({
          customer,
          campaignType: campaign.campaign_type || 'announcement',
          subjectTemplate: campaign.subject_template || undefined,
          bodyTemplate: campaign.body_template || undefined,
          emailHistory: recentEmails,
        }, orgConfig);

        await queryOne(
          `INSERT INTO crm.customer_campaign_sends (
            org_id, campaign_id, customer_id, to_email, subject, body,
            personalization_context, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')`,
          [
            orgId, id, customer.id, customer.email,
            email.subject, email.body,
            JSON.stringify({
              business_name: customer.business_name,
              contact_name: customer.contact_name,
              plan: customer.account_plan,
              health_score: customer.health_score,
            }),
          ]
        );

        generated++;
      } catch (err) {
        errors.push(`${customer.business_name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Update campaign stats
    await queryOne(
      `UPDATE crm.customer_campaigns SET total_recipients = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`,
      [generated, id, orgId]
    );

    return NextResponse.json({ generated, total: customers.length, errors: errors.slice(0, 10) });
  } catch (error) {
    console.error('[customers/campaigns/generate] POST error:', error);
    return NextResponse.json({ error: 'Failed to generate emails' }, { status: 500 });
  }
});

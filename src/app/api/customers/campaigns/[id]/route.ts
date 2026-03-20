import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { CustomerCampaign, CustomerCampaignSend } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';

// GET /api/customers/campaigns/[id] — Campaign detail + sends
export const GET = withAuth(async (_request, { orgId, params }) => {
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

    const sends = await query<CustomerCampaignSend & { business_name: string; contact_name: string }>(
      `SELECT s.*, c.business_name, c.contact_name
       FROM crm.customer_campaign_sends s
       LEFT JOIN crm.customers c ON c.id = s.customer_id AND c.org_id = s.org_id
       WHERE s.campaign_id = $1 AND s.org_id = $2
       ORDER BY s.created_at DESC`,
      [id, orgId]
    );

    return NextResponse.json({ ...campaign, sends });
  } catch (error) {
    console.error('[customers/campaigns/[id]] GET error:', error);
    return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 });
  }
});

// PUT /api/customers/campaigns/[id] — Update campaign
export const PUT = withAuth(async (request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

    const body = await request.json() as Partial<{
      name: string;
      campaign_type: string;
      target_segment: Record<string, unknown>;
      subject_template: string;
      body_template: string;
      status: string;
      _update_send: { id: number; subject: string; body: string };
    }>;

    // Handle inline send editing
    if (body._update_send) {
      const { id: sendId, subject, body: sendBody } = body._update_send;
      await queryOne(
        `UPDATE crm.customer_campaign_sends SET subject = $1, body = $2, updated_at = NOW()
         WHERE id = $3 AND campaign_id = $4 AND org_id = $5 AND status = 'draft'`,
        [subject, sendBody, sendId, id, orgId]
      );
      return NextResponse.json({ success: true });
    }

    const sets: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { sets.push(`name = $${idx}`); values.push(body.name); idx++; }
    if (body.campaign_type !== undefined) { sets.push(`campaign_type = $${idx}`); values.push(body.campaign_type); idx++; }
    if (body.target_segment !== undefined) { sets.push(`target_segment = $${idx}`); values.push(JSON.stringify(body.target_segment)); idx++; }
    if (body.subject_template !== undefined) { sets.push(`subject_template = $${idx}`); values.push(body.subject_template); idx++; }
    if (body.body_template !== undefined) { sets.push(`body_template = $${idx}`); values.push(body.body_template); idx++; }
    if (body.status !== undefined) { sets.push(`status = $${idx}`); values.push(body.status); idx++; }

    values.push(id, orgId);

    const campaign = await queryOne<CustomerCampaign>(
      `UPDATE crm.customer_campaigns SET ${sets.join(', ')} WHERE id = $${idx} AND org_id = $${idx + 1} RETURNING *`,
      values
    );

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json(campaign);
  } catch (error) {
    console.error('[customers/campaigns/[id]] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
});

// DELETE /api/customers/campaigns/[id] — Delete campaign
export const DELETE = withAuth(async (_request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing campaign id' }, { status: 400 });

    const result = await queryOne<{ id: number }>(
      `DELETE FROM crm.customer_campaigns WHERE id = $1 AND org_id = $2 RETURNING id`,
      [id, orgId]
    );

    if (!result) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[customers/campaigns/[id]] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
});

import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { CustomerCampaign } from '@/lib/types';
import { withAuth, withAuthGet } from '@/lib/route-auth';

// GET /api/customers/campaigns — List all campaigns
export const GET = withAuthGet(async ({ orgId }) => {
  try {
    const campaigns = await query<CustomerCampaign>(
      `SELECT * FROM crm.customer_campaigns
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('[customers/campaigns] GET error:', error);
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 });
  }
});

// POST /api/customers/campaigns — Create a campaign
export const POST = withAuth(async (request, { orgId }) => {
  try {
    const body = await request.json() as {
      name: string;
      campaign_type: string;
      target_segment: Record<string, unknown>;
      subject_template?: string;
      body_template?: string;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
    }

    const campaign = await queryOne<CustomerCampaign>(
      `INSERT INTO crm.customer_campaigns (
        org_id, name, campaign_type, target_segment, subject_template, body_template, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'draft')
      RETURNING *`,
      [
        orgId,
        body.name.trim(),
        body.campaign_type || null,
        JSON.stringify(body.target_segment || {}),
        body.subject_template || null,
        body.body_template || null,
      ]
    );

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    console.error('[customers/campaigns] POST error:', error);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
});

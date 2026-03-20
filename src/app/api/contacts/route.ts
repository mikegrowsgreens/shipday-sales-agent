import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Contact } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';
import { getOrgPlan, requireResourceLimit } from '@/lib/feature-gate';
import { logAuditEvent } from '@/lib/audit';
import { trackUsage } from '@/lib/usage';
import { createContactSchema } from '@/lib/validators/contacts';

// GET /api/contacts - List contacts with filters
export const GET = withAuth(async (request, { orgId }) => {
  try {
    const { searchParams } = request.nextUrl;
    const stage = searchParams.get('stage');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort') || 'updated_at';
    const order = searchParams.get('order') || 'DESC';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = ['org_id = $1'];
    const params: unknown[] = [orgId];
    let paramIdx = 2;

    if (stage && stage !== 'all') {
      conditions.push(`lifecycle_stage = $${paramIdx++}`);
      params.push(stage);
    }

    if (search) {
      conditions.push(`(
        business_name ILIKE $${paramIdx} OR
        email ILIKE $${paramIdx} OR
        first_name ILIKE $${paramIdx} OR
        last_name ILIKE $${paramIdx} OR
        phone ILIKE $${paramIdx}
      )`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const allowedSorts = ['updated_at', 'created_at', 'lead_score', 'engagement_score', 'business_name'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'updated_at';
    const sortOrder = order === 'ASC' ? 'ASC' : 'DESC';

    const contacts = await query<Contact>(
      `SELECT * FROM crm.contacts ${where}
       ORDER BY ${sortCol} ${sortOrder}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM crm.contacts ${where}`,
      params
    );

    return NextResponse.json({
      contacts,
      total: parseInt(countResult?.count || '0'),
      limit,
      offset,
    });
  } catch (error) {
    console.error('[contacts] GET error:', error);
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }
});

// POST /api/contacts - Create a new contact
export const POST = withAuth(async (request, { tenant, orgId }) => {
  try {
    const plan = await getOrgPlan(orgId);
    await requireResourceLimit(orgId, plan, 'maxContacts', 'crm.contacts');

    const body = await request.json();
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const {
      email, phone, first_name, last_name, business_name,
      title, linkedin_url, website, lifecycle_stage, tags, metadata,
    } = parsed.data;

    const contact = await queryOne<Contact>(
      `INSERT INTO crm.contacts (
        org_id, email, phone, first_name, last_name, business_name,
        title, linkedin_url, website, lifecycle_stage, tags, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (email) WHERE org_id = $1 DO UPDATE SET
        phone = COALESCE(EXCLUDED.phone, crm.contacts.phone),
        first_name = COALESCE(EXCLUDED.first_name, crm.contacts.first_name),
        last_name = COALESCE(EXCLUDED.last_name, crm.contacts.last_name),
        business_name = COALESCE(EXCLUDED.business_name, crm.contacts.business_name),
        title = COALESCE(EXCLUDED.title, crm.contacts.title),
        linkedin_url = COALESCE(EXCLUDED.linkedin_url, crm.contacts.linkedin_url),
        website = COALESCE(EXCLUDED.website, crm.contacts.website),
        updated_at = NOW()
      RETURNING *`,
      [
        orgId, email, phone, first_name, last_name, business_name,
        title, linkedin_url, website, lifecycle_stage || 'raw',
        tags || [], metadata || {},
      ]
    );

    logAuditEvent({
      orgId: tenant.org_id,
      userId: tenant.user_id,
      action: 'contact.create',
      resourceType: 'contact',
      resourceId: String(contact?.contact_id),
      details: { email, first_name, last_name, business_name },
      request,
    });

    trackUsage(orgId, 'contacts_created');

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[contacts] POST error:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
});

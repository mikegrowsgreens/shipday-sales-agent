import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { N8N_WEBHOOK_KEY } from '@/lib/config';

/**
 * POST /api/customers/emails/sync-all
 * Returns list of all customer emails for n8n to process.
 * n8n calls this first to get the customer list, then syncs each.
 * Auth: x-webhook-key header
 */
export async function POST(request: NextRequest) {
  const webhookKey = request.headers.get('x-webhook-key');
  if (webhookKey !== N8N_WEBHOOK_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({})) as { org_id?: number };

    // Get all unique emails from customers, contacts, and leads
    const orgFilter = body.org_id ? 'AND org_id = $1' : '';
    const orgParams = body.org_id ? [body.org_id] : [];

    // Unified query: customers + contacts + leads, deduplicated by email
    const emails = await query<{
      email: string; business_name: string | null;
      last_email_date: string | null; org_id: number; source: string;
    }>(
      `WITH all_emails AS (
        SELECT email, business_name, last_email_date, org_id, 'customer' as source
        FROM crm.customers
        WHERE email IS NOT NULL AND email != '' AND account_status != 'deleted' ${orgFilter}
        UNION
        SELECT email, business_name, NULL as last_email_date, org_id, 'contact' as source
        FROM crm.contacts
        WHERE email IS NOT NULL AND email != '' ${orgFilter}
        UNION
        SELECT contact_email as email, business_name, NULL as last_email_date, org_id, 'lead' as source
        FROM bdr.leads
        WHERE contact_email IS NOT NULL AND contact_email != ''
          AND status NOT IN ('opted_out', 'bounced', 'dedup_skipped') ${orgFilter}
      )
      SELECT DISTINCT ON (LOWER(email)) email, business_name, last_email_date, org_id, source
      FROM all_emails
      ORDER BY LOWER(email), source`,
      orgParams
    );

    return NextResponse.json({
      customers: emails.map(c => ({
        email: c.email,
        business_name: c.business_name,
        last_sync: c.last_email_date,
        org_id: c.org_id,
        source: c.source,
      })),
      total: emails.length,
    });
  } catch (error) {
    console.error('[customers/emails/sync-all] POST error:', error);
    return NextResponse.json({ error: 'Failed to get customer list' }, { status: 500 });
  }
}

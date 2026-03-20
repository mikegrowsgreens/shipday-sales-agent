import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { N8N_WEBHOOK_KEY } from '@/lib/config';
import { Customer, CustomerEmail } from '@/lib/types';

interface SyncMessage {
  gmail_message_id: string;
  gmail_thread_id: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body_preview?: string;
  date: string;
  labels: string[];
  has_attachment: boolean;
}

interface SyncPayload {
  customer_email: string;
  org_id?: number;
  messages: SyncMessage[];
}

/**
 * POST /api/customers/emails/sync
 * Webhook from n8n Gmail sync workflow.
 * Upserts email messages for a customer matched by email.
 * Auth: x-webhook-key header
 */
export async function POST(request: NextRequest) {
  const webhookKey = request.headers.get('x-webhook-key');
  if (webhookKey !== N8N_WEBHOOK_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json() as SyncPayload;
    const { customer_email, messages, org_id } = body;

    if (!customer_email || !messages?.length) {
      return NextResponse.json({ error: 'customer_email and messages[] required' }, { status: 400 });
    }

    const email = customer_email.trim().toLowerCase();

    // Find customer by email
    let customer: Customer | null;
    if (org_id) {
      customer = await queryOne<Customer>(
        `SELECT id, org_id, email FROM crm.customers WHERE LOWER(email) = $1 AND org_id = $2`,
        [email, org_id]
      );
    } else {
      customer = await queryOne<Customer>(
        `SELECT id, org_id, email FROM crm.customers WHERE LOWER(email) = $1 LIMIT 1`,
        [email]
      );
    }

    // If no customer found, check if this email belongs to a known contact
    // and auto-create a customer record so their emails are captured
    if (!customer) {
      const contact = await queryOne<{ contact_id: number; org_id: number; email: string; first_name: string | null; last_name: string | null; business_name: string | null }>(
        org_id
          ? `SELECT contact_id, org_id, email, first_name, last_name, business_name FROM crm.contacts WHERE LOWER(email) = $1 AND org_id = $2 LIMIT 1`
          : `SELECT contact_id, org_id, email, first_name, last_name, business_name FROM crm.contacts WHERE LOWER(email) = $1 LIMIT 1`,
        org_id ? [email, org_id] : [email]
      );

      if (contact) {
        // Auto-create a customer record linked to this contact
        const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || email;
        customer = await queryOne<Customer>(
          `INSERT INTO crm.customers (org_id, email, business_name, contact_name, source, account_status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'contact_sync', 'active', NOW(), NOW())
           ON CONFLICT (org_id, email) DO UPDATE SET updated_at = NOW()
           RETURNING id, org_id, email`,
          [contact.org_id, email, contact.business_name || null, contactName]
        );
      }
    }

    // Also check bdr.leads if still no match
    if (!customer) {
      const lead = await queryOne<{ lead_id: number; business_name: string | null; contact_name: string | null; contact_email: string }>(
        org_id
          ? `SELECT lead_id, business_name, contact_name, contact_email FROM bdr.leads WHERE LOWER(contact_email) = $1 AND org_id = $2 LIMIT 1`
          : `SELECT lead_id, business_name, contact_name, contact_email FROM bdr.leads WHERE LOWER(contact_email) = $1 LIMIT 1`,
        org_id ? [email, org_id] : [email]
      );

      if (lead) {
        // Look up the lead's org_id
        const leadOrgId = org_id || await queryOne<{ org_id: number }>(
          `SELECT org_id FROM bdr.leads WHERE lead_id = $1`, [lead.lead_id]
        ).then(r => r?.org_id);

        if (leadOrgId) {
          customer = await queryOne<Customer>(
            `INSERT INTO crm.customers (org_id, email, business_name, contact_name, source, account_status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'lead_sync', 'active', NOW(), NOW())
             ON CONFLICT (org_id, email) DO UPDATE SET updated_at = NOW()
             RETURNING id, org_id, email`,
            [leadOrgId, email, lead.business_name || null, lead.contact_name || email]
          );
        }
      }
    }

    if (!customer) {
      return NextResponse.json({ error: `No customer, contact, or lead found for email: ${email}` }, { status: 404 });
    }

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const msg of messages) {
      try {
        if (!msg.gmail_message_id) { skipped++; continue; }

        // Determine direction
        const fromEmail = (msg.from || '').toLowerCase();
        const direction = fromEmail.includes(email) ? 'inbound' : 'outbound';

        const result = await queryOne<CustomerEmail & { xmax: string }>(
          `INSERT INTO crm.customer_emails (
            org_id, customer_id, gmail_message_id, gmail_thread_id,
            direction, from_email, to_email, subject, snippet, body_preview,
            date, labels, has_attachment
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (gmail_message_id) DO UPDATE SET
            snippet = COALESCE(NULLIF(EXCLUDED.snippet, ''), crm.customer_emails.snippet),
            body_preview = COALESCE(NULLIF(EXCLUDED.body_preview, ''), crm.customer_emails.body_preview),
            labels = EXCLUDED.labels
          RETURNING *, xmax::text`,
          [
            customer.org_id, customer.id,
            msg.gmail_message_id, msg.gmail_thread_id || null,
            direction,
            msg.from || null, msg.to || null,
            msg.subject || null, msg.snippet || null, msg.body_preview || null,
            msg.date || null,
            msg.labels || [],
            msg.has_attachment || false,
          ]
        );

        if (result?.xmax === '0') synced++; else skipped++;
      } catch (err) {
        errors.push(`${msg.gmail_message_id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Update customer email stats
    const stats = await queryOne<{ total: string; latest_date: string; latest_subject: string }>(
      `SELECT
         COUNT(*)::text as total,
         MAX(date)::text as latest_date,
         (SELECT subject FROM crm.customer_emails
          WHERE customer_id = $1 AND org_id = $2
          ORDER BY date DESC NULLS LAST LIMIT 1) as latest_subject
       FROM crm.customer_emails
       WHERE customer_id = $1 AND org_id = $2`,
      [customer.id, customer.org_id]
    );

    if (stats) {
      await queryOne(
        `UPDATE crm.customers SET
           total_emails = $1,
           last_email_date = $2,
           last_email_subject = $3,
           updated_at = NOW()
         WHERE id = $4 AND org_id = $5`,
        [
          parseInt(stats.total),
          stats.latest_date || null,
          stats.latest_subject || null,
          customer.id, customer.org_id,
        ]
      );
    }

    return NextResponse.json({ success: true, synced, skipped, errors: errors.slice(0, 10) });
  } catch (error) {
    console.error('[customers/emails/sync] POST error:', error);
    return NextResponse.json({ error: 'Failed to sync emails' }, { status: 500 });
  }
}

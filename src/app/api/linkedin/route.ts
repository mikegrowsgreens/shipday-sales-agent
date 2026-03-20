import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/linkedin - Trigger LinkedIn automation via n8n
 *
 * Calls the existing n8n LinkedIn prospecting workflow (l58bpAEegiO9TPsELs7iS)
 * or a custom webhook to send a LinkedIn message/connection request.
 *
 * Body: { contact_id, action: 'connect' | 'message' | 'view', message?, task_id? }
 */
export async function POST(request: NextRequest) {
  const tenant = await requireTenantSession();
  const orgId = tenant.org_id;

  const body = await request.json();
  const { contact_id, action = 'message', message, task_id } = body;

  if (!contact_id) {
    return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
  }

  const contact = await queryOne<{
    contact_id: number;
    linkedin_url: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string;
    business_name: string | null;
  }>(
    `SELECT contact_id, linkedin_url, first_name, last_name, email, business_name
     FROM crm.contacts WHERE contact_id = $1 AND org_id = $2`,
    [contact_id, orgId]
  );

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const n8nBaseUrl = process.env.N8N_BASE_URL || '';
  const n8nWebhookPath = process.env.N8N_LINKEDIN_WEBHOOK || '/webhook/linkedin-step';

  try {
    // Call n8n webhook to trigger LinkedIn automation
    const response = await fetchWithTimeout(`${n8nBaseUrl}${n8nWebhookPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: contact.contact_id,
        linkedin_url: contact.linkedin_url,
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        business_name: contact.business_name,
        action,
        message: message || null,
        task_id: task_id || null,
      }),
      timeout: 30000,
    });

    const result = await response.json().catch(() => ({ status: 'triggered' }));

    // Log touchpoint
    const touchpointRows = await query<{ touchpoint_id: number }>(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, body_preview, metadata, occurred_at)
       VALUES ($1, 'linkedin', $2, 'outbound', 'saleshub', $3, $4, NOW())
       RETURNING touchpoint_id`,
      [
        contact_id,
        `${action}_triggered`,
        message ? message.substring(0, 200) : `LinkedIn ${action} triggered`,
        JSON.stringify({ action, task_id, n8n_response: result }),
      ]
    );

    // Log to linkedin_activity table
    try {
      await query(
        `INSERT INTO crm.linkedin_activity
           (contact_id, action_type, status, message, n8n_execution_id, touchpoint_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          contact_id,
          action,
          response.ok ? 'sent' : 'failed',
          message || null,
          result.executionId || null,
          touchpointRows[0]?.touchpoint_id || null,
          JSON.stringify({ task_id, n8n_response: result }),
        ]
      );
    } catch {
      // linkedin_activity table may not exist yet (pre-migration)
    }

    return NextResponse.json({
      success: true,
      action,
      contact_id: contact.contact_id,
      linkedin_url: contact.linkedin_url,
      n8n_status: response.ok ? 'triggered' : 'failed',
    });
  } catch (error) {
    console.error('[linkedin] error:', error);
    // Still log the attempt
    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, body_preview, metadata, occurred_at)
       VALUES ($1, 'linkedin', $2, 'outbound', 'saleshub', 'LinkedIn trigger failed', $3, NOW())`,
      [contact_id, `${action}_failed`, JSON.stringify({ error: String(error), task_id })]
    );

    try {
      await query(
        `INSERT INTO crm.linkedin_activity
           (contact_id, action_type, status, message, metadata)
         VALUES ($1, $2, 'failed', $3, $4)`,
        [contact_id, action, message || null, JSON.stringify({ error: String(error), task_id })]
      );
    } catch {
      // pre-migration fallback
    }

    return NextResponse.json({ error: 'LinkedIn automation trigger failed' }, { status: 500 });
  }
}

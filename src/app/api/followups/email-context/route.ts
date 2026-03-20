import { NextRequest, NextResponse } from 'next/server';
import { queryDealsOne, queryDeals } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

/**
 * POST /api/followups/email-context
 * Fetch email history for a deal's contact from Gmail via n8n webhook.
 * Optionally stores the context in the deal record.
 * Body: { deal_id: string, store?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const body = await request.json();
    const { deal_id, store } = body as { deal_id: string; store?: boolean };

    if (!deal_id) {
      return NextResponse.json({ error: 'deal_id is required' }, { status: 400 });
    }

    // Get contact email from deal
    const deal = await queryDealsOne<{ contact_email: string; contact_name: string }>(
      `SELECT contact_email, contact_name FROM deals.deals WHERE deal_id = $1`,
      [deal_id],
    );

    if (!deal?.contact_email) {
      return NextResponse.json({ error: 'No contact email found for this deal' }, { status: 404 });
    }

    // Call n8n webhook to fetch email history from Gmail
    // n8n 2.x typeVersion 2 webhooks use path: /webhook/{workflowId}/webhook/{path}
    const n8nBase = process.env.N8N_BASE_URL || '';
    const emailContextWorkflowId = process.env.N8N_EMAIL_CONTEXT_WORKFLOW_ID || 'VG0KpWu437gYmVJS';
    const webhookUrl = `${n8nBase}/webhook/${emailContextWorkflowId}/webhook/email-context`;

    const n8nResponse = await fetchWithTimeout(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: deal.contact_email }),
      timeout: 30000,
    });

    // n8n returns 500 with "No item to return" when Gmail has no results — treat as empty
    let emailData: { email_count?: number; context_summary?: string; emails?: unknown[] } = {};
    if (n8nResponse.ok) {
      emailData = await n8nResponse.json();
    } else {
      const errBody = await n8nResponse.text();
      if (errBody.includes('No item to return')) {
        emailData = { email_count: 0, context_summary: '', emails: [] };
      } else {
        console.error('[email-context] n8n webhook failed:', n8nResponse.status, errBody);
        return NextResponse.json({ error: 'Failed to fetch email context' }, { status: 502 });
      }
    }

    // Store email context in deal record if requested
    if (store && emailData.context_summary) {
      await queryDeals(
        `UPDATE deals.deals SET action_items = COALESCE(action_items, '') || E'\n\n--- EMAIL HISTORY ---\n' || $1, updated_at = NOW() WHERE deal_id = $2`,
        [emailData.context_summary.substring(0, 5000), deal_id],
      );
    }

    // Log activity
    await queryDeals(
      `INSERT INTO deals.activity_log (deal_id, action_type, notes, created_at)
       VALUES ($1, 'email_context_fetched', $2, NOW())`,
      [deal_id, JSON.stringify({ email_count: emailData.email_count || 0 })],
    );

    return NextResponse.json({
      email_count: emailData.email_count || 0,
      context_summary: emailData.context_summary || '',
      emails: emailData.emails || [],
      contact_email: deal.contact_email,
    });
  } catch (error) {
    console.error('[followups/email-context] error:', error);
    return NextResponse.json({ error: 'Failed to fetch email context' }, { status: 500 });
  }
}

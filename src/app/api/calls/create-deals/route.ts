import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { queryDeals, queryDealsOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { N8N_WEBHOOK_KEY } from '@/lib/config';

/**
 * POST /api/calls/create-deals
 * Auto-create follow-up deals from recent Fathom calls that don't have matching deals yet.
 * This bridges the gap: calls sync into public.calls but Follow-Ups needs deals.deals records.
 *
 * Matching strategy:
 *   1. Check if a deal already exists for the external attendee email
 *   2. If not, create a new deal with Fathom data populated
 *   3. Optionally auto-generate campaigns for new deals
 *
 * Auth: session cookie OR x-webhook-key header (for n8n automation)
 *
 * Body params:
 *   - call_ids?: string[]    — specific call IDs to process (if omitted, finds all unmatched)
 *   - auto_generate?: boolean — auto-generate campaigns for new deals (default: true)
 *   - days?: number          — only look at calls within N days (default: 30)
 *   - org_id?: number        — required when using webhook key auth
 */
export async function POST(request: NextRequest) {
  try {
    let orgId: number;
    let userEmail: string;
    const webhookKey = request.headers.get('x-webhook-key');

    if (webhookKey === N8N_WEBHOOK_KEY) {
      // Webhook auth: get org_id from body or default
      const peekBody = await request.clone().json().catch(() => ({}));
      orgId = peekBody.org_id;
      if (!orgId) {
        const defaultOrg = await queryOne<{ org_id: number }>(
          `SELECT org_id FROM crm.organizations ORDER BY org_id LIMIT 1`
        );
        orgId = defaultOrg?.org_id || 1;
      }
      // Get owner email from org
      const orgOwner = await queryOne<{ email: string }>(
        `SELECT email FROM crm.users WHERE org_id = $1 AND role = 'admin' ORDER BY user_id LIMIT 1`,
        [orgId]
      );
      userEmail = orgOwner?.email || 'automation@saleshub.app';
    } else {
      const tenant = await requireTenantSession();
      orgId = tenant.org_id;
      userEmail = tenant.email;
    }

    const body = await request.json().catch(() => ({}));
    const { call_ids, auto_generate = true, days = 30 } = body as {
      call_ids?: string[];
      auto_generate?: boolean;
      days?: number;
    };

    // Ensure the calls table has a deal_id column for linking
    await ensureCallsDealIdColumn();

    // Find sales calls that don't have matching deals yet
    let unmatchedCalls;
    if (call_ids?.length) {
      unmatchedCalls = await query<CallRecord>(
        `SELECT call_id, title, call_date, owner_email, attendee_emails,
                fathom_summary, meeting_summary, action_items, topics_discussed,
                duration_seconds, fathom_url
         FROM public.calls
         WHERE call_id = ANY($1)
           AND org_id = $2
           AND call_type = 'sales'
           AND (deal_id IS NULL OR deal_id = '')`,
        [call_ids, orgId],
      );
    } else {
      // Find all recent sales calls not yet linked to deals
      unmatchedCalls = await query<CallRecord>(
        `SELECT c.call_id, c.title, c.call_date, c.owner_email, c.attendee_emails,
                c.fathom_summary, c.meeting_summary, c.action_items, c.topics_discussed,
                c.duration_seconds, c.fathom_url
         FROM public.calls c
         WHERE c.org_id = $1
           AND c.call_type = 'sales'
           AND (c.deal_id IS NULL OR c.deal_id = '')
           AND c.call_date >= NOW() - make_interval(days => $2)
         ORDER BY c.call_date DESC
         LIMIT 50`,
        [orgId, Math.min(days, 90)],
      );
    }

    if (unmatchedCalls.length === 0) {
      return NextResponse.json({ created: 0, deals: [], message: 'No unmatched sales calls found' });
    }

    const createdDeals: Array<{ deal_id: number; business_name: string; contact_email: string; call_id: string }> = [];
    const dealIdsForGeneration: number[] = [];

    for (const call of unmatchedCalls) {
      try {
        // Extract contact info from attendees (first non-org email)
        const attendees = call.attendee_emails || [];

        // Determine internal domain from the call's owner_email (the rep who ran the call)
        // This is more reliable than the logged-in user's domain since calls may be from different org
        let ownerEmailStr = call.owner_email || '';
        // Handle case where owner_email is a JSON string (some Fathom formats)
        if (ownerEmailStr.startsWith('{') || ownerEmailStr.startsWith('"')) {
          try {
            const parsed = JSON.parse(ownerEmailStr);
            ownerEmailStr = parsed.email || parsed || '';
          } catch { /* keep as-is */ }
        }
        const callOrgDomain = (ownerEmailStr.split('@')[1] || '').toLowerCase();
        // Fallback to logged-in user's domain if owner domain extraction fails
        const orgDomain = callOrgDomain || userEmail.split('@')[1] || '';
        const externalAttendees = attendees.filter(e => {
          const emailLower = e.toLowerCase();
          // Filter out internal org emails and common group/system emails
          if (orgDomain && emailLower.endsWith(`@${orgDomain}`)) return false;
          if (emailLower.includes('customer-success') || emailLower.includes('team@')) return false;
          return true;
        });
        const contactEmail = externalAttendees[0] || '';

        // Skip if no external attendee found (internal meeting that slipped through)
        if (!contactEmail) continue;

        // Check if a deal already exists for this contact email
        const existingDeal = await queryDealsOne<{ deal_id: number }>(
          `SELECT deal_id FROM deals.deals WHERE contact_email = $1 AND org_id = $2 LIMIT 1`,
          [contactEmail, orgId],
        );

        if (existingDeal) {
          // Link the call to the existing deal
          await query(
            `UPDATE public.calls SET deal_id = $1 WHERE call_id = $2`,
            [existingDeal.deal_id, call.call_id],
          ).catch(() => { /* deal_id column might not exist yet */ });
          continue;
        }

        // Parse business name from call title
        const businessName = parseBusinessName(call.title || '');
        const contactName = parseContactName(call.title || '', contactEmail);

        // Create the deal — deal_id is auto-increment integer
        // Only use columns that exist in the actual schema
        const insertResult = await queryDeals<{ deal_id: number }>(
          `INSERT INTO deals.deals (
            org_id, owner_email, contact_name, contact_email,
            business_name, pipeline_stage, urgency_level,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, 'demo_completed', 'medium',
            NOW(), NOW()
          ) RETURNING deal_id`,
          [
            orgId,
            ownerEmailStr || userEmail,
            contactName,
            contactEmail,
            businessName,
          ],
        );

        const dealId = insertResult[0]?.deal_id;
        if (!dealId) continue;

        // Link the call record to the new deal
        await query(
          `UPDATE public.calls SET deal_id = $1 WHERE call_id = $2`,
          [dealId, call.call_id],
        ).catch(() => { /* column might not exist, non-fatal */ });

        // Log activity
        await queryDeals(
          `INSERT INTO deals.activity_log (deal_id, action_type, notes, created_at)
           VALUES ($1, 'deal_created', $2, NOW())`,
          [dealId, `Auto-created from Fathom call: ${call.title || call.call_id}`],
        );

        createdDeals.push({
          deal_id: dealId,
          business_name: businessName,
          contact_email: contactEmail,
          call_id: call.call_id,
        });

        if (auto_generate) {
          dealIdsForGeneration.push(dealId);
        }
      } catch (err) {
        console.warn(`[create-deals] Error processing call ${call.call_id}:`, err);
      }
    }

    // Auto-generate campaigns for new deals
    const generatedCampaigns: number[] = [];
    if (auto_generate && dealIdsForGeneration.length > 0) {
      for (const dealId of dealIdsForGeneration) {
        try {
          const baseUrl = request.nextUrl.origin;
          const genRes = await fetch(`${baseUrl}/api/followups/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: request.headers.get('cookie') || '',
            },
            body: JSON.stringify({ deal_id: dealId }),
          });
          if (genRes.ok) {
            generatedCampaigns.push(dealId);
          } else {
            console.warn(`[create-deals] Campaign generation failed for ${dealId}:`, await genRes.text());
          }
        } catch (err) {
          console.warn(`[create-deals] Campaign generation error for ${dealId}:`, err);
        }
      }
    }

    return NextResponse.json({
      created: createdDeals.length,
      deals: createdDeals,
      campaigns_generated: generatedCampaigns.length,
      campaign_deal_ids: generatedCampaigns,
    });
  } catch (error) {
    console.error('[calls/create-deals] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create deals' },
      { status: 500 },
    );
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallRecord {
  call_id: string;
  title: string | null;
  call_date: string | null;
  owner_email: string | null;
  attendee_emails: string[] | null;
  fathom_summary: string | null;
  meeting_summary: string | null;
  action_items: string | null;
  topics_discussed: string[] | null;
  duration_seconds: number | null;
  fathom_url: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Ensure the public.calls table has a deal_id column for linking calls to deals.
 */
async function ensureCallsDealIdColumn() {
  try {
    await query(
      `ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS deal_id TEXT`,
      [],
    );
  } catch {
    // Column likely already exists or we don't have ALTER permission — non-fatal
  }
}

/**
 * Parse business name from Fathom call title.
 * Common patterns: "Demo with Pizza Palace", "Call - Sushi Express", "Mike <> Taco Bell"
 */
function parseBusinessName(title: string): string {
  if (!title) return 'Unknown Business';

  const cleaned = title
    .replace(/^(demo|call|meeting|intro|discovery|follow[- ]?up)\s*(with|[-–—:]|<>)\s*/i, '')
    .replace(/\s*(demo|call|meeting|intro|discovery)\s*$/i, '')
    .replace(/^[-–—:\s]+/, '')
    .trim();

  if (cleaned && cleaned.length > 1 && cleaned.length < 100) {
    return cleaned;
  }

  return title.substring(0, 100);
}

/**
 * Parse contact name from email address.
 */
function parseContactName(_title: string, email: string): string {
  const localPart = email.split('@')[0] || '';
  const nameFromEmail = localPart
    .replace(/[._-]/g, ' ')
    .replace(/\d+/g, '')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return nameFromEmail || 'Contact';
}

/**
 * Extract pain points from call topics and summary.
 */
function extractPainPoints(topics: string[], _summary: string): string[] {
  const points: string[] = [];

  const painKeywords = ['pain', 'challenge', 'problem', 'issue', 'concern', 'struggle', 'need', 'cost', 'delivery', 'order', 'staff', 'commission'];
  for (const topic of topics) {
    if (painKeywords.some(kw => topic.toLowerCase().includes(kw))) {
      points.push(topic);
    }
  }

  if (points.length === 0 && topics.length > 0) {
    points.push(...topics.slice(0, 5));
  }

  return points;
}

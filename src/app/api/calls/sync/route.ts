import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getOrgConfig, getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { requireTenantSession } from '@/lib/tenant';
import { N8N_WEBHOOK_KEY } from '@/lib/config';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

const FATHOM_API_URL = 'https://api.fathom.ai/external/v1/meetings';

/**
 * Fetch all meetings for a single Fathom API key.
 * Returns the raw meeting records from the Fathom API.
 */
async function fetchMeetingsForKey(
  apiKey: string,
  cutoffDate: Date | null,
): Promise<{ meetings: Record<string, unknown>[]; error?: string }> {
  const allMeetings: Record<string, unknown>[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 10; page++) {
    const fetchUrl: string = cursor
      ? `${FATHOM_API_URL}?cursor=${cursor}&include_transcript=true`
      : `${FATHOM_API_URL}?include_transcript=true`;

    const res = await fetchWithTimeout(fetchUrl, {
      headers: { 'X-Api-Key': apiKey },
      timeout: 30000,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[calls/sync] Fathom API error:', res.status, errText);
      return { meetings: allMeetings, error: `Fathom API returned ${res.status}` };
    }

    const data = await res.json();
    const items = data.items || data.recordings || data.data || [];

    if (!Array.isArray(items) || items.length === 0) break;

    allMeetings.push(...items);
    cursor = data.next_cursor || null;
    if (!cursor) break;
  }

  return { meetings: allMeetings };
}

/**
 * POST /api/calls/sync
 * Fetch recent meetings from Fathom API and upsert into public.calls.
 *
 * Supports multiple Fathom API keys for team-wide sync:
 * 1. Keys passed in request body: { api_keys: ["key1", "key2", ...] }
 * 2. Keys stored in org settings: settings.fathom_api_keys[]
 * 3. Fallback: FATHOM_API_KEY env var (single key, backward compatible)
 *
 * Body params:
 *   - days?: number          — limit sync to meetings within N days
 *   - api_keys?: string[]    — explicit list of Fathom API keys to sync
 *   - auto_mine?: boolean    — trigger brain mining after sync (default: false)
 */
export async function POST(request: NextRequest) {
  try {
    // Support both session auth (browser) and webhook key auth (n8n)
    let orgId: number;
    const webhookKey = request.headers.get('x-webhook-key');
    const isWebhook = webhookKey === N8N_WEBHOOK_KEY;

    if (isWebhook) {
      // Webhook auth: org_id must be in the request body
      // Parse body first to get org_id
      const body = await request.json().catch(() => ({}));
      orgId = body.org_id;
      if (!orgId) {
        // Default to org 1 for single-tenant setups
        const defaultOrg = await queryOne<{ org_id: number }>(
          `SELECT org_id FROM crm.organizations ORDER BY org_id LIMIT 1`
        );
        orgId = defaultOrg?.org_id || 1;
      }
      // Re-attach body for later parsing
      (request as NextRequest & { _parsedBody?: Record<string, unknown> })._parsedBody = body;
    } else {
      const tenant = await requireTenantSession();
      orgId = tenant.org_id;
    }

    // Parse request body
    let daysLimit: number | null = null;
    let requestApiKeys: string[] = [];
    let autoMine = false;

    try {
      const body = (request as NextRequest & { _parsedBody?: Record<string, unknown> })._parsedBody
        || await request.json();
      if (body.days && typeof body.days === 'number' && body.days > 0) {
        daysLimit = body.days;
      }
      if (Array.isArray(body.api_keys)) {
        requestApiKeys = body.api_keys.filter((k: unknown) => typeof k === 'string' && k.length > 0);
      }
      if (body.auto_mine === true) {
        autoMine = true;
      }
    } catch { /* no body or invalid JSON is fine */ }

    // Collect all API keys to sync from
    const apiKeys: string[] = [];

    // 1. Keys from request body
    if (requestApiKeys.length > 0) {
      apiKeys.push(...requestApiKeys);
    }

    // 2. Keys from org settings
    if (apiKeys.length === 0) {
      const orgSettings = await queryOne<{ settings: Record<string, unknown> }>(
        `SELECT settings FROM crm.organizations WHERE org_id = $1`,
        [orgId],
      );
      const storedKeys = (orgSettings?.settings?.fathom_api_keys as string[]) || [];
      if (Array.isArray(storedKeys)) {
        apiKeys.push(...storedKeys.filter(k => typeof k === 'string' && k.length > 0));
      }
    }

    // 3. Fallback to env var
    if (apiKeys.length === 0) {
      const envKey = process.env.FATHOM_API_KEY;
      if (envKey) apiKeys.push(envKey);
    }

    if (apiKeys.length === 0) {
      return NextResponse.json(
        { error: 'No Fathom API keys configured. Pass api_keys in body, store in org settings, or set FATHOM_API_KEY env var.' },
        { status: 500 },
      );
    }

    const cutoffDate = daysLimit ? new Date(Date.now() - daysLimit * 86400000) : null;

    const config = await getOrgConfig(orgId).catch(() => DEFAULT_CONFIG);
    const orgEmailDomain = (config.persona?.sender_email || '').split('@')[1] || '';

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFetched = 0;
    const keyResults: { key_index: number; fetched: number; inserted: number; updated: number; skipped: number; error?: string }[] = [];

    // Process each API key
    for (let ki = 0; ki < apiKeys.length; ki++) {
      const apiKey = apiKeys[ki];
      const { meetings, error } = await fetchMeetingsForKey(apiKey, cutoffDate);

      if (error) {
        keyResults.push({ key_index: ki, fetched: meetings.length, inserted: 0, updated: 0, skipped: 0, error });
        continue;
      }

      let inserted = 0;
      let updated = 0;
      let skipped = 0;

      for (const rec of meetings) {
        try {
          const callId = String(rec.id || rec.recording_id);

          // Skip meetings older than the cutoff date
          const meetingDate = (rec.created_at as string) || (rec.date as string) || null;
          if (cutoffDate && meetingDate && new Date(meetingDate) < cutoffDate) {
            skipped++;
            continue;
          }

          // Fathom uses calendar_invitees for attendee info
          const invitees = (rec.calendar_invitees || rec.attendees || []) as Array<{
            email?: string; name?: string;
          }>;
          const attendeeEmails = invitees
            .map(a => a.email)
            .filter(Boolean) as string[];

          const allInternal = attendeeEmails.length > 0 && orgEmailDomain &&
            attendeeEmails.every(email => email.toLowerCase().endsWith(`@${orgEmailDomain}`));

          const callType = allInternal ? 'internal' : 'sales';
          const ownerEmail = (rec.recorded_by as string) || (rec.owner_email as string) || null;
          const title = (rec.title as string) || (rec.name as string) || null;
          const callDate = (rec.created_at as string) || (rec.date as string) || null;
          const durationSeconds = (rec.duration as number) || (rec.duration_seconds as number) || 0;
          const fathomUrl = (rec.share_url as string) || (rec.fathom_url as string) || (rec.url as string) || null;

          // Fathom summary could be in different formats
          let fathomSummary: string | null = null;
          if (typeof rec.summary === 'string') {
            fathomSummary = rec.summary;
          } else if (rec.summary && typeof rec.summary === 'object') {
            fathomSummary = JSON.stringify(rec.summary);
          }

          // Action items from Fathom
          let actionItems: string | null = null;
          if (Array.isArray(rec.action_items)) {
            actionItems = (rec.action_items as string[]).join('\n');
          } else if (typeof rec.action_items === 'string') {
            actionItems = rec.action_items;
          }

          const rawTranscript = rec.transcript ? JSON.stringify(rec.transcript) : null;

          const result = await query(
            `INSERT INTO public.calls
              (call_id, owner_email, title, call_date, duration_seconds,
               attendee_emails, fathom_url, fathom_summary, action_items,
               raw_transcript, call_type, extraction_status, org_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, 'pending', $12, NOW())
             ON CONFLICT (call_id) DO UPDATE SET
               fathom_url = COALESCE(EXCLUDED.fathom_url, public.calls.fathom_url),
               fathom_summary = COALESCE(EXCLUDED.fathom_summary, public.calls.fathom_summary),
               action_items = COALESCE(EXCLUDED.action_items, public.calls.action_items),
               raw_transcript = COALESCE(EXCLUDED.raw_transcript, public.calls.raw_transcript)
             RETURNING (xmax = 0) AS is_insert`,
            [
              callId, ownerEmail, title, callDate, durationSeconds,
              attendeeEmails.length > 0 ? `{${attendeeEmails.join(',')}}` : null,
              fathomUrl, fathomSummary, actionItems, rawTranscript, callType, orgId,
            ],
          );

          if (result[0]?.is_insert) {
            inserted++;
          } else {
            updated++;
          }
        } catch (err) {
          console.warn('[calls/sync] skip recording:', err);
          skipped++;
        }
      }

      keyResults.push({
        key_index: ki,
        fetched: meetings.length,
        inserted,
        updated,
        skipped,
      });

      totalFetched += meetings.length;
      totalInserted += inserted;
      totalUpdated += updated;
      totalSkipped += skipped;
    }

    // Optionally trigger brain mining after sync
    let miningResult = null;
    if (autoMine && totalInserted > 0) {
      try {
        // Trigger mining for newly synced calls inline
        // (calls need to be processed first via /api/calls/process before mining)
        miningResult = { note: 'Run POST /api/calls/process then POST /api/brain/learn-from-calls to mine patterns from new calls.' };
      } catch {
        miningResult = { note: 'Auto-mine skipped due to error.' };
      }
    }

    // Auto-create follow-up deals from newly synced sales calls
    let dealsResult = null;
    if (totalInserted > 0 || totalUpdated > 0) {
      try {
        const baseUrl = request.nextUrl.origin;
        // Forward auth: use cookies for session auth, webhook key for n8n
        const authHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (isWebhook) {
          authHeaders['x-webhook-key'] = webhookKey!;
        } else {
          const cookie = request.headers.get('cookie');
          if (cookie) authHeaders['cookie'] = cookie;
        }
        const dealRes = await fetchWithTimeout(`${baseUrl}/api/calls/create-deals`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ auto_generate: true, days: 30, org_id: orgId }),
          timeout: 60000,
        });
        if (dealRes.ok) {
          dealsResult = await dealRes.json();
        } else {
          console.warn('[calls/sync] auto-create-deals failed:', dealRes.status);
        }
      } catch (err) {
        console.warn('[calls/sync] auto-create-deals error:', err);
      }
    }

    return NextResponse.json({
      keys_synced: apiKeys.length,
      total: totalFetched,
      inserted: totalInserted,
      updated: totalUpdated,
      skipped: totalSkipped,
      key_results: keyResults,
      ...(miningResult ? { mining: miningResult } : {}),
      ...(dealsResult ? { deals: dealsResult } : {}),
    });
  } catch (error) {
    console.error('[calls/sync] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const FATHOM_API_URL = 'https://api.fathom.ai/external/v1/meetings';

/**
 * POST /api/calls/sync
 * Fetch recent meetings from Fathom API and upsert into public.calls.
 * Requires FATHOM_API_KEY env var.
 */
export async function POST() {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'FATHOM_API_KEY not configured. Add it to .env.local' },
      { status: 500 },
    );
  }

  try {
    // Fetch recent meetings from Fathom (paginate to get more)
    let allMeetings: Record<string, unknown>[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 5; page++) {
      const fetchUrl: string = cursor
        ? `${FATHOM_API_URL}?cursor=${cursor}&include_transcript=true`
        : `${FATHOM_API_URL}?include_transcript=true`;

      const res = await fetch(fetchUrl, {
        headers: {
          'X-Api-Key': apiKey,
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('[calls/sync] Fathom API error:', res.status, errText);
        return NextResponse.json(
          { error: `Fathom API returned ${res.status}` },
          { status: 502 },
        );
      }

      const data = await res.json();
      const items = data.items || data.recordings || data.data || [];

      if (!Array.isArray(items) || items.length === 0) break;

      allMeetings = allMeetings.concat(items);
      cursor = data.next_cursor || null;
      if (!cursor) break;
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const rec of allMeetings) {
      try {
        const callId = String(rec.id || rec.recording_id);

        // Fathom uses calendar_invitees for attendee info
        const invitees = (rec.calendar_invitees || rec.attendees || []) as Array<{
          email?: string; name?: string;
        }>;
        const attendeeEmails = invitees
          .map(a => a.email)
          .filter(Boolean) as string[];

        const allInternal = attendeeEmails.length > 0 &&
          attendeeEmails.every(email => email.toLowerCase().endsWith('@shipday.com'));

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
             raw_transcript, call_type, extraction_status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, 'pending', NOW())
           ON CONFLICT (call_id) DO UPDATE SET
             fathom_url = COALESCE(EXCLUDED.fathom_url, public.calls.fathom_url),
             fathom_summary = COALESCE(EXCLUDED.fathom_summary, public.calls.fathom_summary),
             action_items = COALESCE(EXCLUDED.action_items, public.calls.action_items),
             raw_transcript = COALESCE(EXCLUDED.raw_transcript, public.calls.raw_transcript)
           RETURNING (xmax = 0) AS is_insert`,
          [
            callId, ownerEmail, title, callDate, durationSeconds,
            attendeeEmails.length > 0 ? `{${attendeeEmails.join(',')}}` : null,
            fathomUrl, fathomSummary, actionItems, rawTranscript, callType,
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

    return NextResponse.json({
      total: allMeetings.length,
      inserted,
      updated,
      skipped,
    });
  } catch (error) {
    console.error('[calls/sync] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}

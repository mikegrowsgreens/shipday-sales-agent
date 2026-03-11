import { NextRequest, NextResponse } from 'next/server';
import { query, queryShipday } from '@/lib/db';
import { preprocessEmail } from '@/lib/email-tracking';

/**
 * POST /api/followups/approve
 * Approve draft_ids -> create email_sends with tracking -> update status -> fire n8n webhook.
 * Accepts optional send_at (ISO timestamp) and deviation_minutes for scheduling.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { draft_ids, send_at, deviation_minutes, schedule_map } = body as {
      draft_ids: number[];
      send_at?: string;
      deviation_minutes?: number;
      schedule_map?: Record<string, string>;
    };

    if (!draft_ids?.length) {
      return NextResponse.json({ error: 'draft_ids required' }, { status: 400 });
    }

    const placeholders = draft_ids.map((_, i) => `$${i + 1}`).join(',');

    // Update status to approved
    await queryShipday(
      `UPDATE shipday.email_drafts SET status = 'approved', approved_at = NOW(), updated_at = NOW()
       WHERE id IN (${placeholders})`,
      draft_ids,
    );

    // Get approved drafts with deal info
    const approvedDrafts = await queryShipday<{
      id: number;
      deal_id: string;
      touch_number: number;
      subject: string;
      body_html: string;
      body_plain: string;
      contact_email: string;
      contact_name: string;
      business_name: string;
    }>(
      `SELECT ed.id, ed.deal_id, ed.touch_number, ed.subject,
              COALESCE(ed.body_html, '') as body_html,
              COALESCE(ed.body_plain, '') as body_plain,
              d.contact_email, d.contact_name, d.business_name
       FROM shipday.email_drafts ed
       JOIN shipday.deals d ON d.deal_id = ed.deal_id
       WHERE ed.id IN (${placeholders})`,
      draft_ids,
    );

    // Compute per-draft send times with deviation based on touch_number
    const computeDraftSendAt = (touchNumber: number): string | undefined => {
      if (!send_at) return undefined;
      const base = new Date(send_at);

      if (touchNumber > 1) {
        const daySpacing = [0, 2, 4, 7, 10, 14, 21];
        const daysOut = daySpacing[Math.min(touchNumber - 1, daySpacing.length - 1)] || (touchNumber - 1) * 3;
        base.setDate(base.getDate() + daysOut);
      }

      if (deviation_minutes && deviation_minutes > 0) {
        const deviationMs = deviation_minutes * 60 * 1000;
        const offset = (Math.random() * 2 - 1) * deviationMs;
        base.setTime(base.getTime() + offset);
      }

      return base.toISOString();
    };

    // Update scheduled_at for each draft — use per-draft schedule_map if provided, else compute from base send_at
    for (const draft of approvedDrafts) {
      let scheduledAt: string | undefined;

      if (schedule_map && schedule_map[String(draft.id)]) {
        scheduledAt = schedule_map[String(draft.id)];
      } else if (send_at) {
        scheduledAt = computeDraftSendAt(draft.touch_number);
      }

      if (scheduledAt) {
        await queryShipday(
          `UPDATE shipday.email_drafts SET scheduled_at = $1, updated_at = NOW() WHERE id = $2`,
          [scheduledAt, draft.id],
        );
      }
    }

    // Fire n8n webhook with tracking-enhanced email for each draft
    const webhookUrl = `${process.env.N8N_BASE_URL || 'https://automation.mikegrowsgreens.com'}/webhook/followup-send-approved`;

    for (const draft of approvedDrafts) {
      const draftSendAt = schedule_map?.[String(draft.id)] || computeDraftSendAt(draft.touch_number);

      try {
        // Create email_sends record for tracking (uses wincall_brain DB / bdr schema)
        // We need a lead_id — look up by contact_email
        const leadRow = await query<{ lead_id: number }>(
          `SELECT lead_id FROM bdr.leads WHERE contact_email = $1 LIMIT 1`,
          [draft.contact_email]
        );
        const leadId = leadRow[0]?.lead_id;

        let sendId: string | undefined;
        if (leadId) {
          const sendRows = await query<{ id: string }>(
            `INSERT INTO bdr.email_sends (lead_id, to_email, from_email, subject, body, angle, email_type, created_at)
             VALUES ($1, $2, 'mike@mikegrowsgreens.com', $3, $4, 'followup', 'followup_touch', NOW())
             RETURNING id`,
            [leadId, draft.contact_email, draft.subject, draft.body_plain]
          );
          sendId = sendRows[0]?.id;
        }

        // Preprocess email with tracking
        const emailContent = draft.body_html || draft.body_plain;
        const isHtml = !!draft.body_html;
        const trackedHtml = sendId
          ? preprocessEmail(emailContent, sendId, isHtml)
          : emailContent;

        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft_id: draft.id,
            deal_id: draft.deal_id,
            touch_number: draft.touch_number,
            to: draft.contact_email,
            subject: draft.subject,
            body_html: trackedHtml,
            body_plain: draft.body_plain,
            contact_name: draft.contact_name,
            business_name: draft.business_name,
            ...(sendId && { send_id: sendId }),
            ...(leadId && { lead_id: leadId }),
            ...(draftSendAt && { send_at: draftSendAt }),
          }),
        });
      } catch (err) {
        console.error(`[followups/approve] webhook failed for draft ${draft.id}:`, err);
      }
    }

    // Log activity for each deal and check if all drafts are now approved/sent
    const dealIds = [...new Set(approvedDrafts.map(d => d.deal_id))];
    for (const dealId of dealIds) {
      const touchNumbers = approvedDrafts
        .filter(d => d.deal_id === dealId)
        .map(d => d.touch_number);

      await queryShipday(
        `INSERT INTO shipday.activity_log (deal_id, action_type, notes, created_at)
         VALUES ($1, 'drafts_approved', $2, NOW())`,
        [dealId, JSON.stringify({ touch_numbers: touchNumbers, send_at, deviation_minutes })],
      );

      // Check if all drafts for this deal are now approved or sent
      const remaining = await queryShipday<{ cnt: string }>(
        `SELECT COUNT(*) as cnt FROM shipday.email_drafts
         WHERE deal_id = $1 AND status = 'draft'`,
        [dealId],
      );
      const pendingCount = parseInt(remaining[0]?.cnt || '0');
      if (pendingCount === 0) {
        await queryShipday(
          `UPDATE shipday.deals SET agent_status = 'completed', updated_at = NOW() WHERE deal_id = $1`,
          [dealId],
        );
      }
    }

    return NextResponse.json({
      approved: draft_ids.length,
      ...(send_at && { scheduled_send_at: send_at, deviation_minutes }),
    });
  } catch (error) {
    console.error('[followups/approve] error:', error);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }
}

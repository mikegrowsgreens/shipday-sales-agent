import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { preprocessEmail } from '@/lib/email-tracking';

/**
 * POST /api/bdr/campaigns/action
 * Approve, reject, or hold leads.
 * On approve: creates email_sends record with tracking, preprocesses email,
 * fires n8n webhook to send via Gmail.
 * After sending, auto-schedules the next campaign step if one exists.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lead_ids, action, send_at, deviation_minutes } = body as {
      lead_ids: number[];
      action: 'approve' | 'reject' | 'hold';
      send_at?: string;
      deviation_minutes?: number;
    };

    if (!lead_ids?.length || !action) {
      return NextResponse.json({ error: 'lead_ids and action required' }, { status: 400 });
    }

    if (!['approve', 'reject', 'hold'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Use: approve, reject, hold' }, { status: 400 });
    }

    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      hold: 'hold',
    };

    const newStatus = statusMap[action];
    const placeholders = lead_ids.map((_, i) => `$${i + 2}`).join(',');

    // Update lead statuses
    await query(
      `UPDATE bdr.leads SET status = $1, updated_at = NOW() WHERE lead_id IN (${placeholders})`,
      [newStatus, ...lead_ids]
    );

    let stepsScheduled = 0;

    // On approve: create email_sends records, preprocess with tracking, fire webhook
    if (action === 'approve') {
      const approvedPlaceholders = lead_ids.map((_: number, i: number) => `$${i + 1}`).join(',');
      const approvedLeads = await query<{
        lead_id: number;
        contact_email: string;
        contact_name: string;
        business_name: string;
        email_subject: string;
        email_body: string;
        email_angle: string;
        campaign_template_id: number | null;
        campaign_step: number | null;
      }>(
        `SELECT lead_id, contact_email, contact_name, business_name,
                email_subject, email_body, email_angle,
                campaign_template_id, campaign_step
         FROM bdr.leads WHERE lead_id IN (${approvedPlaceholders})`,
        lead_ids
      );

      const webhookUrl = `${process.env.N8N_BASE_URL || 'https://automation.mikegrowsgreens.com'}/webhook/dashboard-send-approved`;

      // Compute per-lead send times with deviation
      const computeLeadSendAt = (): string | undefined => {
        if (!send_at) return undefined;
        const base = new Date(send_at);
        if (deviation_minutes && deviation_minutes > 0) {
          const deviationMs = deviation_minutes * 60 * 1000;
          const offset = (Math.random() * 2 - 1) * deviationMs;
          base.setTime(base.getTime() + offset);
        }
        return base.toISOString();
      };

      for (const lead of approvedLeads) {
        const leadSendAt = computeLeadSendAt();

        try {
          // Create email_sends record (returns the UUID we use for tracking)
          const sendRows = await query<{ id: string }>(
            `INSERT INTO bdr.email_sends (lead_id, to_email, from_email, subject, body, angle, email_type, created_at)
             VALUES ($1, $2, 'mike@mikegrowsgreens.com', $3, $4, $5, 'bdr_outbound', NOW())
             RETURNING id`,
            [lead.lead_id, lead.contact_email, lead.email_subject, lead.email_body, lead.email_angle]
          );

          const sendId = sendRows[0]?.id;
          if (!sendId) continue;

          // Preprocess email with tracking pixel + link rewriting
          const trackedHtml = preprocessEmail(lead.email_body, sendId, false);

          // Fire webhook with tracking-enhanced email
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              send_id: sendId,
              lead_id: lead.lead_id,
              to: lead.contact_email,
              subject: lead.email_subject,
              body_html: trackedHtml,
              body_plain: lead.email_body,
              contact_name: lead.contact_name,
              business_name: lead.business_name,
              angle: lead.email_angle,
              campaign_step: lead.campaign_step || 1,
              ...(leadSendAt && { send_at: leadSendAt }),
            }),
          });

          // ── Campaign Step Advancement ──
          // If this lead has a campaign template, mark current step as sent
          // and schedule the next step
          if (lead.campaign_template_id && lead.campaign_step) {
            // Mark current campaign email as sent
            await query(
              `UPDATE bdr.campaign_emails
               SET status = 'sent', send_id = $1::uuid, sent_at = NOW(), updated_at = NOW()
               WHERE lead_id = $2 AND template_id = $3 AND step_number = $4 AND status IN ('ready', 'scheduled')`,
              [sendId, lead.lead_id, lead.campaign_template_id, lead.campaign_step]
            );

            // Find and schedule the next step
            const nextStep = await query<{ id: number; delay_days: number; step_number: number }>(
              `SELECT id, delay_days, step_number FROM bdr.campaign_emails
               WHERE lead_id = $1 AND template_id = $2 AND step_number = $3 AND status = 'pending'`,
              [lead.lead_id, lead.campaign_template_id, lead.campaign_step + 1]
            );

            if (nextStep.length > 0) {
              const next = nextStep[0];
              await query(
                `UPDATE bdr.campaign_emails
                 SET status = 'scheduled',
                     scheduled_at = NOW() + INTERVAL '1 day' * $2,
                     updated_at = NOW()
                 WHERE id = $1`,
                [next.id, next.delay_days]
              );
              stepsScheduled++;
            }
          }
        } catch (err) {
          console.error(`[bdr-action] webhook failed for lead ${lead.lead_id}:`, err);
        }
      }

      // Log touchpoints for CRM contacts linked to these leads
      for (const lead of approvedLeads) {
        await query(
          `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
           SELECT c.contact_id, 'email', 'approved', 'outbound', 'bdr',
                  $2, jsonb_build_object('lead_id', $3, 'angle', $4), NOW()
           FROM crm.contacts c WHERE c.bdr_lead_id = $1::text`,
          [lead.lead_id, lead.email_subject, lead.lead_id, lead.email_angle]
        );
      }
    }

    // On reject: skip all pending campaign steps for these leads
    if (action === 'reject') {
      for (const leadId of lead_ids) {
        await query(
          `UPDATE bdr.campaign_emails
           SET status = 'skipped', updated_at = NOW()
           WHERE lead_id = $1 AND status IN ('pending', 'scheduled', 'ready')`,
          [leadId]
        );
      }
    }

    return NextResponse.json({
      updated: lead_ids.length,
      action,
      status: newStatus,
      ...(stepsScheduled > 0 && { next_steps_scheduled: stepsScheduled }),
      ...(send_at && { scheduled_send_at: send_at }),
    });
  } catch (error) {
    console.error('[bdr-action] error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}

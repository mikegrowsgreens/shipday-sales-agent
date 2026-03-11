import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateReplyResponse } from '@/lib/ai';
import { N8N_WEBHOOK_KEY } from '@/lib/config';

/**
 * POST /api/track/replies
 * Webhook from n8n Gmail Reply Poller.
 * Receives detected replies and:
 *   1. Updates email_sends + creates events
 *   2. Auto-pauses all remaining campaign steps for the lead
 *   3. Creates a high-priority task in the task queue
 *   4. Generates AI-suggested response with sentiment analysis
 *
 * Auth: webhook key via x-webhook-key header
 * Body: { replies: [{ send_id, lead_id, gmail_thread_id, snippet, from_email, replied_at }] }
 */
export async function POST(request: NextRequest) {
  const webhookKey = request.headers.get('x-webhook-key');
  if (webhookKey !== N8N_WEBHOOK_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { replies } = body as {
      replies: {
        send_id?: string;
        lead_id?: number;
        gmail_thread_id?: string;
        snippet?: string;
        from_email?: string;
        replied_at?: string;
      }[];
    };

    if (!replies?.length) {
      return NextResponse.json({ error: 'replies array required' }, { status: 400 });
    }

    let processed = 0;
    const campaignsPaused: number[] = [];
    const tasksCreated: number[] = [];

    for (const reply of replies) {
      try {
        // ─── Find the email_sends record ──────────────────────────────────
        let sendId = reply.send_id;

        if (!sendId && reply.gmail_thread_id) {
          const row = await query<{ id: string }>(
            `SELECT id FROM bdr.email_sends WHERE gmail_thread_id = $1 LIMIT 1`,
            [reply.gmail_thread_id]
          );
          sendId = row[0]?.id;
        }

        if (!sendId && reply.lead_id) {
          const row = await query<{ id: string }>(
            `SELECT id FROM bdr.email_sends WHERE lead_id = $1 ORDER BY sent_at DESC LIMIT 1`,
            [reply.lead_id]
          );
          sendId = row[0]?.id;
        }

        if (!sendId) {
          console.warn('[track/replies] could not find send for reply:', reply);
          continue;
        }

        // ─── Update email_sends ───────────────────────────────────────────
        await query(
          `UPDATE bdr.email_sends
           SET replied = true,
               reply_at = COALESCE(reply_at, $2::timestamptz),
               reply_classification = 'reply'
           WHERE id = $1 AND replied = false`,
          [sendId, reply.replied_at || new Date().toISOString()]
        );

        // ─── Get lead data for context ────────────────────────────────────
        let leadId = reply.lead_id;
        if (!leadId) {
          const sendRow = await query<{ lead_id: number }>(
            `SELECT lead_id FROM bdr.email_sends WHERE id = $1`,
            [sendId]
          );
          leadId = sendRow[0]?.lead_id;
        }

        interface LeadContext {
          lead_id: number;
          business_name: string | null;
          contact_name: string | null;
          contact_email: string | null;
          tier: string | null;
          total_score: number | null;
          campaign_template_id: number | null;
          campaign_step: number | null;
          email_subject: string | null;
          email_angle: string | null;
        }

        let leadData: LeadContext | null = null;

        if (leadId) {
          const rows = await query<LeadContext>(
            `SELECT lead_id, business_name, contact_name, contact_email, tier,
                    total_score, campaign_template_id, campaign_step,
                    email_subject, email_angle
             FROM bdr.leads WHERE lead_id = $1`,
            [leadId]
          );
          leadData = rows[0] || null;
        }

        // ─── Update lead status + reply fields ────────────────────────────
        if (leadId) {
          await query(
            `UPDATE bdr.leads
             SET status = 'replied',
                 has_replied = true,
                 reply_date = COALESCE($2::timestamptz, NOW()),
                 reply_summary = LEFT($3, 500),
                 updated_at = NOW()
             WHERE lead_id = $1 AND status IN ('sent', 'approved', 'email_ready')`,
            [leadId, reply.replied_at || new Date().toISOString(), reply.snippet || '']
          );
        }

        // ─── Insert event ─────────────────────────────────────────────────
        await query(
          `INSERT INTO bdr.email_events (lead_id, event_type, event_at, to_email, from_email, metadata)
           SELECT es.lead_id, 'reply', $2::timestamptz,
                  es.to_email, $3,
                  jsonb_build_object(
                    'send_id', $1,
                    'snippet', LEFT($4, 500),
                    'gmail_thread_id', $5
                  )
           FROM bdr.email_sends es WHERE es.id = $1`,
          [sendId, reply.replied_at || new Date().toISOString(), reply.from_email || '', reply.snippet || '', reply.gmail_thread_id || '']
        );

        // ═══════════════════════════════════════════════════════════════════
        // AUTO-PAUSE: Skip all remaining campaign steps for this lead
        // ═══════════════════════════════════════════════════════════════════
        if (leadId) {
          const pauseResult = await query<{ id: number }>(
            `UPDATE bdr.campaign_emails
             SET status = 'skipped', updated_at = NOW()
             WHERE lead_id = $1
               AND status IN ('pending', 'scheduled', 'ready')
             RETURNING id`,
            [leadId]
          );

          if (pauseResult.length > 0) {
            campaignsPaused.push(leadId);
            console.log(`[track/replies] Auto-paused ${pauseResult.length} campaign steps for lead ${leadId}`);
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // AI RESPONSE: Generate suggested reply + sentiment analysis
        // ═══════════════════════════════════════════════════════════════════
        let aiSuggestion: { subject: string; body: string; sentiment: string; summary: string } | null = null;

        if (reply.snippet && leadData) {
          try {
            aiSuggestion = await generateReplyResponse({
              business_name: leadData.business_name || 'Unknown Business',
              contact_name: leadData.contact_name || 'Restaurant Owner',
              reply_snippet: reply.snippet,
              original_subject: leadData.email_subject || undefined,
              original_angle: leadData.email_angle || undefined,
              lead_tier: leadData.tier || undefined,
              total_score: leadData.total_score,
            });

            // Update lead with AI-analyzed sentiment
            await query(
              `UPDATE bdr.leads
               SET reply_sentiment = $2,
                   reply_summary = $3,
                   updated_at = NOW()
               WHERE lead_id = $1`,
              [leadId, aiSuggestion.sentiment, aiSuggestion.summary]
            );
          } catch (aiErr) {
            console.error(`[track/replies] AI response generation failed for lead ${leadId}:`, aiErr);
            // Non-blocking: continue without AI suggestion
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // TASK CREATION: Create high-priority task in queue
        // ═══════════════════════════════════════════════════════════════════
        if (leadId && leadData) {
          try {
            // Find or create a CRM contact linked to this BDR lead
            let contactId: number | null = null;

            // First: look for existing contact by bdr_lead_id
            const existingContact = await query<{ contact_id: number }>(
              `SELECT contact_id FROM crm.contacts WHERE bdr_lead_id = $1::text LIMIT 1`,
              [leadId]
            );

            if (existingContact.length > 0) {
              contactId = existingContact[0].contact_id;
            } else {
              // Also try by email match
              if (leadData.contact_email) {
                const emailContact = await query<{ contact_id: number }>(
                  `SELECT contact_id FROM crm.contacts WHERE email = $1 LIMIT 1`,
                  [leadData.contact_email]
                );
                if (emailContact.length > 0) {
                  contactId = emailContact[0].contact_id;
                  // Link this contact to the BDR lead
                  await query(
                    `UPDATE crm.contacts SET bdr_lead_id = $1::text, updated_at = NOW() WHERE contact_id = $2`,
                    [leadId, contactId]
                  );
                }
              }

              // Create contact if none found
              if (!contactId) {
                const nameParts = (leadData.contact_name || '').split(' ');
                const firstName = nameParts[0] || null;
                const lastName = nameParts.slice(1).join(' ') || null;

                const newContact = await query<{ contact_id: number }>(
                  `INSERT INTO crm.contacts (email, first_name, last_name, business_name, lifecycle_stage, bdr_lead_id, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, 'engaged', $5::text, NOW(), NOW())
                   RETURNING contact_id`,
                  [leadData.contact_email, firstName, lastName, leadData.business_name, leadId]
                );
                contactId = newContact[0]?.contact_id;
              }
            }

            if (contactId) {
              // Build task instructions with AI suggestion
              let instructions = `Reply received from ${leadData.contact_name || reply.from_email || 'prospect'}`;
              instructions += `\nBusiness: ${leadData.business_name || 'Unknown'}`;
              instructions += `\n\n--- REPLY SNIPPET ---\n${(reply.snippet || '').substring(0, 500)}`;

              if (aiSuggestion) {
                instructions += `\n\n--- AI ANALYSIS ---`;
                instructions += `\nSentiment: ${aiSuggestion.sentiment}`;
                instructions += `\nSummary: ${aiSuggestion.summary}`;
                instructions += `\n\n--- SUGGESTED RESPONSE ---`;
                instructions += `\nSubject: ${aiSuggestion.subject}`;
                instructions += `\n\n${aiSuggestion.body}`;
              }

              const taskResult = await query<{ task_id: number }>(
                `INSERT INTO crm.task_queue (contact_id, task_type, title, instructions, priority, status, due_at, created_at)
                 VALUES ($1, 'email_review', $2, $3, 0, 'pending', NOW(), NOW())
                 RETURNING task_id`,
                [
                  contactId,
                  `REPLY: ${leadData.contact_name || 'Prospect'} @ ${leadData.business_name || 'Unknown'} — ${aiSuggestion?.sentiment || 'new reply'}`,
                  instructions,
                ]
              );

              if (taskResult[0]?.task_id) {
                tasksCreated.push(taskResult[0].task_id);
              }

              // Log touchpoint
              await query(
                `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, body_preview, metadata, occurred_at)
                 VALUES ($1, 'email', 'reply_received', 'inbound', 'bdr', $2, LEFT($3, 200), $4, $5::timestamptz)`,
                [
                  contactId,
                  leadData.email_subject || 'Reply',
                  reply.snippet || '',
                  JSON.stringify({
                    lead_id: leadId,
                    send_id: sendId,
                    sentiment: aiSuggestion?.sentiment || null,
                    campaign_paused: campaignsPaused.includes(leadId),
                  }),
                  reply.replied_at || new Date().toISOString(),
                ]
              );
            }
          } catch (taskErr) {
            console.error(`[track/replies] Task/contact creation failed for lead ${leadId}:`, taskErr);
            // Non-blocking: reply is still recorded even if task creation fails
          }
        }

        processed++;
      } catch (err) {
        console.error('[track/replies] error processing reply:', err);
      }
    }

    return NextResponse.json({
      processed,
      total: replies.length,
      campaigns_paused: campaignsPaused.length,
      tasks_created: tasksCreated.length,
      campaign_paused_lead_ids: campaignsPaused,
      task_ids: tasksCreated,
    });
  } catch (error) {
    console.error('[track/replies] error:', error);
    return NextResponse.json({ error: 'Failed to process replies' }, { status: 500 });
  }
}
